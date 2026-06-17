import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { paginatedResult, parsePagination } from '../../common/utils/pagination';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';
import { AuditAction, CustomerStatus } from '@prisma/client';

@Injectable()
export class VendorsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateVendorDto, userId: string) {
    const vendor = await this.prisma.vendor.create({ data: dto });
    await this.audit.log({
      entityType: 'Vendor',
      entityId: vendor.id,
      action: AuditAction.CREATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });
    return vendor;
  }

  findAll(options: {
    search?: string;
    status?: CustomerStatus;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { companyName: { contains: term, mode: 'insensitive' } },
        { contactPerson: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const include = { _count: { select: { inventoryItems: true } } };

    if (options.page === undefined && options.limit === undefined) {
      return this.prisma.vendor.findMany({
        where: where as never,
        include,
        orderBy: { createdAt: 'desc' },
      });
    }

    const { page, limit, skip } = parsePagination(options.page, options.limit);

    return Promise.all([
      this.prisma.vendor.count({ where: where as never }),
      this.prisma.vendor.findMany({
        where: where as never,
        include,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]).then(([total, data]) => paginatedResult(data, total, page, limit));
  }

  async findOne(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        _count: { select: { inventoryItems: true } },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async update(id: string, dto: UpdateVendorDto, userId: string) {
    await this.findOne(id);
    const vendor = await this.prisma.vendor.update({ where: { id }, data: dto });
    await this.audit.log({
      entityType: 'Vendor',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });
    return vendor;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.vendor.delete({ where: { id } });
    await this.audit.log({
      entityType: 'Vendor',
      entityId: id,
      action: AuditAction.DELETE,
      userId,
    });
    return { message: 'Vendor deleted' };
  }
}

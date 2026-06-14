import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { paginatedResult, parsePagination } from '../../common/utils/pagination';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { AuditAction, CustomerStatus, ProjectStatus } from '@prisma/client';

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateCustomerDto, userId: string) {
    const customer = await this.prisma.customer.create({ data: dto });
    await this.audit.log({
      entityType: 'Customer',
      entityId: customer.id,
      action: AuditAction.CREATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });
    return customer;
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

    const include = { _count: { select: { projects: { where: { status: ProjectStatus.ACTIVE } } } } };

    if (options.page === undefined && options.limit === undefined) {
      return this.prisma.customer.findMany({
        where: where as never,
        include,
        orderBy: { createdAt: 'desc' },
      });
    }

    const { page, limit, skip } = parsePagination(options.page, options.limit);

    return Promise.all([
      this.prisma.customer.count({ where: where as never }),
      this.prisma.customer.findMany({
        where: where as never,
        include,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]).then(([total, data]) => paginatedResult(data, total, page, limit));
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        opportunities: { take: 5, orderBy: { createdAt: 'desc' } },
        projects: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, userId: string) {
    await this.findOne(id);
    const customer = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.log({
      entityType: 'Customer',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });
    return customer;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.customer.delete({ where: { id } });
    await this.audit.log({
      entityType: 'Customer',
      entityId: id,
      action: AuditAction.DELETE,
      userId,
    });
    return { message: 'Customer deleted' };
  }
}

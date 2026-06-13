import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { AuditAction } from '@prisma/client';

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

  findAll(search?: string, status?: string) {
    return this.prisma.customer.findMany({
      where: {
        ...(status && { status: status as never }),
        ...(search && {
          OR: [
            { companyName: { contains: search, mode: 'insensitive' } },
            { contactPerson: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      include: { _count: { select: { projects: { where: { status: 'ACTIVE' } } } } },
      orderBy: { createdAt: 'desc' },
    });
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

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { paginatedResult, parsePagination } from '../../common/utils/pagination';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { AuditAction, RoleName } from '@prisma/client';

const EXPENSE_ASSIGN_ROLES: RoleName[] = [RoleName.ADMIN, RoleName.FINANCE, RoleName.PROJECT_MANAGER];

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateEmployeeDto, userId: string) {
    if (dto.userId) {
      const linked = await this.prisma.employee.findUnique({ where: { userId: dto.userId } });
      if (linked) throw new BadRequestException('This user already has an employee profile');
    }

    const employee = await this.prisma.employee.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email?.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        department: dto.department?.trim(),
        designation: dto.designation?.trim(),
        userId: dto.userId,
      },
    });

    await this.audit.log({
      entityType: 'Employee',
      entityId: employee.id,
      action: AuditAction.CREATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });

    return employee;
  }

  findAll(options: {
    search?: string;
    activeOnly?: boolean;
    inactiveOnly?: boolean;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {};

    if (options.activeOnly) {
      where.isActive = true;
    } else if (options.inactiveOnly) {
      where.isActive = false;
    }

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { department: { contains: term, mode: 'insensitive' } },
        { designation: { contains: term, mode: 'insensitive' } },
      ];
    }

    const include = {
      user: { select: { id: true, email: true, role: true } },
    };

    if (options.page === undefined && options.limit === undefined) {
      return this.prisma.employee.findMany({
        where: where as never,
        include,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    }

    const { page, limit, skip } = parsePagination(options.page, options.limit);

    return Promise.all([
      this.prisma.employee.count({ where: where as never }),
      this.prisma.employee.findMany({
        where: where as never,
        include,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip,
        take: limit,
      }),
    ]).then(([total, data]) => paginatedResult(data, total, page, limit));
  }

  findActiveLookup() {
    return this.prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, department: true, designation: true, userId: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, role: true } } },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto, userId: string) {
    await this.findOne(id);

    if (dto.userId) {
      const linked = await this.prisma.employee.findFirst({
        where: { userId: dto.userId, NOT: { id } },
      });
      if (linked) throw new BadRequestException('This user already has an employee profile');
    }

    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        ...dto,
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
        email: dto.email?.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        department: dto.department?.trim(),
        designation: dto.designation?.trim(),
      },
    });

    await this.audit.log({
      entityType: 'Employee',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });

    return employee;
  }

  async resolveEmployeeId(
    requestedEmployeeId: string | undefined,
    userId: string,
    userRole: string,
  ): Promise<string> {
    const canAssign = EXPENSE_ASSIGN_ROLES.includes(userRole as RoleName);

    if (requestedEmployeeId) {
      if (!canAssign) {
        const own = await this.prisma.employee.findFirst({
          where: { userId, isActive: true },
          select: { id: true },
        });
        if (!own || own.id !== requestedEmployeeId) {
          throw new ForbiddenException('You can only create expenses for yourself');
        }
        return requestedEmployeeId;
      }

      const employee = await this.prisma.employee.findFirst({
        where: { id: requestedEmployeeId, isActive: true },
        select: { id: true },
      });
      if (!employee) throw new BadRequestException('Invalid employee selected');
      return requestedEmployeeId;
    }

    const own = await this.prisma.employee.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });
    if (!own) {
      throw new BadRequestException(
        'No employee profile is linked to your account. Ask admin to add you under Employees.',
      );
    }
    return own.id;
  }
}

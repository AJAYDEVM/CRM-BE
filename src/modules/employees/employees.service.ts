import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
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
    if (dto.password && !dto.email?.trim()) {
      throw new BadRequestException('Email is required when setting a login password');
    }

    if (dto.password && dto.email?.trim()) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email.trim().toLowerCase() },
      });
      if (existingUser) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    if (dto.userId) {
      const linked = await this.prisma.employee.findUnique({ where: { userId: dto.userId } });
      if (linked) throw new BadRequestException('This user already has an employee profile');
    }

    const employee = await this.prisma.$transaction(async (tx) => {
      let linkedUserId = dto.userId;

      if (dto.password && dto.email?.trim()) {
        const passwordHash = await bcrypt.hash(dto.password, 12);
        const user = await tx.user.create({
          data: {
            email: dto.email.trim().toLowerCase(),
            passwordHash,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            role: RoleName.ENGINEER,
          },
        });
        linkedUserId = user.id;
      }

      return tx.employee.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email: dto.email?.trim().toLowerCase(),
          phone: dto.phone?.trim(),
          department: dto.department?.trim(),
          designation: dto.designation?.trim(),
          userId: linkedUserId,
        },
        include: { user: { select: { id: true, email: true, role: true } } },
      });
    });

    const { password: _password, ...auditChanges } = dto as CreateEmployeeDto & { password?: string };
    await this.audit.log({
      entityType: 'Employee',
      entityId: employee.id,
      action: AuditAction.CREATE,
      userId,
      changes: auditChanges as unknown as Record<string, unknown>,
      metadata: dto.password
        ? { description: `Created employee with system login for ${employee.email}` }
        : undefined,
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
    const existing = await this.findOne(id);
    const { password, ...employeeFields } = dto;

    if (password && !dto.email?.trim() && !existing.email) {
      throw new BadRequestException('Email is required when setting a login password');
    }

    const email = (dto.email?.trim().toLowerCase() ?? existing.email)?.trim();
    if (password && email) {
      const conflict = await this.prisma.user.findFirst({
        where: existing.userId
          ? { email, NOT: { id: existing.userId } }
          : { email },
      });
      if (conflict) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    if (employeeFields.userId) {
      const linked = await this.prisma.employee.findFirst({
        where: { userId: employeeFields.userId, NOT: { id } },
      });
      if (linked) throw new BadRequestException('This user already has an employee profile');
    }

    const employee = await this.prisma.$transaction(async (tx) => {
      let linkedUserId = employeeFields.userId ?? existing.userId;

      if (password && email) {
        if (existing.userId) {
          await tx.user.update({
            where: { id: existing.userId },
            data: { passwordHash: await bcrypt.hash(password, 12) },
          });
        } else {
          const user = await tx.user.create({
            data: {
              email,
              passwordHash: await bcrypt.hash(password, 12),
              firstName: (dto.firstName ?? existing.firstName).trim(),
              lastName: (dto.lastName ?? existing.lastName).trim(),
              role: RoleName.ENGINEER,
            },
          });
          linkedUserId = user.id;
        }
      }

      if (existing.userId) {
        const userUpdates: {
          email?: string;
          firstName?: string;
          lastName?: string;
          isActive?: boolean;
        } = {};

        if (dto.email !== undefined) userUpdates.email = dto.email.trim().toLowerCase();
        if (dto.firstName !== undefined) userUpdates.firstName = dto.firstName.trim();
        if (dto.lastName !== undefined) userUpdates.lastName = dto.lastName.trim();
        if (dto.isActive !== undefined) userUpdates.isActive = dto.isActive;

        if (Object.keys(userUpdates).length) {
          await tx.user.update({ where: { id: existing.userId }, data: userUpdates });
        }
      }

      return tx.employee.update({
        where: { id },
        data: {
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          email: dto.email !== undefined ? dto.email.trim().toLowerCase() || null : undefined,
          phone: dto.phone !== undefined ? dto.phone.trim() || null : undefined,
          department: dto.department !== undefined ? dto.department.trim() || null : undefined,
          designation: dto.designation !== undefined ? dto.designation.trim() || null : undefined,
          isActive: dto.isActive,
          userId: linkedUserId,
        },
        include: { user: { select: { id: true, email: true, role: true } } },
      });
    });

    const { password: _password, ...auditChanges } = dto;
    await this.audit.log({
      entityType: 'Employee',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
      changes: auditChanges as unknown as Record<string, unknown>,
      metadata: password ? { description: 'Employee updated with login password change' } : undefined,
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

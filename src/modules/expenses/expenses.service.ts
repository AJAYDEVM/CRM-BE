import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { paginatedResult, parsePagination } from '../../common/utils/pagination';
import { EmployeesService } from '../employees/employees.service';
import { CreateExpenseDto, UpdateExpenseDto, ApproveExpenseDto } from './dto/expense.dto';
import { ApprovalStatus, AuditAction, ExpenseReferenceType } from '@prisma/client';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private employees: EmployeesService,
  ) {}

  async create(dto: CreateExpenseDto, userId: string, userRole: string) {
    const employeeId = await this.employees.resolveEmployeeId(dto.employeeId, userId, userRole);
    const data: Record<string, unknown> = {
      category: dto.category,
      amount: dto.amount,
      description: dto.description,
      date: new Date(dto.date),
      employeeId,
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
    };

    if (dto.referenceType === ExpenseReferenceType.OPPORTUNITY) {
      data.opportunityId = dto.opportunityId ?? dto.referenceId;
    } else if (dto.referenceType === ExpenseReferenceType.PRE_PROJECT) {
      data.preProjectId = dto.preProjectId ?? dto.referenceId;
    } else if (dto.referenceType === ExpenseReferenceType.PROJECT) {
      data.projectId = dto.projectId ?? dto.referenceId;
    }

    const expense = await this.prisma.expense.create({ data: data as never });

    if (dto.projectId) {
      await this.prisma.project.update({
        where: { id: dto.projectId },
        data: { spent: { increment: dto.amount } },
      });
    }

    await this.audit.log({
      entityType: 'Expense',
      entityId: expense.id,
      action: AuditAction.CREATE,
      userId,
    });

    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto, userId: string, userRole: string) {
    const expense = await this.findOne(id);
    if (expense.approvalStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Only pending expenses can be edited');
    }

    const employeeId =
      dto.employeeId !== undefined
        ? await this.employees.resolveEmployeeId(dto.employeeId, userId, userRole)
        : expense.employeeId;

    const referenceType = dto.referenceType ?? expense.referenceType;
    const referenceId =
      dto.referenceId ??
      dto.projectId ??
      dto.preProjectId ??
      dto.opportunityId ??
      expense.referenceId ??
      expense.projectId ??
      expense.preProjectId ??
      expense.opportunityId ??
      undefined;

    if (referenceType !== ExpenseReferenceType.COMPANY && !referenceId) {
      throw new BadRequestException('Reference is required for linked expenses');
    }

    const data: Record<string, unknown> = {
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.amount !== undefined && { amount: dto.amount }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.date !== undefined && { date: new Date(dto.date) }),
      employeeId,
      referenceType,
      referenceId: referenceType === ExpenseReferenceType.COMPANY ? null : referenceId,
      opportunityId: null,
      preProjectId: null,
      projectId: null,
    };

    if (referenceType === ExpenseReferenceType.OPPORTUNITY) {
      data.opportunityId = dto.opportunityId ?? referenceId;
    } else if (referenceType === ExpenseReferenceType.PRE_PROJECT) {
      data.preProjectId = dto.preProjectId ?? referenceId;
    } else if (referenceType === ExpenseReferenceType.PROJECT) {
      data.projectId = dto.projectId ?? referenceId;
    }

    const oldProjectId = expense.projectId;
    const oldAmount = Number(expense.amount);
    const newAmount = dto.amount !== undefined ? dto.amount : oldAmount;
    const newProjectId = data.projectId as string | null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (oldProjectId && oldProjectId === newProjectId) {
        const delta = newAmount - oldAmount;
        if (delta !== 0) {
          await tx.project.update({
            where: { id: oldProjectId },
            data: { spent: { increment: delta } },
          });
        }
      } else {
        if (oldProjectId) {
          await tx.project.update({
            where: { id: oldProjectId },
            data: { spent: { decrement: oldAmount } },
          });
        }
        if (newProjectId) {
          await tx.project.update({
            where: { id: newProjectId },
            data: { spent: { increment: newAmount } },
          });
        }
      }

      return tx.expense.update({ where: { id }, data: data as never });
    });

    await this.audit.log({
      entityType: 'Expense',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });

    return updated;
  }

  findAll(options: {
    referenceType?: ExpenseReferenceType;
    approvalStatus?: ApprovalStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {};

    if (options.referenceType) {
      where.referenceType = options.referenceType;
    }

    if (options.approvalStatus) {
      where.approvalStatus = options.approvalStatus;
    }

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { description: { contains: term, mode: 'insensitive' } },
        { employee: { firstName: { contains: term, mode: 'insensitive' } } },
        { employee: { lastName: { contains: term, mode: 'insensitive' } } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
        { preProject: { name: { contains: term, mode: 'insensitive' } } },
        { opportunity: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const include = {
      employee: { select: { id: true, firstName: true, lastName: true } },
      project: { select: { id: true, name: true } },
      preProject: { select: { id: true, name: true } },
      opportunity: { select: { id: true, name: true } },
    };

    if (options.page === undefined && options.limit === undefined) {
      return this.prisma.expense.findMany({
        where: where as never,
        include,
        orderBy: { date: 'desc' },
      });
    }

    const { page, limit, skip } = parsePagination(options.page, options.limit);

    return Promise.all([
      this.prisma.expense.count({ where: where as never }),
      this.prisma.expense.findMany({
        where: where as never,
        include,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
    ]).then(([total, data]) => paginatedResult(data, total, page, limit));
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { employee: true, approvedBy: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async approve(id: string, dto: ApproveExpenseDto, approverId: string) {
    await this.findOne(id);
    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        approvalStatus: dto.status,
        approvedById: approverId,
        approvedAt: new Date(),
      },
    });
    await this.audit.log({
      entityType: 'Expense',
      entityId: id,
      action: dto.status === 'APPROVED' ? AuditAction.APPROVE : AuditAction.REJECT,
      userId: approverId,
    });
    return expense;
  }
}

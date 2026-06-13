import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CreateExpenseDto, ApproveExpenseDto } from './dto/expense.dto';
import { ApprovalStatus, AuditAction, ExpenseReferenceType } from '@prisma/client';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateExpenseDto, employeeId: string, userId: string) {
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

  findAll(referenceType?: ExpenseReferenceType, approvalStatus?: ApprovalStatus) {
    return this.prisma.expense.findMany({
      where: {
        ...(referenceType && { referenceType }),
        ...(approvalStatus && { approvalStatus }),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
        preProject: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });
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

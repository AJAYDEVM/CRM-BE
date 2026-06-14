import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { EmployeesService } from '../employees/employees.service';
import {
  CreatePreProjectDto,
  AddPreProjectExpenseDto,
  ConvertPreProjectDto,
} from './dto/pre-project.dto';
import {
  AuditAction,
  ExpenseReferenceType,
  PreProjectStatus,
  ProjectStatus,
} from '@prisma/client';

@Injectable()
export class PreProjectsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private employees: EmployeesService,
  ) {}

  async create(dto: CreatePreProjectDto, userId: string) {
    const opportunity = await this.prisma.opportunity.findUnique({
      where: { id: dto.opportunityId },
    });
    if (!opportunity) throw new NotFoundException('Opportunity not found');

    const preProject = await this.prisma.preProject.create({
      data: {
        opportunityId: dto.opportunityId,
        customerId: opportunity.customerId,
        name: opportunity.name,
        estimatedValue: opportunity.estimatedAmount,
      },
      include: { customer: true, opportunity: true, expenses: true },
    });

    await this.audit.log({
      entityType: 'PreProject',
      entityId: preProject.id,
      action: AuditAction.CREATE,
      userId,
    });

    return preProject;
  }

  findAll(status?: PreProjectStatus) {
    return this.prisma.preProject.findMany({
      where: status ? { status } : undefined,
      include: {
        customer: true,
        opportunity: true,
        expenses: true,
        project: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const pp = await this.prisma.preProject.findUnique({
      where: { id },
      include: {
        customer: true,
        opportunity: true,
        expenses: { include: { employee: { select: { firstName: true, lastName: true } } } },
        project: true,
      },
    });
    if (!pp) throw new NotFoundException('Pre-project not found');
    return pp;
  }

  async addExpense(id: string, dto: AddPreProjectExpenseDto, userId: string, userRole: string) {
    const preProject = await this.findOne(id);
    if (preProject.status !== PreProjectStatus.ACTIVE) {
      throw new BadRequestException('Cannot add expenses to inactive pre-project');
    }

    const employeeId = await this.employees.resolveEmployeeId(dto.employeeId, userId, userRole);

    const expense = await this.prisma.expense.create({
      data: {
        category: dto.category,
        amount: dto.amount,
        date: new Date(dto.date),
        description: dto.description,
        employeeId,
        referenceType: ExpenseReferenceType.PRE_PROJECT,
        referenceId: id,
        preProjectId: id,
      },
    });

    await this.audit.log({
      entityType: 'Expense',
      entityId: expense.id,
      action: AuditAction.CREATE,
      userId,
      metadata: { preProjectId: id },
    });

    return expense;
  }

  /**
   * Core business logic: Convert pre-project to project and migrate all linked expenses.
   */
  async convertToProject(id: string, dto: ConvertPreProjectDto, userId: string) {
    const preProject = await this.findOne(id);

    if (preProject.status !== PreProjectStatus.ACTIVE) {
      throw new BadRequestException('Pre-project is not active');
    }

    if (preProject.project) {
      throw new BadRequestException('Pre-project already converted');
    }

    const totalExpenses = preProject.expenses.reduce((s, e) => s + Number(e.amount), 0);

    const result = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: preProject.name,
          customerId: preProject.customerId,
          preProjectId: id,
          managerId: dto.managerId,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          budget: dto.budget,
          spent: totalExpenses,
          status: ProjectStatus.PLANNING,
          description: `Converted from pre-project: ${preProject.name}`,
        },
      });

      await tx.expense.updateMany({
        where: { preProjectId: id },
        data: {
          referenceType: ExpenseReferenceType.PROJECT,
          referenceId: project.id,
          projectId: project.id,
          preProjectId: null,
        },
      });

      await tx.preProject.update({
        where: { id },
        data: { status: PreProjectStatus.CONVERTED, convertedAt: new Date() },
      });

      return project;
    });

    await this.audit.log({
      entityType: 'PreProject',
      entityId: id,
      action: AuditAction.CONVERT,
      userId,
      metadata: { projectId: result.id },
    });

    return {
      message: 'Pre-project converted successfully. Project created.',
      project: result,
    };
  }
}

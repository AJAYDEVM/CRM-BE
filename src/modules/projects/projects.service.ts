import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { paginatedResult, parsePagination } from '../../common/utils/pagination';
import { CreateProjectDto, UpdateProjectDto, AssignMembersDto } from './dto/project.dto';
import { AuditAction, ProjectStatus } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateProjectDto, userId: string) {
    const project = await this.prisma.project.create({
      data: {
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
      include: { customer: true, manager: { select: { id: true, firstName: true, lastName: true } } },
    });
    await this.audit.log({ entityType: 'Project', entityId: project.id, action: AuditAction.CREATE, userId });
    return project;
  }

  findAll(options: {
    status?: ProjectStatus;
    search?: string;
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
        { name: { contains: term, mode: 'insensitive' } },
        { customer: { companyName: { contains: term, mode: 'insensitive' } } },
        { manager: { firstName: { contains: term, mode: 'insensitive' } } },
        { manager: { lastName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const include = {
      customer: { select: { id: true, companyName: true } },
      manager: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { members: true, expenses: true, invoices: true } },
    };

    if (options.page === undefined && options.limit === undefined) {
      return this.prisma.project.findMany({
        where: where as never,
        include,
        orderBy: { createdAt: 'desc' },
      });
    }

    const { page, limit, skip } = parsePagination(options.page, options.limit);

    return Promise.all([
      this.prisma.project.count({ where: where as never }),
      this.prisma.project.findMany({
        where: where as never,
        include,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]).then(([total, data]) => paginatedResult(data, total, page, limit));
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        customer: true,
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } } },
        expenses: {
          take: 20,
          orderBy: { date: 'desc' },
          include: { employee: { select: { firstName: true, lastName: true } } },
        },
        invoices: true,
        preProject: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(id: string, dto: UpdateProjectDto, userId: string) {
    await this.findOne(id);
    const data = {
      ...dto,
      ...(dto.startDate && { startDate: new Date(dto.startDate) }),
      ...(dto.endDate && { endDate: new Date(dto.endDate) }),
    };
    const project = await this.prisma.project.update({ where: { id }, data });
    await this.audit.log({
      entityType: 'Project',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });
    return project;
  }

  async assignMembers(id: string, dto: AssignMembersDto, userId: string) {
    await this.findOne(id);
    await this.prisma.projectMember.deleteMany({ where: { projectId: id } });
    await this.prisma.projectMember.createMany({
      data: dto.userIds.map((userId) => ({ projectId: id, userId })),
    });
    await this.audit.log({
      entityType: 'Project',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
      metadata: { assignedMembers: dto.userIds },
    });
    return this.findOne(id);
  }
}

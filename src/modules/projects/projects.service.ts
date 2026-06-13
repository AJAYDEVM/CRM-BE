import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
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

  findAll(status?: ProjectStatus) {
    return this.prisma.project.findMany({
      where: status ? { status } : undefined,
      include: {
        customer: { select: { id: true, companyName: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { members: true, expenses: true, invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        customer: true,
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } } },
        expenses: { take: 20, orderBy: { date: 'desc' } },
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

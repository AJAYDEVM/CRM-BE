import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import {
  CreateOpportunityDto,
  UpdateOpportunityDto,
  UpdateOpportunityStageDto,
} from './dto/opportunity.dto';
import { AuditAction, OpportunityStatus } from '@prisma/client';

@Injectable()
export class OpportunitiesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateOpportunityDto, userId: string) {
    const opportunity = await this.prisma.opportunity.create({
      data: {
        ...dto,
        estimatedAmount: dto.estimatedAmount,
        expectedCloseDate: new Date(dto.expectedCloseDate),
      },
      include: { customer: true },
    });
    await this.audit.log({
      entityType: 'Opportunity',
      entityId: opportunity.id,
      action: AuditAction.CREATE,
      userId,
    });
    return opportunity;
  }

  findAll(status?: OpportunityStatus) {
    return this.prisma.opportunity.findMany({
      where: status ? { status } : undefined,
      include: { customer: { select: { id: true, companyName: true } } },
      orderBy: { expectedCloseDate: 'asc' },
    });
  }

  async findOne(id: string) {
    const opp = await this.prisma.opportunity.findUnique({
      where: { id },
      include: { customer: true, quotations: true, preProjects: true },
    });
    if (!opp) throw new NotFoundException('Opportunity not found');
    return opp;
  }

  async update(id: string, dto: UpdateOpportunityDto, userId: string) {
    await this.findOne(id);
    const data = {
      ...dto,
      ...(dto.expectedCloseDate && { expectedCloseDate: new Date(dto.expectedCloseDate) }),
      ...(dto.estimatedAmount !== undefined && { estimatedAmount: dto.estimatedAmount }),
    };
    const opportunity = await this.prisma.opportunity.update({ where: { id }, data });
    await this.audit.log({
      entityType: 'Opportunity',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });
    return opportunity;
  }

  async updateStage(id: string, dto: UpdateOpportunityStageDto, userId: string) {
    await this.findOne(id);
    const opportunity = await this.prisma.opportunity.update({
      where: { id },
      data: { status: dto.status },
    });
    await this.audit.log({
      entityType: 'Opportunity',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
      changes: { status: dto.status },
    });
    return opportunity;
  }

  async convertToPreProject(id: string, userId: string) {
    const opportunity = await this.findOne(id);

    if (opportunity.status !== OpportunityStatus.WON && opportunity.status !== OpportunityStatus.NEGOTIATION) {
      throw new BadRequestException('Opportunity must be in NEGOTIATION or WON status to convert');
    }

    const existing = await this.prisma.preProject.findFirst({
      where: { opportunityId: id, status: 'ACTIVE' },
    });
    if (existing) throw new BadRequestException('Active pre-project already exists');

    const preProject = await this.prisma.preProject.create({
      data: {
        opportunityId: id,
        customerId: opportunity.customerId,
        name: opportunity.name,
        estimatedValue: opportunity.estimatedAmount,
      },
      include: { customer: true, opportunity: true },
    });

    await this.audit.log({
      entityType: 'PreProject',
      entityId: preProject.id,
      action: AuditAction.CONVERT,
      userId,
      metadata: { fromOpportunityId: id },
    });

    return preProject;
  }
}

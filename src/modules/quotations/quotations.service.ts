import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { paginatedResult, parsePagination } from '../../common/utils/pagination';
import { CreateQuotationDto, AddQuotationItemsDto, UpdateQuotationDto, QuotationItemDto } from './dto/quotation.dto';
import { AuditAction, QuotationStatus } from '@prisma/client';

@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private calcLine(item: QuotationItemDto) {
    const subtotal = item.quantity * item.unitPrice;
    const taxRate = item.taxRate ?? 18;
    return subtotal + (subtotal * taxRate) / 100;
  }

  private async generateNumber() {
    const count = await this.prisma.quotation.count();
    const year = new Date().getFullYear();
    return `QT-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(dto: CreateQuotationDto, userId: string) {
    const quotationNumber = await this.generateNumber();
    const items = dto.items.map((item) => ({
      ...item,
      lineTotal: this.calcLine(item),
    }));
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const tax = items.reduce((s, i) => {
      const st = i.quantity * i.unitPrice;
      return s + (st * (i.taxRate ?? 18)) / 100;
    }, 0);
    const discount = dto.discount ?? 0;
    const total = subtotal + tax - discount;

    const quotation = await this.prisma.quotation.create({
      data: {
        quotationNumber,
        customerId: dto.customerId,
        opportunityId: dto.opportunityId,
        subtotal,
        tax,
        discount,
        total,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
        items: { create: items },
      },
      include: { items: true, customer: true },
    });

    if (dto.opportunityId) {
      await this.prisma.opportunity.update({
        where: { id: dto.opportunityId },
        data: { status: 'QUOTATION_SENT' },
      });
    }

    await this.audit.log({
      entityType: 'Quotation',
      entityId: quotation.id,
      action: AuditAction.CREATE,
      userId,
    });

    return quotation;
  }

  findAll(options: {
    status?: QuotationStatus;
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
        { quotationNumber: { contains: term, mode: 'insensitive' } },
        { customer: { companyName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    if (options.page === undefined && options.limit === undefined) {
      return this.prisma.quotation.findMany({
        where: where as never,
        include: { customer: true, items: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    const { page, limit, skip } = parsePagination(options.page, options.limit);

    return Promise.all([
      this.prisma.quotation.count({ where: where as never }),
      this.prisma.quotation.findMany({
        where: where as never,
        include: { customer: true, items: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]).then(([total, data]) => paginatedResult(data, total, page, limit));
  }

  async findOne(id: string) {
    const q = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true, customer: true, opportunity: true },
    });
    if (!q) throw new NotFoundException('Quotation not found');
    return q;
  }

  private assertEditable(status: QuotationStatus) {
    if (status !== QuotationStatus.DRAFT && status !== QuotationStatus.SENT) {
      throw new BadRequestException('Only draft or sent quotations can be edited');
    }
  }

  async update(id: string, dto: UpdateQuotationDto, userId: string) {
    const quotation = await this.findOne(id);
    this.assertEditable(quotation.status);

    if (dto.items?.length) {
      await this.prisma.quotationItem.deleteMany({ where: { quotationId: id } });
      await this.prisma.quotationItem.createMany({
        data: dto.items.map((item) => ({
          quotationId: id,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate ?? 18,
          lineTotal: this.calcLine(item),
        })),
      });
    }

    const headerUpdates: {
      customerId?: string;
      notes?: string | null;
      validUntil?: Date;
      discount?: number;
    } = {};
    if (dto.customerId) headerUpdates.customerId = dto.customerId;
    if (dto.notes !== undefined) headerUpdates.notes = dto.notes;
    if (dto.validUntil) headerUpdates.validUntil = new Date(dto.validUntil);
    if (dto.discount !== undefined) headerUpdates.discount = dto.discount;

    return this.recalculateTotals(id, userId, headerUpdates);
  }

  async addItems(id: string, dto: AddQuotationItemsDto, userId: string) {
    const quotation = await this.findOne(id);
    this.assertEditable(quotation.status);

    const newItems = dto.items.map((item) => ({
      quotationId: id,
      ...item,
      lineTotal: this.calcLine(item),
    }));

    await this.prisma.quotationItem.createMany({ data: newItems });
    return this.recalculateTotals(id, userId);
  }

  async approve(id: string, userId: string) {
    const quotation = await this.findOne(id);
    if (quotation.status !== QuotationStatus.SENT) {
      throw new BadRequestException('Only sent quotations can be approved');
    }
    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.APPROVED },
    });
    await this.audit.log({
      entityType: 'Quotation',
      entityId: id,
      action: AuditAction.APPROVE,
      userId,
    });
    return updated;
  }

  async send(id: string, userId: string) {
    const quotation = await this.findOne(id);
    if (quotation.status !== QuotationStatus.DRAFT) {
      throw new BadRequestException('Only draft quotations can be sent');
    }
    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.SENT },
    });
    await this.audit.log({
      entityType: 'Quotation',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
      changes: { status: 'SENT' },
    });
    return updated;
  }

  private async recalculateTotals(
    id: string,
    userId: string,
    extraData: {
      customerId?: string;
      notes?: string | null;
      validUntil?: Date;
      discount?: number;
    } = {},
  ) {
    const items = await this.prisma.quotationItem.findMany({ where: { quotationId: id } });
    const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
    const tax = items.reduce((s, i) => {
      const st = Number(i.quantity) * Number(i.unitPrice);
      return s + (st * Number(i.taxRate)) / 100;
    }, 0);
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    const discount = extraData.discount ?? Number(quotation?.discount ?? 0);
    const total = subtotal + tax - discount;

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: {
        subtotal,
        tax,
        total,
        discount,
        ...extraData,
      },
      include: { items: true, customer: true },
    });

    await this.audit.log({
      entityType: 'Quotation',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
    });

    return updated;
  }
}

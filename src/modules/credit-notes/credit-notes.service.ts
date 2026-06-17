import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { buildAddressSnapshot } from '../../common/utils/document-snapshot.utils';
import {
  CreateCreditNoteDto,
  CreditNoteItemDto,
  UpdateCreditNoteDto,
} from './dto/credit-note.dto';
import { AuditAction, CreditNoteStatus, InvoiceStatus } from '@prisma/client';

@Injectable()
export class CreditNotesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private calcLineAmount(item: CreditNoteItemDto) {
    return item.quantity * item.unitPrice;
  }

  private calcLineTax(item: CreditNoteItemDto) {
    const amount = this.calcLineAmount(item);
    return (amount * (item.taxRate ?? 18)) / 100;
  }

  private async generateNumber() {
    const count = await this.prisma.creditNote.count();
    const year = new Date().getFullYear();
    return `CN-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private async getCustomerOrThrow(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private async validateInvoiceLink(invoiceId: string | undefined, customerId: string, projectId: string) {
    if (!invoiceId) return null;

    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.customerId !== customerId || invoice.projectId !== projectId) {
      throw new BadRequestException('Invoice does not match the selected customer and project');
    }
    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException('Credit notes can only be issued against sent or paid invoices');
    }
    return invoice;
  }

  async create(dto: CreateCreditNoteDto, userId: string) {
    await this.validateInvoiceLink(dto.invoiceId, dto.customerId, dto.projectId);
    const customer = await this.getCustomerOrThrow(dto.customerId);
    const addressSnapshot = buildAddressSnapshot(customer, dto);

    const creditNoteNumber = await this.generateNumber();
    const items = dto.items.map((i) => ({
      description: i.description,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: i.taxRate ?? 18,
      amount: this.calcLineAmount(i),
    }));
    const amount = items.reduce((s, i) => s + i.amount, 0);
    const tax = dto.items.reduce((s, i) => s + this.calcLineTax(i), 0);
    const total = amount + tax;

    const creditNote = await this.prisma.creditNote.create({
      data: {
        creditNoteNumber,
        invoiceId: dto.invoiceId,
        customerId: dto.customerId,
        projectId: dto.projectId,
        amount,
        tax,
        total,
        creditDate: new Date(dto.creditDate),
        reason: dto.reason,
        placeOfSupply: dto.placeOfSupply,
        subject: dto.subject,
        customerGstin: addressSnapshot.customerGstin,
        billToAddress: addressSnapshot.billToAddress,
        shipToAddress: addressSnapshot.shipToAddress,
        items: { create: items },
      },
      include: {
        items: true,
        customer: true,
        project: true,
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    await this.audit.log({
      entityType: 'CreditNote',
      entityId: creditNote.id,
      action: AuditAction.CREATE,
      userId,
    });

    return creditNote;
  }

  private buildWhere(options: { status?: CreditNoteStatus; search?: string }) {
    const where: Record<string, unknown> = {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { creditNoteNumber: { contains: term, mode: 'insensitive' } },
        { customer: { companyName: { contains: term, mode: 'insensitive' } } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
        { invoice: { invoiceNumber: { contains: term, mode: 'insensitive' } } },
        { reason: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async findAll(options: {
    status?: CreditNoteStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 10));
    const where = this.buildWhere(options);

    const [total, data] = await Promise.all([
      this.prisma.creditNote.count({ where: where as never }),
      this.prisma.creditNote.findMany({
        where: where as never,
        include: {
          customer: { select: { id: true, companyName: true } },
          project: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    const creditNote = await this.prisma.creditNote.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
        project: true,
        invoice: { select: { id: true, invoiceNumber: true, total: true, status: true } },
      },
    });
    if (!creditNote) throw new NotFoundException('Credit note not found');
    return creditNote;
  }

  private assertEditable(status: CreditNoteStatus) {
    if (status !== CreditNoteStatus.DRAFT && status !== CreditNoteStatus.SENT) {
      throw new BadRequestException('Only draft or sent credit notes can be edited');
    }
  }

  async update(id: string, dto: UpdateCreditNoteDto, userId: string) {
    const creditNote = await this.findOne(id);
    this.assertEditable(creditNote.status);

    const customerId = dto.customerId ?? creditNote.customerId;
    const projectId = dto.projectId ?? creditNote.projectId;
    await this.validateInvoiceLink(dto.invoiceId ?? creditNote.invoiceId ?? undefined, customerId, projectId);

    if (dto.items?.length) {
      await this.prisma.creditNoteItem.deleteMany({ where: { creditNoteId: id } });
      await this.prisma.creditNoteItem.createMany({
        data: dto.items.map((item) => ({
          creditNoteId: id,
          description: item.description,
          hsnCode: item.hsnCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate ?? 18,
          amount: this.calcLineAmount(item),
        })),
      });
    }

    const customer = await this.getCustomerOrThrow(customerId);
    const addressSnapshot = buildAddressSnapshot(customer, {
      customerGstin: dto.customerGstin ?? creditNote.customerGstin ?? undefined,
      billToAddress: dto.billToAddress ?? creditNote.billToAddress ?? undefined,
      shipToAddress: dto.shipToAddress ?? creditNote.shipToAddress ?? undefined,
      sameAsBilling: dto.sameAsBilling,
    });

    const fresh = await this.findOne(id);
    const amount = fresh.items.reduce((sum, item) => sum + Number(item.amount), 0);
    const tax = fresh.items.reduce((sum, item) => {
      const lineAmount = Number(item.amount);
      return sum + (lineAmount * Number(item.taxRate)) / 100;
    }, 0);
    const total = amount + tax;

    const headerUpdates: Record<string, unknown> = {
      amount,
      tax,
      total,
      customerGstin: addressSnapshot.customerGstin,
      billToAddress: addressSnapshot.billToAddress,
      shipToAddress: addressSnapshot.shipToAddress,
    };
    if (dto.invoiceId !== undefined) headerUpdates.invoiceId = dto.invoiceId || null;
    if (dto.customerId) headerUpdates.customerId = dto.customerId;
    if (dto.projectId) headerUpdates.projectId = dto.projectId;
    if (dto.creditDate) headerUpdates.creditDate = new Date(dto.creditDate);
    if (dto.reason !== undefined) headerUpdates.reason = dto.reason;
    if (dto.placeOfSupply !== undefined) headerUpdates.placeOfSupply = dto.placeOfSupply;
    if (dto.subject !== undefined) headerUpdates.subject = dto.subject;

    const updated = await this.prisma.creditNote.update({
      where: { id },
      data: headerUpdates,
      include: {
        items: true,
        customer: true,
        project: true,
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    await this.audit.log({
      entityType: 'CreditNote',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
    });

    return updated;
  }

  async send(id: string, userId: string) {
    const creditNote = await this.prisma.creditNote.update({
      where: { id },
      data: { status: CreditNoteStatus.SENT },
    });
    await this.audit.log({
      entityType: 'CreditNote',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
    });
    return creditNote;
  }

  async apply(id: string, userId: string) {
    const creditNote = await this.findOne(id);
    if (creditNote.status === CreditNoteStatus.DRAFT) {
      throw new BadRequestException('Send the credit note before applying it');
    }
    if (creditNote.status === CreditNoteStatus.APPLIED) {
      throw new BadRequestException('Credit note is already applied');
    }

    const updated = await this.prisma.creditNote.update({
      where: { id },
      data: { status: CreditNoteStatus.APPLIED },
      include: {
        items: true,
        customer: true,
        project: true,
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    await this.audit.log({
      entityType: 'CreditNote',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
      metadata: { applied: true },
    });

    return updated;
  }
}

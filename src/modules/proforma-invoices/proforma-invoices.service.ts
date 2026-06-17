import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SettingsService } from '../settings/settings.service';
import { buildAddressSnapshot, getDefaultPaymentTerms } from '../../common/utils/document-snapshot.utils';
import { validateQuotationLink } from '../../common/utils/quotation-link.utils';
import {
  CreateProformaInvoiceDto,
  ProformaInvoiceItemDto,
  UpdateProformaInvoiceDto,
} from './dto/proforma-invoice.dto';
import { AuditAction, InvoiceStatus, ProformaInvoiceStatus } from '@prisma/client';

@Injectable()
export class ProformaInvoicesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  private calcLineAmount(item: ProformaInvoiceItemDto) {
    return item.quantity * item.unitPrice;
  }

  private calcLineTax(item: ProformaInvoiceItemDto) {
    const amount = this.calcLineAmount(item);
    return (amount * (item.taxRate ?? 18)) / 100;
  }

  private async generateNumber() {
    const count = await this.prisma.proformaInvoice.count();
    const year = new Date().getFullYear();
    return `PI-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private async getCustomerOrThrow(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private async validateQuotationLink(quotationId: string | undefined, customerId: string) {
    return validateQuotationLink(this.prisma, quotationId, customerId);
  }

  private mapItems(items: ProformaInvoiceItemDto[]) {
    return items.map((i) => ({
      description: i.description,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: i.taxRate ?? 18,
      amount: this.calcLineAmount(i),
    }));
  }

  private calcTotals(items: ProformaInvoiceItemDto[]) {
    const mapped = this.mapItems(items);
    const amount = mapped.reduce((s, i) => s + i.amount, 0);
    const tax = items.reduce((s, i) => s + this.calcLineTax(i), 0);
    return { mapped, amount, tax, total: amount + tax };
  }

  async create(dto: CreateProformaInvoiceDto, userId: string) {
    await this.validateQuotationLink(dto.quotationId, dto.customerId);
    const customer = await this.getCustomerOrThrow(dto.customerId);
    const addressSnapshot = buildAddressSnapshot(customer, dto);
    const paymentTerms = dto.paymentTerms ?? (await getDefaultPaymentTerms(this.settings));

    const proformaNumber = await this.generateNumber();
    const { mapped, amount, tax, total } = this.calcTotals(dto.items);

    const proforma = await this.prisma.proformaInvoice.create({
      data: {
        proformaNumber,
        quotationId: dto.quotationId,
        customerId: dto.customerId,
        projectId: dto.projectId,
        proformaDate: new Date(dto.proformaDate),
        dueDate: new Date(dto.dueDate),
        amount,
        tax,
        total,
        placeOfSupply: dto.placeOfSupply,
        subject: dto.subject,
        customerGstin: addressSnapshot.customerGstin,
        billToAddress: addressSnapshot.billToAddress,
        shipToAddress: addressSnapshot.shipToAddress,
        paymentTerms,
        notes: dto.notes,
        items: { create: mapped },
      },
      include: {
        items: true,
        customer: true,
        project: true,
        quotation: { select: { id: true, quotationNumber: true } },
      },
    });

    await this.audit.log({
      entityType: 'ProformaInvoice',
      entityId: proforma.id,
      action: AuditAction.CREATE,
      userId,
    });

    return proforma;
  }

  private buildWhere(options: { status?: ProformaInvoiceStatus; search?: string }) {
    const where: Record<string, unknown> = {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { proformaNumber: { contains: term, mode: 'insensitive' } },
        { customer: { companyName: { contains: term, mode: 'insensitive' } } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
        { quotation: { quotationNumber: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  async findAll(options: {
    status?: ProformaInvoiceStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 10));
    const where = this.buildWhere(options);

    const [total, data] = await Promise.all([
      this.prisma.proformaInvoice.count({ where: where as never }),
      this.prisma.proformaInvoice.findMany({
        where: where as never,
        include: {
          customer: { select: { id: true, companyName: true } },
          project: { select: { id: true, name: true } },
          quotation: { select: { id: true, quotationNumber: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          items: true,
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
    const proforma = await this.prisma.proformaInvoice.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
        project: true,
        quotation: { select: { id: true, quotationNumber: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });
    if (!proforma) throw new NotFoundException('Proforma invoice not found');
    return proforma;
  }

  private assertEditable(status: ProformaInvoiceStatus) {
    if (status !== ProformaInvoiceStatus.DRAFT && status !== ProformaInvoiceStatus.SENT) {
      throw new BadRequestException('Only draft or sent proforma invoices can be edited');
    }
  }

  async update(id: string, dto: UpdateProformaInvoiceDto, userId: string) {
    const proforma = await this.findOne(id);
    this.assertEditable(proforma.status);

    const customerId = dto.customerId ?? proforma.customerId;
    await this.validateQuotationLink(dto.quotationId ?? proforma.quotationId ?? undefined, customerId);

    if (dto.items?.length) {
      await this.prisma.proformaInvoiceItem.deleteMany({ where: { proformaInvoiceId: id } });
      const { mapped, amount, tax, total } = this.calcTotals(dto.items);
      await this.prisma.proformaInvoiceItem.createMany({
        data: mapped.map((item) => ({ ...item, proformaInvoiceId: id })),
      });

      const customer = await this.getCustomerOrThrow(customerId);
      const addressSnapshot = buildAddressSnapshot(customer, {
        customerGstin: dto.customerGstin ?? proforma.customerGstin ?? undefined,
        billToAddress: dto.billToAddress ?? proforma.billToAddress ?? undefined,
        shipToAddress: dto.shipToAddress ?? proforma.shipToAddress ?? undefined,
        sameAsBilling: dto.sameAsBilling,
      });

      const headerUpdates: Record<string, unknown> = {
        amount,
        tax,
        total,
        customerGstin: addressSnapshot.customerGstin,
        billToAddress: addressSnapshot.billToAddress,
        shipToAddress: addressSnapshot.shipToAddress,
      };
      if (dto.quotationId !== undefined) headerUpdates.quotationId = dto.quotationId || null;
      if (dto.customerId) headerUpdates.customerId = dto.customerId;
      if (dto.projectId) headerUpdates.projectId = dto.projectId;
      if (dto.proformaDate) headerUpdates.proformaDate = new Date(dto.proformaDate);
      if (dto.dueDate) headerUpdates.dueDate = new Date(dto.dueDate);
      if (dto.placeOfSupply !== undefined) headerUpdates.placeOfSupply = dto.placeOfSupply;
      if (dto.subject !== undefined) headerUpdates.subject = dto.subject;
      if (dto.paymentTerms !== undefined) headerUpdates.paymentTerms = dto.paymentTerms;
      if (dto.notes !== undefined) headerUpdates.notes = dto.notes;

      const updated = await this.prisma.proformaInvoice.update({
        where: { id },
        data: headerUpdates,
        include: {
          items: true,
          customer: true,
          project: true,
          quotation: { select: { id: true, quotationNumber: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      });

      await this.audit.log({
        entityType: 'ProformaInvoice',
        entityId: id,
        action: AuditAction.UPDATE,
        userId,
      });

      return updated;
    }

    const customer = await this.getCustomerOrThrow(customerId);
    const addressSnapshot = buildAddressSnapshot(customer, {
      customerGstin: dto.customerGstin ?? proforma.customerGstin ?? undefined,
      billToAddress: dto.billToAddress ?? proforma.billToAddress ?? undefined,
      shipToAddress: dto.shipToAddress ?? proforma.shipToAddress ?? undefined,
      sameAsBilling: dto.sameAsBilling,
    });

    const headerUpdates: Record<string, unknown> = {
      customerGstin: addressSnapshot.customerGstin,
      billToAddress: addressSnapshot.billToAddress,
      shipToAddress: addressSnapshot.shipToAddress,
    };
    if (dto.quotationId !== undefined) headerUpdates.quotationId = dto.quotationId || null;
    if (dto.customerId) headerUpdates.customerId = dto.customerId;
    if (dto.projectId) headerUpdates.projectId = dto.projectId;
    if (dto.proformaDate) headerUpdates.proformaDate = new Date(dto.proformaDate);
    if (dto.dueDate) headerUpdates.dueDate = new Date(dto.dueDate);
    if (dto.placeOfSupply !== undefined) headerUpdates.placeOfSupply = dto.placeOfSupply;
    if (dto.subject !== undefined) headerUpdates.subject = dto.subject;
    if (dto.paymentTerms !== undefined) headerUpdates.paymentTerms = dto.paymentTerms;
    if (dto.notes !== undefined) headerUpdates.notes = dto.notes;

    const updated = await this.prisma.proformaInvoice.update({
      where: { id },
      data: headerUpdates,
      include: {
        items: true,
        customer: true,
        project: true,
        quotation: { select: { id: true, quotationNumber: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    await this.audit.log({
      entityType: 'ProformaInvoice',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
    });

    return updated;
  }

  async send(id: string, userId: string) {
    const proforma = await this.prisma.proformaInvoice.update({
      where: { id },
      data: { status: ProformaInvoiceStatus.SENT },
    });
    await this.audit.log({
      entityType: 'ProformaInvoice',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
    });
    return proforma;
  }

  async convertToInvoice(id: string, userId: string) {
    const proforma = await this.findOne(id);

    if (proforma.status === ProformaInvoiceStatus.DRAFT) {
      throw new BadRequestException('Send the proforma invoice before converting to a tax invoice');
    }
    if (proforma.status === ProformaInvoiceStatus.CONVERTED) {
      throw new BadRequestException('Proforma invoice has already been converted');
    }
    if (proforma.invoiceId) {
      throw new BadRequestException('Proforma invoice is already linked to an invoice');
    }

    const invoiceCount = await this.prisma.invoice.count();
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${String(invoiceCount + 1).padStart(4, '0')}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          quotationId: proforma.quotationId,
          customerId: proforma.customerId,
          projectId: proforma.projectId,
          amount: proforma.amount,
          tax: proforma.tax,
          total: proforma.total,
          dueDate: proforma.dueDate,
          placeOfSupply: proforma.placeOfSupply,
          subject: proforma.subject,
          customerGstin: proforma.customerGstin,
          billToAddress: proforma.billToAddress,
          shipToAddress: proforma.shipToAddress,
          paymentTerms: proforma.paymentTerms,
          status: InvoiceStatus.DRAFT,
          items: {
            create: proforma.items.map((item) => ({
              description: item.description,
              hsnCode: item.hsnCode,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate,
              amount: item.amount,
            })),
          },
        },
      });

      const updatedProforma = await tx.proformaInvoice.update({
        where: { id },
        data: {
          status: ProformaInvoiceStatus.CONVERTED,
          invoiceId: invoice.id,
        },
        include: {
          items: true,
          customer: true,
          project: true,
          quotation: { select: { id: true, quotationNumber: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      });

      return { proforma: updatedProforma, invoice };
    });

    await this.audit.log({
      entityType: 'ProformaInvoice',
      entityId: id,
      action: AuditAction.CONVERT,
      userId,
      metadata: { invoiceId: result.invoice.id, invoiceNumber: result.invoice.invoiceNumber },
    });

    await this.audit.log({
      entityType: 'Invoice',
      entityId: result.invoice.id,
      action: AuditAction.CREATE,
      userId,
      metadata: { fromProformaId: id, fromProformaNumber: proforma.proformaNumber },
    });

    return result;
  }
}

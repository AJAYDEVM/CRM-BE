import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CreateInvoiceDto, RecordPaymentDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { AuditAction, InvoiceStatus, PaymentStatus } from '@prisma/client';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async generateNumber() {
    const count = await this.prisma.invoice.count();
    const year = new Date().getFullYear();
    return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(dto: CreateInvoiceDto, userId: string) {
    const invoiceNumber = await this.generateNumber();
    const items = dto.items.map((i) => ({
      ...i,
      amount: i.quantity * i.unitPrice,
    }));
    const amount = items.reduce((s, i) => s + i.amount, 0);
    const tax = amount * 0.18;
    const total = amount + tax;

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId: dto.customerId,
        projectId: dto.projectId,
        amount,
        tax,
        total,
        dueDate: new Date(dto.dueDate),
        items: { create: items },
      },
      include: { items: true, customer: true, project: true },
    });

    await this.audit.log({
      entityType: 'Invoice',
      entityId: invoice.id,
      action: AuditAction.CREATE,
      userId,
    });

    return invoice;
  }

  findAll(status?: InvoiceStatus, search?: string, paymentStatus?: string, page?: number, limit?: number) {
    return this.findInvoices({ status, search, paymentStatus, page, limit });
  }

  private buildInvoiceWhere(options: {
    status?: InvoiceStatus;
    search?: string;
    paymentStatus?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { invoiceNumber: { contains: term, mode: 'insensitive' } },
        { customer: { companyName: { contains: term, mode: 'insensitive' } } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  async findInvoices(options: {
    status?: InvoiceStatus;
    search?: string;
    paymentStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 10));
    const where = this.buildInvoiceWhere(options);

    let rows = await this.prisma.invoice.findMany({
      where: where as never,
      include: {
        customer: { select: { id: true, companyName: true } },
        project: { select: { id: true, name: true } },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (options.paymentStatus) {
      rows = rows.filter((invoice) => {
        const paidTotal = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const total = Number(invoice.total);
        const dueDate = invoice.dueDate;
        const status = invoice.status;

        if (options.paymentStatus === 'Paid') {
          return status === InvoiceStatus.PAID || paidTotal >= total;
        }
        if (options.paymentStatus === 'Partial') {
          return paidTotal > 0 && paidTotal < total;
        }
        if (options.paymentStatus === 'Overdue') {
          return (
            status !== InvoiceStatus.PAID &&
            status !== InvoiceStatus.DRAFT &&
            dueDate < new Date() &&
            paidTotal < total
          );
        }
        if (options.paymentStatus === 'Pending') {
          return paidTotal === 0 && status !== InvoiceStatus.DRAFT && dueDate >= new Date();
        }
        return true;
      });
    }

    const total = rows.length;
    const start = (page - 1) * limit;
    const data = rows.slice(start, start + limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, customer: true, project: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private assertEditable(status: InvoiceStatus) {
    if (status !== InvoiceStatus.DRAFT && status !== InvoiceStatus.SENT) {
      throw new BadRequestException('Only draft or sent invoices can be edited');
    }
  }

  async update(id: string, dto: UpdateInvoiceDto, userId: string) {
    const invoice = await this.findOne(id);
    this.assertEditable(invoice.status);

    if (dto.items?.length) {
      await this.prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await this.prisma.invoiceItem.createMany({
        data: dto.items.map((item) => ({
          invoiceId: id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.quantity * item.unitPrice,
        })),
      });
    }

    const fresh = await this.findOne(id);
    const amount = fresh.items.reduce((sum, item) => sum + Number(item.amount), 0);
    const tax = amount * 0.18;
    const total = amount + tax;
    const paidTotal = fresh.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const status = paidTotal >= total ? InvoiceStatus.PAID : fresh.status;

    const headerUpdates: {
      customerId?: string;
      projectId?: string;
      dueDate?: Date;
    } = {};
    if (dto.customerId) headerUpdates.customerId = dto.customerId;
    if (dto.projectId) headerUpdates.projectId = dto.projectId;
    if (dto.dueDate) headerUpdates.dueDate = new Date(dto.dueDate);

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { ...headerUpdates, amount, tax, total, status },
      include: { items: true, customer: true, project: true, payments: true },
    });

    await this.audit.log({
      entityType: 'Invoice',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
    });

    return updated;
  }

  async send(id: string, userId: string) {
    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SENT },
    });
    await this.audit.log({
      entityType: 'Invoice',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
    });
    return invoice;
  }

  async recordPayment(id: string, dto: RecordPaymentDto, userId: string) {
    await this.findOne(id);
    const payment = await this.prisma.payment.create({
      data: { invoiceId: id, ...dto, paymentDate: new Date(dto.paymentDate) },
    });

    const invoice = await this.findOne(id);
    const paidTotal = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
    const status =
      paidTotal >= Number(invoice.total) ? InvoiceStatus.PAID : InvoiceStatus.SENT;

    await this.prisma.invoice.update({ where: { id }, data: { status } });

    await this.audit.log({
      entityType: 'Invoice',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
      metadata: { paymentId: payment.id, amount: dto.amount },
    });

    return payment;
  }
}

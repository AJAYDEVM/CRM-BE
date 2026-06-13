import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CreateInvoiceDto, RecordPaymentDto } from './dto/invoice.dto';
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

  findAll(status?: InvoiceStatus) {
    return this.prisma.invoice.findMany({
      where: status ? { status } : undefined,
      include: {
        customer: { select: { id: true, companyName: true } },
        project: { select: { id: true, name: true } },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, customer: true, project: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
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
    const paidTotal = invoice.payments.reduce((s, p) => s + Number(p.amount), 0) + dto.amount;
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

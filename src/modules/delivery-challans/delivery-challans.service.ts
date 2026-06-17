import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { buildAddressSnapshot } from '../../common/utils/document-snapshot.utils';
import {
  CreateDeliveryChallanDto,
  UpdateDeliveryChallanDto,
} from './dto/delivery-challan.dto';
import { AuditAction, DeliveryChallanStatus, InvoiceStatus } from '@prisma/client';

@Injectable()
export class DeliveryChallansService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async generateNumber() {
    const count = await this.prisma.deliveryChallan.count();
    const year = new Date().getFullYear();
    return `DC-${year}-${String(count + 1).padStart(4, '0')}`;
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
      throw new BadRequestException('Delivery challans can only be linked to sent or paid invoices');
    }
    return invoice;
  }

  async create(dto: CreateDeliveryChallanDto, userId: string) {
    await this.validateInvoiceLink(dto.invoiceId, dto.customerId, dto.projectId);
    const customer = await this.getCustomerOrThrow(dto.customerId);
    const addressSnapshot = buildAddressSnapshot(customer, dto);

    const challanNumber = await this.generateNumber();
    const items = dto.items.map((i) => ({
      description: i.description,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unit: i.unit?.trim() || 'Nos',
    }));

    const challan = await this.prisma.deliveryChallan.create({
      data: {
        challanNumber,
        invoiceId: dto.invoiceId,
        customerId: dto.customerId,
        projectId: dto.projectId,
        challanDate: new Date(dto.challanDate),
        vehicleNumber: dto.vehicleNumber,
        driverName: dto.driverName,
        transportMode: dto.transportMode,
        notes: dto.notes,
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
      entityType: 'DeliveryChallan',
      entityId: challan.id,
      action: AuditAction.CREATE,
      userId,
    });

    return challan;
  }

  private buildWhere(options: { status?: DeliveryChallanStatus; search?: string }) {
    const where: Record<string, unknown> = {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { challanNumber: { contains: term, mode: 'insensitive' } },
        { customer: { companyName: { contains: term, mode: 'insensitive' } } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
        { invoice: { invoiceNumber: { contains: term, mode: 'insensitive' } } },
        { vehicleNumber: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async findAll(options: {
    status?: DeliveryChallanStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 10));
    const where = this.buildWhere(options);

    const [total, data] = await Promise.all([
      this.prisma.deliveryChallan.count({ where: where as never }),
      this.prisma.deliveryChallan.findMany({
        where: where as never,
        include: {
          customer: { select: { id: true, companyName: true } },
          project: { select: { id: true, name: true } },
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
    const challan = await this.prisma.deliveryChallan.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
        project: true,
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });
    if (!challan) throw new NotFoundException('Delivery challan not found');
    return challan;
  }

  private assertEditable(status: DeliveryChallanStatus) {
    if (status !== DeliveryChallanStatus.DRAFT && status !== DeliveryChallanStatus.SENT) {
      throw new BadRequestException('Only draft or sent delivery challans can be edited');
    }
  }

  async update(id: string, dto: UpdateDeliveryChallanDto, userId: string) {
    const challan = await this.findOne(id);
    this.assertEditable(challan.status);

    const customerId = dto.customerId ?? challan.customerId;
    const projectId = dto.projectId ?? challan.projectId;
    await this.validateInvoiceLink(dto.invoiceId ?? challan.invoiceId ?? undefined, customerId, projectId);

    if (dto.items?.length) {
      await this.prisma.deliveryChallanItem.deleteMany({ where: { deliveryChallanId: id } });
      await this.prisma.deliveryChallanItem.createMany({
        data: dto.items.map((item) => ({
          deliveryChallanId: id,
          description: item.description,
          hsnCode: item.hsnCode,
          quantity: item.quantity,
          unit: item.unit?.trim() || 'Nos',
        })),
      });
    }

    const customer = await this.getCustomerOrThrow(customerId);
    const addressSnapshot = buildAddressSnapshot(customer, {
      customerGstin: dto.customerGstin ?? challan.customerGstin ?? undefined,
      billToAddress: dto.billToAddress ?? challan.billToAddress ?? undefined,
      shipToAddress: dto.shipToAddress ?? challan.shipToAddress ?? undefined,
      sameAsBilling: dto.sameAsBilling,
    });

    const headerUpdates: Record<string, unknown> = {
      customerGstin: addressSnapshot.customerGstin,
      billToAddress: addressSnapshot.billToAddress,
      shipToAddress: addressSnapshot.shipToAddress,
    };
    if (dto.invoiceId !== undefined) headerUpdates.invoiceId = dto.invoiceId || null;
    if (dto.customerId) headerUpdates.customerId = dto.customerId;
    if (dto.projectId) headerUpdates.projectId = dto.projectId;
    if (dto.challanDate) headerUpdates.challanDate = new Date(dto.challanDate);
    if (dto.vehicleNumber !== undefined) headerUpdates.vehicleNumber = dto.vehicleNumber;
    if (dto.driverName !== undefined) headerUpdates.driverName = dto.driverName;
    if (dto.transportMode !== undefined) headerUpdates.transportMode = dto.transportMode;
    if (dto.notes !== undefined) headerUpdates.notes = dto.notes;
    if (dto.placeOfSupply !== undefined) headerUpdates.placeOfSupply = dto.placeOfSupply;
    if (dto.subject !== undefined) headerUpdates.subject = dto.subject;

    const updated = await this.prisma.deliveryChallan.update({
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
      entityType: 'DeliveryChallan',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
    });

    return updated;
  }

  async send(id: string, userId: string) {
    const challan = await this.prisma.deliveryChallan.update({
      where: { id },
      data: { status: DeliveryChallanStatus.SENT },
    });
    await this.audit.log({
      entityType: 'DeliveryChallan',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
    });
    return challan;
  }

  async dispatch(id: string, userId: string) {
    const challan = await this.findOne(id);
    if (challan.status === DeliveryChallanStatus.DRAFT) {
      throw new BadRequestException('Send the delivery challan before marking it dispatched');
    }
    if (challan.status === DeliveryChallanStatus.DISPATCHED) {
      throw new BadRequestException('Delivery challan is already dispatched');
    }

    const updated = await this.prisma.deliveryChallan.update({
      where: { id },
      data: { status: DeliveryChallanStatus.DISPATCHED },
      include: {
        items: true,
        customer: true,
        project: true,
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    await this.audit.log({
      entityType: 'DeliveryChallan',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
      metadata: { dispatched: true },
    });

    return updated;
  }
}

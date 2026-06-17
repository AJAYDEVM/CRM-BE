import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { buildAddressSnapshot } from '../../common/utils/document-snapshot.utils';
import { CreatePackingListDto, UpdatePackingListDto } from './dto/packing-list.dto';
import {
  AuditAction,
  DeliveryChallanStatus,
  InvoiceStatus,
  PackingListStatus,
} from '@prisma/client';

@Injectable()
export class PackingListsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async generateNumber() {
    const count = await this.prisma.packingList.count();
    const year = new Date().getFullYear();
    return `PL-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private async getCustomerOrThrow(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private async validateInvoiceLink(
    invoiceId: string | undefined,
    customerId: string,
    projectId: string,
  ) {
    if (!invoiceId) return null;

    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.customerId !== customerId || invoice.projectId !== projectId) {
      throw new BadRequestException('Invoice does not match the selected customer and project');
    }
    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException('Packing lists can only be linked to sent or paid invoices');
    }
    return invoice;
  }

  private async validateDeliveryChallanLink(
    deliveryChallanId: string | undefined,
    customerId: string,
    projectId: string,
  ) {
    if (!deliveryChallanId) return null;

    const challan = await this.prisma.deliveryChallan.findUnique({
      where: { id: deliveryChallanId },
    });
    if (!challan) throw new NotFoundException('Delivery challan not found');
    if (challan.customerId !== customerId || challan.projectId !== projectId) {
      throw new BadRequestException('Delivery challan does not match the selected customer and project');
    }
    if (challan.status === DeliveryChallanStatus.DRAFT) {
      throw new BadRequestException('Packing lists can only be linked to sent or dispatched delivery challans');
    }
    return challan;
  }

  async create(dto: CreatePackingListDto, userId: string) {
    await this.validateInvoiceLink(dto.invoiceId, dto.customerId, dto.projectId);
    await this.validateDeliveryChallanLink(dto.deliveryChallanId, dto.customerId, dto.projectId);
    const customer = await this.getCustomerOrThrow(dto.customerId);
    const addressSnapshot = buildAddressSnapshot(customer, dto);

    const packingListNumber = await this.generateNumber();
    const items = dto.items.map((i) => ({
      description: i.description,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unit: i.unit?.trim() || 'Nos',
      boxNo: i.boxNo?.trim() || null,
    }));

    const packingList = await this.prisma.packingList.create({
      data: {
        packingListNumber,
        invoiceId: dto.invoiceId,
        deliveryChallanId: dto.deliveryChallanId,
        customerId: dto.customerId,
        projectId: dto.projectId,
        packingDate: new Date(dto.packingDate),
        totalPackages: dto.totalPackages,
        grossWeightKg: dto.grossWeightKg,
        netWeightKg: dto.netWeightKg,
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
        deliveryChallan: { select: { id: true, challanNumber: true } },
      },
    });

    await this.audit.log({
      entityType: 'PackingList',
      entityId: packingList.id,
      action: AuditAction.CREATE,
      userId,
    });

    return packingList;
  }

  private buildWhere(options: { status?: PackingListStatus; search?: string }) {
    const where: Record<string, unknown> = {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { packingListNumber: { contains: term, mode: 'insensitive' } },
        { customer: { companyName: { contains: term, mode: 'insensitive' } } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
        { invoice: { invoiceNumber: { contains: term, mode: 'insensitive' } } },
        { deliveryChallan: { challanNumber: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  async findAll(options: {
    status?: PackingListStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 10));
    const where = this.buildWhere(options);

    const [total, data] = await Promise.all([
      this.prisma.packingList.count({ where: where as never }),
      this.prisma.packingList.findMany({
        where: where as never,
        include: {
          customer: { select: { id: true, companyName: true } },
          project: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          deliveryChallan: { select: { id: true, challanNumber: true } },
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
    const packingList = await this.prisma.packingList.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
        project: true,
        invoice: { select: { id: true, invoiceNumber: true } },
        deliveryChallan: { select: { id: true, challanNumber: true } },
      },
    });
    if (!packingList) throw new NotFoundException('Packing list not found');
    return packingList;
  }

  private assertEditable(status: PackingListStatus) {
    if (status !== PackingListStatus.DRAFT && status !== PackingListStatus.SENT) {
      throw new BadRequestException('Only draft or sent packing lists can be edited');
    }
  }

  async update(id: string, dto: UpdatePackingListDto, userId: string) {
    const packingList = await this.findOne(id);
    this.assertEditable(packingList.status);

    const customerId = dto.customerId ?? packingList.customerId;
    const projectId = dto.projectId ?? packingList.projectId;
    await this.validateInvoiceLink(dto.invoiceId ?? packingList.invoiceId ?? undefined, customerId, projectId);
    await this.validateDeliveryChallanLink(
      dto.deliveryChallanId ?? packingList.deliveryChallanId ?? undefined,
      customerId,
      projectId,
    );

    if (dto.items?.length) {
      await this.prisma.packingListItem.deleteMany({ where: { packingListId: id } });
      await this.prisma.packingListItem.createMany({
        data: dto.items.map((item) => ({
          packingListId: id,
          description: item.description,
          hsnCode: item.hsnCode,
          quantity: item.quantity,
          unit: item.unit?.trim() || 'Nos',
          boxNo: item.boxNo?.trim() || null,
        })),
      });
    }

    const customer = await this.getCustomerOrThrow(customerId);
    const addressSnapshot = buildAddressSnapshot(customer, {
      customerGstin: dto.customerGstin ?? packingList.customerGstin ?? undefined,
      billToAddress: dto.billToAddress ?? packingList.billToAddress ?? undefined,
      shipToAddress: dto.shipToAddress ?? packingList.shipToAddress ?? undefined,
      sameAsBilling: dto.sameAsBilling,
    });

    const headerUpdates: Record<string, unknown> = {
      customerGstin: addressSnapshot.customerGstin,
      billToAddress: addressSnapshot.billToAddress,
      shipToAddress: addressSnapshot.shipToAddress,
    };
    if (dto.invoiceId !== undefined) headerUpdates.invoiceId = dto.invoiceId || null;
    if (dto.deliveryChallanId !== undefined) headerUpdates.deliveryChallanId = dto.deliveryChallanId || null;
    if (dto.customerId) headerUpdates.customerId = dto.customerId;
    if (dto.projectId) headerUpdates.projectId = dto.projectId;
    if (dto.packingDate) headerUpdates.packingDate = new Date(dto.packingDate);
    if (dto.totalPackages !== undefined) headerUpdates.totalPackages = dto.totalPackages;
    if (dto.grossWeightKg !== undefined) headerUpdates.grossWeightKg = dto.grossWeightKg;
    if (dto.netWeightKg !== undefined) headerUpdates.netWeightKg = dto.netWeightKg;
    if (dto.notes !== undefined) headerUpdates.notes = dto.notes;
    if (dto.placeOfSupply !== undefined) headerUpdates.placeOfSupply = dto.placeOfSupply;
    if (dto.subject !== undefined) headerUpdates.subject = dto.subject;

    const updated = await this.prisma.packingList.update({
      where: { id },
      data: headerUpdates,
      include: {
        items: true,
        customer: true,
        project: true,
        invoice: { select: { id: true, invoiceNumber: true } },
        deliveryChallan: { select: { id: true, challanNumber: true } },
      },
    });

    await this.audit.log({
      entityType: 'PackingList',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
    });

    return updated;
  }

  async send(id: string, userId: string) {
    const packingList = await this.prisma.packingList.update({
      where: { id },
      data: { status: PackingListStatus.SENT },
    });
    await this.audit.log({
      entityType: 'PackingList',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
    });
    return packingList;
  }

  async pack(id: string, userId: string) {
    const packingList = await this.findOne(id);
    if (packingList.status === PackingListStatus.DRAFT) {
      throw new BadRequestException('Send the packing list before marking it packed');
    }
    if (packingList.status === PackingListStatus.PACKED) {
      throw new BadRequestException('Packing list is already marked packed');
    }

    const updated = await this.prisma.packingList.update({
      where: { id },
      data: { status: PackingListStatus.PACKED },
      include: {
        items: true,
        customer: true,
        project: true,
        invoice: { select: { id: true, invoiceNumber: true } },
        deliveryChallan: { select: { id: true, challanNumber: true } },
      },
    });

    await this.audit.log({
      entityType: 'PackingList',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
      metadata: { packed: true },
    });

    return updated;
  }
}

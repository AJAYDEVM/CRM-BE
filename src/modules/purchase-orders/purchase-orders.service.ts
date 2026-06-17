import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { SettingsService } from '../settings/settings.service';
import { getDefaultPaymentTerms } from '../../common/utils/document-snapshot.utils';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderItemDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { AuditAction, PurchaseOrderStatus } from '@prisma/client';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  private calcLineAmount(item: PurchaseOrderItemDto) {
    return item.quantity * item.unitPrice;
  }

  private calcLineTax(item: PurchaseOrderItemDto) {
    const amount = this.calcLineAmount(item);
    return (amount * (item.taxRate ?? 18)) / 100;
  }

  private async generateNumber() {
    const count = await this.prisma.purchaseOrder.count();
    const year = new Date().getFullYear();
    return `PO-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private async getVendorOrThrow(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  private async validateProjectLink(projectId: string | undefined) {
    if (!projectId) return null;
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private mapItems(items: PurchaseOrderItemDto[]) {
    return items.map((i) => ({
      description: i.description,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: i.taxRate ?? 18,
      amount: this.calcLineAmount(i),
    }));
  }

  private calcTotals(items: PurchaseOrderItemDto[]) {
    const mapped = this.mapItems(items);
    const amount = mapped.reduce((s, i) => s + i.amount, 0);
    const tax = items.reduce((s, i) => s + this.calcLineTax(i), 0);
    return { mapped, amount, tax, total: amount + tax };
  }

  private buildVendorSnapshot(
    vendor: { gstNumber: string | null; address: string | null },
    dto: { vendorGstin?: string; vendorAddress?: string },
  ) {
    return {
      vendorGstin: dto.vendorGstin?.trim() || vendor.gstNumber || undefined,
      vendorAddress: dto.vendorAddress?.trim() || vendor.address || undefined,
    };
  }

  async create(dto: CreatePurchaseOrderDto, userId: string) {
    const vendor = await this.getVendorOrThrow(dto.vendorId);
    await this.validateProjectLink(dto.projectId);
    const vendorSnapshot = this.buildVendorSnapshot(vendor, dto);
    const paymentTerms = dto.paymentTerms ?? (await getDefaultPaymentTerms(this.settings));

    const poNumber = await this.generateNumber();
    const { mapped, amount, tax, total } = this.calcTotals(dto.items);

    const purchaseOrder = await this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        vendorId: dto.vendorId,
        projectId: dto.projectId,
        orderDate: new Date(dto.orderDate),
        expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
        amount,
        tax,
        total,
        placeOfSupply: dto.placeOfSupply,
        subject: dto.subject,
        vendorGstin: vendorSnapshot.vendorGstin,
        vendorAddress: vendorSnapshot.vendorAddress,
        shipToAddress: dto.shipToAddress,
        paymentTerms,
        notes: dto.notes,
        items: { create: mapped },
      },
      include: {
        items: true,
        vendor: true,
        project: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      entityType: 'PurchaseOrder',
      entityId: purchaseOrder.id,
      action: AuditAction.CREATE,
      userId,
    });

    return purchaseOrder;
  }

  private buildWhere(options: { status?: PurchaseOrderStatus; search?: string }) {
    const where: Record<string, unknown> = {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { poNumber: { contains: term, mode: 'insensitive' } },
        { vendor: { companyName: { contains: term, mode: 'insensitive' } } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
        { subject: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async findAll(options: {
    status?: PurchaseOrderStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 10));
    const where = this.buildWhere(options);

    const [total, data] = await Promise.all([
      this.prisma.purchaseOrder.count({ where: where as never }),
      this.prisma.purchaseOrder.findMany({
        where: where as never,
        include: {
          vendor: { select: { id: true, companyName: true } },
          project: { select: { id: true, name: true } },
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
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: true,
        vendor: true,
        project: { select: { id: true, name: true } },
      },
    });
    if (!purchaseOrder) throw new NotFoundException('Purchase order not found');
    return purchaseOrder;
  }

  private assertEditable(status: PurchaseOrderStatus) {
    if (status !== PurchaseOrderStatus.DRAFT && status !== PurchaseOrderStatus.SENT) {
      throw new BadRequestException('Only draft or sent purchase orders can be edited');
    }
  }

  async update(id: string, dto: UpdatePurchaseOrderDto, userId: string) {
    const purchaseOrder = await this.findOne(id);
    this.assertEditable(purchaseOrder.status);

    const vendorId = dto.vendorId ?? purchaseOrder.vendorId;
    const vendor = await this.getVendorOrThrow(vendorId);
    if (dto.projectId !== undefined) {
      await this.validateProjectLink(dto.projectId || undefined);
    }

    if (dto.items?.length) {
      await this.prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      const { mapped, amount, tax, total } = this.calcTotals(dto.items);
      await this.prisma.purchaseOrderItem.createMany({
        data: mapped.map((item) => ({ ...item, purchaseOrderId: id })),
      });

      const vendorSnapshot = this.buildVendorSnapshot(vendor, {
        vendorGstin: dto.vendorGstin ?? purchaseOrder.vendorGstin ?? undefined,
        vendorAddress: dto.vendorAddress ?? purchaseOrder.vendorAddress ?? undefined,
      });

      const headerUpdates: Record<string, unknown> = {
        amount,
        tax,
        total,
        vendorGstin: vendorSnapshot.vendorGstin,
        vendorAddress: vendorSnapshot.vendorAddress,
      };
      if (dto.vendorId) headerUpdates.vendorId = dto.vendorId;
      if (dto.projectId !== undefined) headerUpdates.projectId = dto.projectId || null;
      if (dto.orderDate) headerUpdates.orderDate = new Date(dto.orderDate);
      if (dto.expectedDeliveryDate !== undefined) {
        headerUpdates.expectedDeliveryDate = dto.expectedDeliveryDate
          ? new Date(dto.expectedDeliveryDate)
          : null;
      }
      if (dto.placeOfSupply !== undefined) headerUpdates.placeOfSupply = dto.placeOfSupply;
      if (dto.subject !== undefined) headerUpdates.subject = dto.subject;
      if (dto.shipToAddress !== undefined) headerUpdates.shipToAddress = dto.shipToAddress;
      if (dto.paymentTerms !== undefined) headerUpdates.paymentTerms = dto.paymentTerms;
      if (dto.notes !== undefined) headerUpdates.notes = dto.notes;

      const updated = await this.prisma.purchaseOrder.update({
        where: { id },
        data: headerUpdates,
        include: {
          items: true,
          vendor: true,
          project: { select: { id: true, name: true } },
        },
      });

      await this.audit.log({
        entityType: 'PurchaseOrder',
        entityId: id,
        action: AuditAction.UPDATE,
        userId,
      });

      return updated;
    }

    const vendorSnapshot = this.buildVendorSnapshot(vendor, {
      vendorGstin: dto.vendorGstin ?? purchaseOrder.vendorGstin ?? undefined,
      vendorAddress: dto.vendorAddress ?? purchaseOrder.vendorAddress ?? undefined,
    });

    const headerUpdates: Record<string, unknown> = {
      vendorGstin: vendorSnapshot.vendorGstin,
      vendorAddress: vendorSnapshot.vendorAddress,
    };
    if (dto.vendorId) headerUpdates.vendorId = dto.vendorId;
    if (dto.projectId !== undefined) headerUpdates.projectId = dto.projectId || null;
    if (dto.orderDate) headerUpdates.orderDate = new Date(dto.orderDate);
    if (dto.expectedDeliveryDate !== undefined) {
      headerUpdates.expectedDeliveryDate = dto.expectedDeliveryDate
        ? new Date(dto.expectedDeliveryDate)
        : null;
    }
    if (dto.placeOfSupply !== undefined) headerUpdates.placeOfSupply = dto.placeOfSupply;
    if (dto.subject !== undefined) headerUpdates.subject = dto.subject;
    if (dto.shipToAddress !== undefined) headerUpdates.shipToAddress = dto.shipToAddress;
    if (dto.paymentTerms !== undefined) headerUpdates.paymentTerms = dto.paymentTerms;
    if (dto.notes !== undefined) headerUpdates.notes = dto.notes;

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: headerUpdates,
      include: {
        items: true,
        vendor: true,
        project: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      entityType: 'PurchaseOrder',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
    });

    return updated;
  }

  async send(id: string, userId: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.SENT },
    });
    await this.audit.log({
      entityType: 'PurchaseOrder',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
    });
    return purchaseOrder;
  }

  async receive(id: string, userId: string) {
    const purchaseOrder = await this.findOne(id);

    if (purchaseOrder.status === PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Send the purchase order before marking it as received');
    }
    if (purchaseOrder.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException('Purchase order has already been marked as received');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.RECEIVED },
    });

    await this.audit.log({
      entityType: 'PurchaseOrder',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      userId,
      metadata: { status: PurchaseOrderStatus.RECEIVED },
    });

    return updated;
  }
}

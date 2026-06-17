import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import {
  CreateProductDto,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  StockTransactionDto,
} from './dto/inventory.dto';
import { AuditAction, InventoryItemStatus, StockTransactionType } from '@prisma/client';

const itemInclude = {
  product: true,
  vendor: { select: { id: true, companyName: true } },
  stockTransactions: {
    where: { type: StockTransactionType.PROJECT_ASSIGNMENT },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: { project: { select: { id: true, name: true } } },
  },
};

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async createProduct(dto: CreateProductDto, userId: string) {
    const product = await this.prisma.product.create({ data: dto });
    await this.audit.log({
      entityType: 'Product',
      entityId: product.id,
      action: AuditAction.CREATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });
    return product;
  }

  findAllProducts() {
    return this.prisma.product.findMany({
      include: { _count: { select: { inventoryItems: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createItem(dto: CreateInventoryItemDto, userId: string) {
    if (dto.status === InventoryItemStatus.ASSIGNED) {
      throw new BadRequestException('Create the item as Available, then assign it to a project');
    }
    const vendor = await this.prisma.vendor.findUnique({ where: { id: dto.vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const item = await this.prisma.inventoryItem.create({
      data: dto,
      include: itemInclude,
    });
    await this.audit.log({
      entityType: 'InventoryItem',
      entityId: item.id,
      action: AuditAction.CREATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });
    return item;
  }

  private buildItemWhere(options: {
    status?: InventoryItemStatus;
    projectId?: string;
    search?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (options.projectId) {
      where.status = InventoryItemStatus.ASSIGNED;
      where.stockTransactions = {
        some: {
          projectId: options.projectId,
          type: StockTransactionType.PROJECT_ASSIGNMENT,
        },
      };
    } else if (options.status) {
      where.status = options.status;
    }

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { serialNumber: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
        { product: { name: { contains: term, mode: 'insensitive' } } },
        { product: { category: { contains: term, mode: 'insensitive' } } },
        { vendor: { companyName: { contains: term, mode: 'insensitive' } } },
        {
          stockTransactions: {
            some: {
              type: StockTransactionType.PROJECT_ASSIGNMENT,
              project: { name: { contains: term, mode: 'insensitive' } },
            },
          },
        },
      ];
    }

    return where;
  }

  async findItems(options: {
    status?: InventoryItemStatus;
    projectId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 10));
    const where = this.buildItemWhere(options);

    const [data, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: where as never,
        include: itemInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryItem.count({ where: where as never }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async updateItem(id: string, dto: UpdateInventoryItemDto, userId: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');

    if (dto.status === InventoryItemStatus.ASSIGNED && item.status !== InventoryItemStatus.ASSIGNED) {
      throw new BadRequestException('Use assign transaction to mark item as assigned');
    }

    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: dto,
      include: itemInclude,
    });

    await this.audit.log({
      entityType: 'InventoryItem',
      entityId: id,
      action: AuditAction.UPDATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
    });

    return updated;
  }

  getDashboardStats() {
    return this.prisma.inventoryItem.groupBy({
      by: ['status'],
      _sum: { quantity: true },
      _count: true,
    });
  }

  async recordTransaction(dto: StockTransactionDto, userId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
      include: { product: { select: { name: true } } },
    });
    if (!item) throw new NotFoundException('Inventory item not found');

    if (dto.type === StockTransactionType.PROJECT_ASSIGNMENT) {
      if (item.status !== InventoryItemStatus.AVAILABLE) {
        throw new BadRequestException('Only available items can be assigned to a project');
      }
      if (!dto.projectId) {
        throw new BadRequestException('Project is required for assignment');
      }
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException('Project not found');
    }

    if (dto.type === StockTransactionType.RETURN) {
      if (item.status !== InventoryItemStatus.ASSIGNED) {
        throw new BadRequestException('Only assigned items can be returned');
      }
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stockTransaction.create({ data: dto });

      if (dto.type === StockTransactionType.PROJECT_ASSIGNMENT) {
        await tx.inventoryItem.update({
          where: { id: dto.inventoryItemId },
          data: { status: InventoryItemStatus.ASSIGNED },
        });
      } else if (dto.type === StockTransactionType.RETURN) {
        await tx.inventoryItem.update({
          where: { id: dto.inventoryItemId },
          data: { status: InventoryItemStatus.AVAILABLE },
        });
      }

      return created;
    });

    const description =
      dto.type === StockTransactionType.PROJECT_ASSIGNMENT
        ? `Assigned ${item.product.name} (${item.serialNumber}) to project`
        : `Returned ${item.product.name} (${item.serialNumber}) from project`;

    await this.audit.log({
      entityType: 'InventoryItem',
      entityId: dto.inventoryItemId,
      action: AuditAction.STATUS_CHANGE,
      userId,
      metadata: {
        transactionId: transaction.id,
        transactionType: dto.type,
        projectId: dto.projectId,
        description,
      },
    });

    return transaction;
  }
}

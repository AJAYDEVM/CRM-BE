import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CreateProductDto,
  CreateInventoryItemDto,
  StockTransactionDto,
} from './dto/inventory.dto';
import { InventoryItemStatus, StockTransactionType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  createProduct(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }

  findAllProducts() {
    return this.prisma.product.findMany({ include: { _count: { select: { inventoryItems: true } } } });
  }

  createItem(dto: CreateInventoryItemDto) {
    return this.prisma.inventoryItem.create({
      data: dto,
      include: { product: true },
    });
  }

  findAllItems(status?: InventoryItemStatus) {
    return this.prisma.inventoryItem.findMany({
      where: status ? { status } : undefined,
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  getDashboardStats() {
    return this.prisma.inventoryItem.groupBy({
      by: ['status'],
      _sum: { quantity: true },
      _count: true,
    });
  }

  async recordTransaction(dto: StockTransactionDto) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: dto.inventoryItemId } });
    if (!item) throw new NotFoundException('Inventory item not found');

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

    return transaction;
  }
}

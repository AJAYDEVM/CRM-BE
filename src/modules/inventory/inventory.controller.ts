import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InventoryItemStatus } from '@prisma/client';
import { InventoryService } from './inventory.service';
import {
  CreateProductDto,
  CreateInventoryItemDto,
  StockTransactionDto,
} from './dto/inventory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.service.createProduct(dto);
  }

  @Get('products')
  findProducts() {
    return this.service.findAllProducts();
  }

  @Post('items')
  createItem(@Body() dto: CreateInventoryItemDto) {
    return this.service.createItem(dto);
  }

  @Get('items')
  findItems(@Query('status') status?: InventoryItemStatus) {
    return this.service.findAllItems(status);
  }

  @Get('dashboard')
  dashboard() {
    return this.service.getDashboardStats();
  }

  @Post('transactions')
  recordTransaction(@Body() dto: StockTransactionDto) {
    return this.service.recordTransaction(dto);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InventoryItemStatus } from '@prisma/client';
import { InventoryService } from './inventory.service';
import {
  CreateProductDto,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  StockTransactionDto,
} from './dto/inventory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Post('products')
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.service.createProduct(dto, user.sub);
  }

  @Get('products')
  findProducts() {
    return this.service.findAllProducts();
  }

  @Post('items')
  createItem(@Body() dto: CreateInventoryItemDto, @CurrentUser() user: AuthUser) {
    return this.service.createItem(dto, user.sub);
  }

  @Get('items')
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findItems(
    @Query('status') status?: InventoryItemStatus,
    @Query('projectId') projectId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findItems({
      status,
      projectId,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch('items/:id')
  updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateItem(id, dto, user.sub);
  }

  @Get('dashboard')
  dashboard() {
    return this.service.getDashboardStats();
  }

  @Post('transactions')
  recordTransaction(@Body() dto: StockTransactionDto, @CurrentUser() user: AuthUser) {
    return this.service.recordTransaction(dto, user.sub);
  }
}

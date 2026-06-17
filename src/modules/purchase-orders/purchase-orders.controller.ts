import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '@prisma/client';
import type { Response } from 'express';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderPdfService } from './purchase-order-pdf.service';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from './dto/purchase-order.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Purchase Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private service: PurchaseOrdersService,
    private pdfService: PurchaseOrderPdfService,
  ) {}

  @Post()
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.sub);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('status') status?: PurchaseOrderStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download purchase order as PDF' })
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.pdfService.generate(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user.sub);
  }

  @Patch(':id/send')
  send(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.send(id, user.sub);
  }

  @Patch(':id/receive')
  receive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.receive(id, user.sub);
  }
}

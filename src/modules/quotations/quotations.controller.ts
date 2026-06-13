import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuotationStatus } from '@prisma/client';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto, AddQuotationItemsDto } from './dto/quotation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Quotations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quotations')
export class QuotationsController {
  constructor(private service: QuotationsService) {}

  @Post()
  create(@Body() dto: CreateQuotationDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.sub);
  }

  @Get()
  findAll(@Query('status') status?: QuotationStatus) {
    return this.service.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: AddQuotationItemsDto, @CurrentUser() user: AuthUser) {
    return this.service.addItems(id, dto, user.sub);
  }

  @Patch(':id/send')
  @ApiOperation({ summary: 'Send quotation to customer' })
  send(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.send(id, user.sub);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve quotation' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, user.sub);
  }
}

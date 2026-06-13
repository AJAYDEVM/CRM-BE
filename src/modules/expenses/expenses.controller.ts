import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApprovalStatus, ExpenseReferenceType, RoleName } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, ApproveExpenseDto } from './dto/expense.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private service: ExpensesService) {}

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.sub, user.sub);
  }

  @Get()
  findAll(
    @Query('referenceType') referenceType?: ExpenseReferenceType,
    @Query('approvalStatus') approvalStatus?: ApprovalStatus,
  ) {
    return this.service.findAll(referenceType, approvalStatus);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/approval')
  @Roles(RoleName.ADMIN, RoleName.FINANCE, RoleName.PROJECT_MANAGER)
  approve(@Param('id') id: string, @Body() dto: ApproveExpenseDto, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, dto, user.sub);
  }
}

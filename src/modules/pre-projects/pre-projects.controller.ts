import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PreProjectStatus } from '@prisma/client';
import { PreProjectsService } from './pre-projects.service';
import {
  CreatePreProjectDto,
  AddPreProjectExpenseDto,
  ConvertPreProjectDto,
} from './dto/pre-project.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Pre Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pre-projects')
export class PreProjectsController {
  constructor(private service: PreProjectsService) {}

  @Post()
  create(@Body() dto: CreatePreProjectDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.sub);
  }

  @Get()
  findAll(@Query('status') status?: PreProjectStatus) {
    return this.service.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/expenses')
  @ApiOperation({ summary: 'Add pre-project expense (travel, hotel, site visit)' })
  addExpense(
    @Param('id') id: string,
    @Body() dto: AddPreProjectExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addExpense(id, dto, user.sub, user.role);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convert pre-project to project with expense migration' })
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertPreProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.convertToProject(id, dto, user.sub);
  }
}

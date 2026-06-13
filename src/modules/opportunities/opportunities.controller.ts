import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OpportunityStatus } from '@prisma/client';
import { OpportunitiesService } from './opportunities.service';
import {
  CreateOpportunityDto,
  UpdateOpportunityDto,
  UpdateOpportunityStageDto,
} from './dto/opportunity.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Opportunities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private service: OpportunitiesService) {}

  @Post()
  create(@Body() dto: CreateOpportunityDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.sub);
  }

  @Get()
  findAll(@Query('status') status?: OpportunityStatus) {
    return this.service.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOpportunityDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user.sub);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Update opportunity pipeline stage' })
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateOpportunityStageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateStage(id, dto, user.sub);
  }

  @Post(':id/convert-to-pre-project')
  @ApiOperation({ summary: 'Convert opportunity to pre-project' })
  convert(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.convertToPreProject(id, user.sub);
  }
}

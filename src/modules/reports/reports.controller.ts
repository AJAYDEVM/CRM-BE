import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard metrics and charts' })
  dashboard() {
    return this.service.getDashboard();
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Reports page charts' })
  analytics() {
    return this.service.getAnalytics();
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Paid invoice revenue' })
  revenue() {
    return this.service.getRevenue();
  }

  @Get('profitability')
  @ApiOperation({ summary: 'Project profitability' })
  profitability() {
    return this.service.getProfitability();
  }
}

import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { SettingsService } from './settings.service';
import { UpdateCompanyProfileDto } from './dto/company-profile.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private service: SettingsService) {}

  @Get('company-profile')
  @ApiOperation({ summary: 'Get company profile' })
  getCompanyProfile() {
    return this.service.getCompanyProfile();
  }

  @Patch('company-profile')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Update company profile' })
  updateCompanyProfile(@Body() dto: UpdateCompanyProfileDto, @CurrentUser() user: AuthUser) {
    return this.service.updateCompanyProfile(dto, user.sub);
  }
}

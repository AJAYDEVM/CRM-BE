import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import type { Response } from 'express';
import { createReadStream } from 'fs';
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

  @Post('company-logo')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Upload company logo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('logo', { storage: memoryStorage() }))
  uploadCompanyLogo(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.service.saveCompanyLogo(file, user.sub);
  }

  @Get('company-logo')
  @ApiOperation({ summary: 'Get company logo image' })
  async getCompanyLogo(@Res() res: Response) {
    const { path, fileName } = await this.service.getCompanyLogoStream();
    const ext = fileName.toLowerCase();
    const contentType = ext.endsWith('.png')
      ? 'image/png'
      : ext.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    res.set('Content-Type', contentType);
    createReadStream(path).pipe(res);
  }
}

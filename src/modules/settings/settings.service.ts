import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { UpdateCompanyProfileDto } from './dto/company-profile.dto';
import { AuditAction } from '@prisma/client';

const DEFAULT_PROFILE = {
  id: 'default',
  companyName: 'TMCI Engineering Pvt Ltd',
  gstNumber: '29AABCT1234A1Z5',
  email: 'info@tmci.com',
  phone: '+91 80 1234 5678',
};

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async getCompanyProfile() {
    const profile = await this.prisma.companyProfile.findUnique({
      where: { id: 'default' },
    });

    if (profile) return profile;

    return this.prisma.companyProfile.create({ data: DEFAULT_PROFILE });
  }

  async updateCompanyProfile(dto: UpdateCompanyProfileDto, userId: string) {
    const profile = await this.prisma.companyProfile.upsert({
      where: { id: 'default' },
      update: {
        companyName: dto.companyName.trim(),
        gstNumber: dto.gstNumber?.trim().toUpperCase() || null,
        email: dto.email.trim(),
        phone: dto.phone.trim(),
      },
      create: {
        ...DEFAULT_PROFILE,
        companyName: dto.companyName.trim(),
        gstNumber: dto.gstNumber?.trim().toUpperCase() || null,
        email: dto.email.trim(),
        phone: dto.phone.trim(),
      },
    });

    await this.audit.log({
      entityType: 'CompanyProfile',
      entityId: profile.id,
      action: AuditAction.UPDATE,
      userId,
      changes: dto as unknown as Record<string, unknown>,
      metadata: { description: 'Company profile settings updated' },
    });

    return profile;
  }
}

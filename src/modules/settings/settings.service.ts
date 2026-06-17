import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createWriteStream, existsSync } from 'fs';
import { extname } from 'path';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { UpdateCompanyProfileDto } from './dto/company-profile.dto';
import { AuditAction } from '@prisma/client';
import { getCompanyLogoPath, getUploadedLogoPath, getUploadsDir } from '../../common/utils/company-logo.utils';

const DEFAULT_QUOTATION_TERMS = `1. Price: As mentioned above
2. Payment: 100% Advance
3. Delivery: 4-6 weeks upon receipt of your valuable Purchase order and advance payment
4. Validity: The Quote is valid for 30 days from the date of issue
5. Taxes: GST shall be charged extra as applicable
6. Packing & Forwarding: Inclusive
7. Transportation: Inclusive
8. Warranty: One year from the date of invoice. Defective or wrongly supplied goods should be replaced at no extra cost.`;

const DEFAULT_PROFILE = {
  id: 'default',
  companyName: 'TMCI Technology Private Limited',
  cin: 'U52335KA2012PTC067266',
  address:
    '# 66, Ground Floor, 2nd Cross\nVignana Nagar, New Thippasandra Post\nBangalore Karnataka 560075\nIndia',
  gstNumber: '29AAECT4944P1ZJ',
  email: 'satheesh@tazkmazter.com',
  phone: '+91 80 1234 5678',
  bankName: 'STATE BANK OF INDIA',
  bankAccountNumber: '67299135280',
  bankBranch: 'PPB INDIRANAGAR, BANGALORE',
  bankIfsc: 'SBIN0070679',
  defaultQuotationTerms: DEFAULT_QUOTATION_TERMS,
  defaultPaymentTerms: 'Due on Receipt',
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
        cin: dto.cin?.trim() || null,
        address: dto.address?.trim() || null,
        gstNumber: dto.gstNumber?.trim().toUpperCase() || null,
        email: dto.email.trim(),
        phone: dto.phone.trim(),
        bankName: dto.bankName?.trim() || null,
        bankAccountNumber: dto.bankAccountNumber?.trim() || null,
        bankBranch: dto.bankBranch?.trim() || null,
        bankIfsc: dto.bankIfsc?.trim().toUpperCase() || null,
        defaultQuotationTerms: dto.defaultQuotationTerms?.trim() || null,
        defaultPaymentTerms: dto.defaultPaymentTerms?.trim() || null,
      },
      create: {
        ...DEFAULT_PROFILE,
        companyName: dto.companyName.trim(),
        cin: dto.cin?.trim() || null,
        address: dto.address?.trim() || null,
        gstNumber: dto.gstNumber?.trim().toUpperCase() || null,
        email: dto.email.trim(),
        phone: dto.phone.trim(),
        bankName: dto.bankName?.trim() || null,
        bankAccountNumber: dto.bankAccountNumber?.trim() || null,
        bankBranch: dto.bankBranch?.trim() || null,
        bankIfsc: dto.bankIfsc?.trim().toUpperCase() || null,
        defaultQuotationTerms: dto.defaultQuotationTerms?.trim() || DEFAULT_QUOTATION_TERMS,
        defaultPaymentTerms: dto.defaultPaymentTerms?.trim() || 'Due on Receipt',
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

  async saveCompanyLogo(file: Express.Multer.File, userId: string) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }

    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      throw new BadRequestException('Logo must be PNG, JPG, or WEBP');
    }

    const fileName = `company-logo${ext}`;
    const target = getUploadedLogoPath(fileName);

    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(target);
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end(file.buffer);
    });

    const profile = await this.prisma.companyProfile.upsert({
      where: { id: 'default' },
      update: { logoFileName: fileName },
      create: { ...DEFAULT_PROFILE, logoFileName: fileName },
    });

    await this.audit.log({
      entityType: 'CompanyProfile',
      entityId: profile.id,
      action: AuditAction.UPDATE,
      userId,
      metadata: { description: 'Company logo updated' },
    });

    return { logoFileName: fileName };
  }

  getLogoFilePath() {
    return getCompanyLogoPath(null);
  }

  resolveLogoPath(logoFileName?: string | null) {
    return getCompanyLogoPath(logoFileName);
  }

  async getCompanyLogoStream() {
    const profile = await this.getCompanyProfile();
    const path = getCompanyLogoPath(profile.logoFileName);
    if (!path || !existsSync(path)) {
      throw new NotFoundException('Company logo not found');
    }
    return { path, fileName: profile.logoFileName ?? 'logo_tmci.png' };
  }

  getUploadsDirectory() {
    return getUploadsDir();
  }
}

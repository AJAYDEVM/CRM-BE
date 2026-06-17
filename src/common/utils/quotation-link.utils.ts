import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { QuotationStatus } from '@prisma/client';

export async function validateQuotationLink(
  prisma: PrismaService,
  quotationId: string | undefined,
  customerId: string,
) {
  if (!quotationId) return null;

  const quotation = await prisma.quotation.findUnique({ where: { id: quotationId } });
  if (!quotation) throw new NotFoundException('Quotation not found');
  if (quotation.customerId !== customerId) {
    throw new BadRequestException('Quotation does not match the selected customer');
  }
  if (quotation.status === QuotationStatus.DRAFT) {
    throw new BadRequestException('Only sent or approved quotations can be linked to sales documents');
  }
  return quotation;
}

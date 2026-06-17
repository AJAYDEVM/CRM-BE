import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { renderTmciDocument, TmciLineItem } from '../../common/pdf/tmci-document-pdf';

@Injectable()
export class QuotationPdfService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async generate(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { customer: true, items: true },
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    const company = await this.settings.getCompanyProfile();
    const logoPath = this.settings.resolveLogoPath(company.logoFileName);

    const items: TmciLineItem[] = quotation.items.map((item) => {
      const taxableAmount = Number(item.quantity) * Number(item.unitPrice);
      const taxRate = Number(item.taxRate ?? 18);
      const igstAmount = (taxableAmount * taxRate) / 100;
      const description = item.description ? `${item.name}\n${item.description}` : item.name;

      return {
        description,
        hsnCode: item.hsnCode,
        quantity: Number(item.quantity),
        rate: Number(item.unitPrice),
        taxRate,
        taxableAmount,
        igstAmount,
        amount: taxableAmount,
      };
    });

    const buffer = await renderTmciDocument(
      {
        companyName: company.companyName,
        cin: company.cin,
        address: company.address,
        email: company.email,
        gstNumber: company.gstNumber,
        phone: company.phone,
        logoPath,
      },
      {
        type: 'quotation',
        documentNumber: quotation.quotationNumber,
        documentDate: quotation.createdAt,
        reference: quotation.reference,
        placeOfSupply: quotation.placeOfSupply,
        subject: quotation.subject,
        billToName: quotation.customer.companyName,
        billToAddress: quotation.billToAddress ?? quotation.customer.address,
        customerGstin: quotation.customerGstin,
        shipToAddress: quotation.shipToAddress ?? quotation.billToAddress ?? quotation.customer.address,
        items,
        subtotal: Number(quotation.subtotal),
        tax: Number(quotation.tax),
        discount: Number(quotation.discount),
        total: Number(quotation.total),
        terms: quotation.terms,
      },
    );

    return { buffer, filename: `${quotation.quotationNumber}.pdf` };
  }
}

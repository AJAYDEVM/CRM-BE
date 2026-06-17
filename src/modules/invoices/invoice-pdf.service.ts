import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { renderTmciDocument, TmciLineItem } from '../../common/pdf/tmci-document-pdf';

@Injectable()
export class InvoicePdfService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async generate(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, items: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const company = await this.settings.getCompanyProfile();
    const logoPath = this.settings.resolveLogoPath(company.logoFileName);

    const items: TmciLineItem[] = invoice.items.map((item) => {
      const taxableAmount = Number(item.quantity) * Number(item.unitPrice);
      const taxRate = Number(item.taxRate ?? 18);
      const igstAmount = (taxableAmount * taxRate) / 100;

      return {
        description: item.description,
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
        bankName: company.bankName,
        bankAccountNumber: company.bankAccountNumber,
        bankBranch: company.bankBranch,
        bankIfsc: company.bankIfsc,
        logoPath,
      },
      {
        type: 'invoice',
        documentNumber: invoice.invoiceNumber,
        documentDate: invoice.createdAt,
        placeOfSupply: invoice.placeOfSupply,
        paymentTerms: invoice.paymentTerms,
        dueDate: invoice.dueDate,
        subject: invoice.subject,
        billToName: invoice.customer.companyName,
        billToAddress: invoice.billToAddress ?? invoice.customer.address,
        customerGstin: invoice.customerGstin,
        shipToAddress: invoice.shipToAddress ?? invoice.billToAddress ?? invoice.customer.address,
        items,
        subtotal: Number(invoice.amount),
        tax: Number(invoice.tax),
        total: Number(invoice.total),
      },
    );

    return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
  }
}

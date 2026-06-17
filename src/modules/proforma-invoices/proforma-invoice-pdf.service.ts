import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { renderTmciDocument, TmciLineItem } from '../../common/pdf/tmci-document-pdf';

@Injectable()
export class ProformaInvoicePdfService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async generate(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const proforma = await this.prisma.proformaInvoice.findUnique({
      where: { id },
      include: { customer: true, items: true, quotation: { select: { quotationNumber: true } } },
    });

    if (!proforma) {
      throw new NotFoundException('Proforma invoice not found');
    }

    const company = await this.settings.getCompanyProfile();
    const logoPath = this.settings.resolveLogoPath(company.logoFileName);

    const items: TmciLineItem[] = proforma.items.map((item) => {
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
        type: 'proforma_invoice',
        documentNumber: proforma.proformaNumber,
        documentDate: proforma.proformaDate,
        reference: proforma.quotation?.quotationNumber ?? null,
        placeOfSupply: proforma.placeOfSupply,
        paymentTerms: proforma.paymentTerms,
        dueDate: proforma.dueDate,
        subject: proforma.subject,
        billToName: proforma.customer.companyName,
        billToAddress: proforma.billToAddress ?? proforma.customer.address,
        customerGstin: proforma.customerGstin,
        shipToAddress: proforma.shipToAddress ?? proforma.billToAddress ?? proforma.customer.address,
        terms: proforma.notes,
        items,
        subtotal: Number(proforma.amount),
        tax: Number(proforma.tax),
        total: Number(proforma.total),
      },
    );

    return { buffer, filename: `${proforma.proformaNumber}.pdf` };
  }
}

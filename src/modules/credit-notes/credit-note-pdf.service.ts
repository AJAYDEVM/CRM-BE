import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { renderTmciDocument, TmciLineItem } from '../../common/pdf/tmci-document-pdf';

@Injectable()
export class CreditNotePdfService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async generate(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const creditNote = await this.prisma.creditNote.findUnique({
      where: { id },
      include: { customer: true, items: true, invoice: { select: { invoiceNumber: true } } },
    });

    if (!creditNote) {
      throw new NotFoundException('Credit note not found');
    }

    const company = await this.settings.getCompanyProfile();
    const logoPath = this.settings.resolveLogoPath(company.logoFileName);

    const items: TmciLineItem[] = creditNote.items.map((item) => {
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
        type: 'credit_note',
        documentNumber: creditNote.creditNoteNumber,
        documentDate: creditNote.creditDate,
        reference: creditNote.invoice?.invoiceNumber ?? null,
        placeOfSupply: creditNote.placeOfSupply,
        subject: creditNote.subject ?? creditNote.reason,
        billToName: creditNote.customer.companyName,
        billToAddress: creditNote.billToAddress ?? creditNote.customer.address,
        customerGstin: creditNote.customerGstin,
        shipToAddress: creditNote.shipToAddress ?? creditNote.billToAddress ?? creditNote.customer.address,
        items,
        subtotal: Number(creditNote.amount),
        tax: Number(creditNote.tax),
        total: Number(creditNote.total),
      },
    );

    return { buffer, filename: `${creditNote.creditNoteNumber}.pdf` };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { renderTmciDocument, TmciLineItem } from '../../common/pdf/tmci-document-pdf';

@Injectable()
export class DeliveryChallanPdfService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async generate(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const challan = await this.prisma.deliveryChallan.findUnique({
      where: { id },
      include: { customer: true, items: true, invoice: { select: { invoiceNumber: true } } },
    });

    if (!challan) {
      throw new NotFoundException('Delivery challan not found');
    }

    const company = await this.settings.getCompanyProfile();
    const logoPath = this.settings.resolveLogoPath(company.logoFileName);

    const items: TmciLineItem[] = challan.items.map((item) => ({
      description: item.description,
      hsnCode: item.hsnCode,
      quantity: Number(item.quantity),
      unit: item.unit,
      rate: 0,
      taxRate: 0,
      taxableAmount: 0,
      igstAmount: 0,
      amount: 0,
    }));

    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

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
        type: 'delivery_challan',
        documentNumber: challan.challanNumber,
        documentDate: challan.challanDate,
        reference: challan.invoice?.invoiceNumber ?? null,
        placeOfSupply: challan.placeOfSupply,
        subject: challan.subject,
        billToName: challan.customer.companyName,
        billToAddress: challan.billToAddress ?? challan.customer.address,
        customerGstin: challan.customerGstin,
        shipToAddress: challan.shipToAddress ?? challan.billToAddress ?? challan.customer.address,
        vehicleNumber: challan.vehicleNumber,
        driverName: challan.driverName,
        transportMode: challan.transportMode,
        terms: challan.notes,
        items,
        subtotal: totalQty,
        tax: 0,
        total: totalQty,
      },
    );

    return { buffer, filename: `${challan.challanNumber}.pdf` };
  }
}

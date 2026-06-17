import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { renderTmciDocument, TmciLineItem } from '../../common/pdf/tmci-document-pdf';

@Injectable()
export class PackingListPdfService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async generate(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const packingList = await this.prisma.packingList.findUnique({
      where: { id },
      include: {
        customer: true,
        items: true,
        invoice: { select: { invoiceNumber: true } },
        deliveryChallan: { select: { challanNumber: true } },
      },
    });

    if (!packingList) {
      throw new NotFoundException('Packing list not found');
    }

    const company = await this.settings.getCompanyProfile();
    const logoPath = this.settings.resolveLogoPath(company.logoFileName);

    const items: TmciLineItem[] = packingList.items.map((item) => ({
      description: item.description,
      hsnCode: item.hsnCode,
      quantity: Number(item.quantity),
      unit: item.unit,
      boxNo: item.boxNo,
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
        type: 'packing_list',
        documentNumber: packingList.packingListNumber,
        documentDate: packingList.packingDate,
        reference: packingList.invoice?.invoiceNumber ?? null,
        deliveryChallanReference: packingList.deliveryChallan?.challanNumber ?? null,
        placeOfSupply: packingList.placeOfSupply,
        subject: packingList.subject,
        billToName: packingList.customer.companyName,
        billToAddress: packingList.billToAddress ?? packingList.customer.address,
        customerGstin: packingList.customerGstin,
        shipToAddress: packingList.shipToAddress ?? packingList.billToAddress ?? packingList.customer.address,
        totalPackages: packingList.totalPackages,
        grossWeightKg: packingList.grossWeightKg ? Number(packingList.grossWeightKg) : null,
        netWeightKg: packingList.netWeightKg ? Number(packingList.netWeightKg) : null,
        terms: packingList.notes,
        items,
        subtotal: totalQty,
        tax: 0,
        total: totalQty,
      },
    );

    return { buffer, filename: `${packingList.packingListNumber}.pdf` };
  }
}

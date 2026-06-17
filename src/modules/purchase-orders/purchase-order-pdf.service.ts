import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { renderTmciDocument, TmciLineItem } from '../../common/pdf/tmci-document-pdf';

@Injectable()
export class PurchaseOrderPdfService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async generate(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { vendor: true, items: true, project: { select: { name: true } } },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    const company = await this.settings.getCompanyProfile();
    const logoPath = this.settings.resolveLogoPath(company.logoFileName);

    const items: TmciLineItem[] = purchaseOrder.items.map((item) => {
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
        type: 'purchase_order',
        documentNumber: purchaseOrder.poNumber,
        documentDate: purchaseOrder.orderDate,
        reference: purchaseOrder.project?.name ?? null,
        placeOfSupply: purchaseOrder.placeOfSupply,
        paymentTerms: purchaseOrder.paymentTerms,
        dueDate: purchaseOrder.expectedDeliveryDate,
        subject: purchaseOrder.subject,
        billToName: purchaseOrder.vendor.companyName,
        billToAddress: purchaseOrder.vendorAddress ?? purchaseOrder.vendor.address,
        customerGstin: purchaseOrder.vendorGstin,
        shipToName: company.companyName,
        shipToAddress: purchaseOrder.shipToAddress ?? company.address,
        terms: purchaseOrder.notes,
        items,
        subtotal: Number(purchaseOrder.amount),
        tax: Number(purchaseOrder.tax),
        total: Number(purchaseOrder.total),
      },
    );

    return { buffer, filename: `${purchaseOrder.poNumber}.pdf` };
  }
}

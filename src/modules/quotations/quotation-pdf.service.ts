import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../../common/database/prisma.service';

function formatCurrency(amount: number | string) {
  const value = Number(amount);
  return `Rs. ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

@Injectable()
export class QuotationPdfService {
  constructor(private prisma: PrismaService) {}

  async generate(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { customer: true, items: true },
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    const filename = `${quotation.quotationNumber}.pdf`;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), filename }));
      doc.on('error', reject);

      doc.fontSize(22).fillColor('#1e40af').text('TMCI Operations Hub', { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(16).fillColor('#0f172a').text('Quotation', { align: 'left' });
      doc.moveDown(1);

      doc.fontSize(10).fillColor('#475569');
      doc.text(`Quotation No: ${quotation.quotationNumber}`);
      doc.text(`Date: ${formatDate(quotation.createdAt)}`);
      doc.text(`Status: ${quotation.status}`);
      if (quotation.validUntil) {
        doc.text(`Valid Until: ${formatDate(quotation.validUntil)}`);
      }
      doc.moveDown(1);

      doc.fontSize(12).fillColor('#0f172a').text('Bill To', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#334155');
      doc.text(quotation.customer.companyName);
      doc.text(`Contact: ${quotation.customer.contactPerson}`);
      doc.text(`Email: ${quotation.customer.email}`);
      doc.text(`Phone: ${quotation.customer.phone}`);
      if (quotation.customer.address) {
        doc.text(`Address: ${quotation.customer.address}`);
      }
      doc.moveDown(1.2);

      const tableTop = doc.y;
      const colX = {
        item: 50,
        desc: 130,
        qty: 320,
        price: 370,
        tax: 430,
        total: 490,
      };

      doc.fontSize(9).fillColor('#ffffff');
      doc.rect(50, tableTop, 495, 20).fill('#1e40af');
      doc.fillColor('#ffffff');
      doc.text('Item', colX.item + 4, tableTop + 6, { width: 70 });
      doc.text('Description', colX.desc + 4, tableTop + 6, { width: 180 });
      doc.text('Qty', colX.qty + 4, tableTop + 6, { width: 40 });
      doc.text('Price', colX.price + 4, tableTop + 6, { width: 50 });
      doc.text('Tax%', colX.tax + 4, tableTop + 6, { width: 40 });
      doc.text('Total', colX.total + 4, tableTop + 6, { width: 55 });

      let rowY = tableTop + 24;
      doc.fillColor('#334155');

      quotation.items.forEach((item, index) => {
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
        }

        if (index % 2 === 0) {
          doc.rect(50, rowY - 4, 495, 22).fill('#f8fafc');
          doc.fillColor('#334155');
        }

        doc.fontSize(9);
        doc.text(item.name, colX.item + 4, rowY, { width: 72, height: 18, ellipsis: true });
        doc.text(item.description ?? '—', colX.desc + 4, rowY, { width: 180, height: 18, ellipsis: true });
        doc.text(String(Number(item.quantity)), colX.qty + 4, rowY, { width: 40 });
        doc.text(formatCurrency(Number(item.unitPrice)), colX.price + 4, rowY, { width: 50 });
        doc.text(`${Number(item.taxRate)}%`, colX.tax + 4, rowY, { width: 40 });
        doc.text(formatCurrency(Number(item.lineTotal)), colX.total + 4, rowY, { width: 55 });
        rowY += 24;
      });

      doc.moveDown(2);
      const summaryX = 360;
      let summaryY = Math.max(rowY + 20, doc.y);

      doc.fontSize(10).fillColor('#475569');
      doc.text('Subtotal:', summaryX, summaryY, { width: 80, align: 'left' });
      doc.text(formatCurrency(Number(quotation.subtotal)), summaryX + 90, summaryY, { width: 95, align: 'right' });
      summaryY += 18;

      doc.text('Tax:', summaryX, summaryY, { width: 80, align: 'left' });
      doc.text(formatCurrency(Number(quotation.tax)), summaryX + 90, summaryY, { width: 95, align: 'right' });
      summaryY += 18;

      if (Number(quotation.discount) > 0) {
        doc.text('Discount:', summaryX, summaryY, { width: 80, align: 'left' });
        doc.text(formatCurrency(Number(quotation.discount)), summaryX + 90, summaryY, { width: 95, align: 'right' });
        summaryY += 18;
      }

      doc.fontSize(12).fillColor('#0f172a');
      doc.text('Grand Total:', summaryX, summaryY, { width: 80, align: 'left' });
      doc.fillColor('#1e40af').text(formatCurrency(Number(quotation.total)), summaryX + 90, summaryY, {
        width: 95,
        align: 'right',
      });

      if (quotation.notes) {
        summaryY += 40;
        doc.fontSize(10).fillColor('#0f172a').text('Notes', summaryX - 310, summaryY, { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#475569').text(quotation.notes, 50, doc.y, { width: 495 });
      }

      doc.end();
    });
  }
}

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
export class InvoicePdfService {
  constructor(private prisma: PrismaService) {}

  async generate(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, project: true, items: true, payments: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const filename = `${invoice.invoiceNumber}.pdf`;
    const paidTotal = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const balanceDue = Math.max(0, Number(invoice.total) - paidTotal);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), filename }));
      doc.on('error', reject);

      doc.fontSize(22).fillColor('#1e40af').text('TMCI Operations Hub', { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(16).fillColor('#0f172a').text('Tax Invoice', { align: 'left' });
      doc.moveDown(1);

      doc.fontSize(10).fillColor('#475569');
      doc.text(`Invoice No: ${invoice.invoiceNumber}`);
      doc.text(`Invoice Date: ${formatDate(invoice.createdAt)}`);
      doc.text(`Due Date: ${formatDate(invoice.dueDate)}`);
      doc.text(`Status: ${invoice.status}`);
      doc.text(`Project: ${invoice.project.name}`);
      doc.moveDown(1);

      doc.fontSize(12).fillColor('#0f172a').text('Bill To', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#334155');
      doc.text(invoice.customer.companyName);
      doc.text(`Contact: ${invoice.customer.contactPerson}`);
      doc.text(`Email: ${invoice.customer.email}`);
      doc.text(`Phone: ${invoice.customer.phone}`);
      if (invoice.customer.address) {
        doc.text(`Address: ${invoice.customer.address}`);
      }
      doc.moveDown(1.2);

      const tableTop = doc.y;
      const colX = {
        desc: 50,
        qty: 340,
        rate: 390,
        amount: 470,
      };

      doc.fontSize(9).fillColor('#ffffff');
      doc.rect(50, tableTop, 495, 20).fill('#1e40af');
      doc.fillColor('#ffffff');
      doc.text('Description', colX.desc + 4, tableTop + 6, { width: 280 });
      doc.text('Qty', colX.qty + 4, tableTop + 6, { width: 40 });
      doc.text('Rate', colX.rate + 4, tableTop + 6, { width: 70 });
      doc.text('Amount', colX.amount + 4, tableTop + 6, { width: 70 });

      let rowY = tableTop + 24;
      doc.fillColor('#334155');

      invoice.items.forEach((item, index) => {
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
        }

        if (index % 2 === 0) {
          doc.rect(50, rowY - 4, 495, 22).fill('#f8fafc');
          doc.fillColor('#334155');
        }

        doc.fontSize(9);
        doc.text(item.description, colX.desc + 4, rowY, { width: 280, height: 18, ellipsis: true });
        doc.text(String(Number(item.quantity)), colX.qty + 4, rowY, { width: 40 });
        doc.text(formatCurrency(Number(item.unitPrice)), colX.rate + 4, rowY, { width: 70 });
        doc.text(formatCurrency(Number(item.amount)), colX.amount + 4, rowY, { width: 70 });
        rowY += 24;
      });

      const summaryX = 360;
      let summaryY = Math.max(rowY + 20, doc.y);

      doc.fontSize(10).fillColor('#475569');
      doc.text('Subtotal:', summaryX, summaryY, { width: 80, align: 'left' });
      doc.text(formatCurrency(Number(invoice.amount)), summaryX + 90, summaryY, { width: 95, align: 'right' });
      summaryY += 18;

      doc.text('Tax (18% GST):', summaryX, summaryY, { width: 80, align: 'left' });
      doc.text(formatCurrency(Number(invoice.tax)), summaryX + 90, summaryY, { width: 95, align: 'right' });
      summaryY += 18;

      doc.fontSize(12).fillColor('#0f172a');
      doc.text('Total:', summaryX, summaryY, { width: 80, align: 'left' });
      doc.fillColor('#1e40af').text(formatCurrency(Number(invoice.total)), summaryX + 90, summaryY, {
        width: 95,
        align: 'right',
      });
      summaryY += 22;

      if (paidTotal > 0) {
        doc.fontSize(10).fillColor('#475569');
        doc.text('Paid:', summaryX, summaryY, { width: 80, align: 'left' });
        doc.text(formatCurrency(paidTotal), summaryX + 90, summaryY, { width: 95, align: 'right' });
        summaryY += 18;
        doc.text('Balance Due:', summaryX, summaryY, { width: 80, align: 'left' });
        doc.fillColor('#0f172a').text(formatCurrency(balanceDue), summaryX + 90, summaryY, {
          width: 95,
          align: 'right',
        });
      }

      doc.end();
    });
  }
}

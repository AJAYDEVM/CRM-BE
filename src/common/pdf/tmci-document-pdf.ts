import PDFDocument = require('pdfkit');
import { amountToIndianWords } from '../utils/number-to-words';
import { formatIndianCurrency, formatIndianDate, formatIndianNumber } from '../utils/pdf-format.utils';

const MARGIN = 36;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BORDER = '#333333';
const HEADER_BG = '#f2f2f2';

export type TmciDocumentType = 'quotation' | 'invoice' | 'credit_note' | 'delivery_challan' | 'packing_list' | 'proforma_invoice' | 'purchase_order';

export interface TmciCompanyData {
  companyName: string;
  cin?: string | null;
  address?: string | null;
  email: string;
  gstNumber?: string | null;
  phone: string;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankBranch?: string | null;
  bankIfsc?: string | null;
  logoPath?: string | null;
}

export interface TmciLineItem {
  description: string;
  hsnCode?: string | null;
  quantity: number;
  unit?: string;
  boxNo?: string | null;
  rate: number;
  taxRate: number;
  taxableAmount: number;
  igstAmount: number;
  amount: number;
}

export interface TmciDocumentData {
  type: TmciDocumentType;
  documentNumber: string;
  documentDate: Date;
  reference?: string | null;
  deliveryChallanReference?: string | null;
  placeOfSupply?: string | null;
  paymentTerms?: string | null;
  dueDate?: Date | null;
  subject?: string | null;
  billToName: string;
  billToAddress?: string | null;
  customerGstin?: string | null;
  shipToName?: string | null;
  shipToAddress?: string | null;
  items: TmciLineItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  terms?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  transportMode?: string | null;
  totalPackages?: number | null;
  grossWeightKg?: number | null;
  netWeightKg?: number | null;
}

function strokeRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  doc.lineWidth(0.75).strokeColor(BORDER).rect(x, y, w, h).stroke();
}

function fillRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function drawLabelValue(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
  lineHeight = 12,
) {
  doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold');
  doc.text(`${label}`, x + 4, y + 4, { width: w - 8, continued: true });
  doc.font('Helvetica').text(` : ${value}`, { width: w - 8 });
  return y + lineHeight;
}

function getCompanyDetailLines(company: TmciCompanyData): string[] {
  const addressLines = company.address
    ? company.address.split('\n').map((l) => l.trim()).filter(Boolean)
    : [];

  return [
    company.cin ? `Company ID: ${company.cin}` : '',
    ...addressLines,
    `Email: ${company.email}`,
    company.gstNumber ? `GSTIN: ${company.gstNumber}` : '',
  ].filter(Boolean) as string[];
}

function measureCompanyHeaderHeight(
  doc: PDFKit.PDFDocument,
  companyW: number,
  company: TmciCompanyData,
): number {
  const padding = 16;
  let height = padding;

  doc.fontSize(8).font('Helvetica-Bold');
  height += doc.heightOfString(company.companyName, { width: companyW }) + 2;

  doc.font('Helvetica');
  for (const line of getCompanyDetailLines(company)) {
    height += doc.heightOfString(line, { width: companyW }) + 2;
  }

  return Math.max(88, height + 8);
}

function drawCompanyHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  company: TmciCompanyData,
) {
  let cursorY = y + 8;

  doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold');
  doc.text(company.companyName, x, cursorY, { width: w });
  cursorY = doc.y + 2;

  doc.font('Helvetica');
  for (const line of getCompanyDetailLines(company)) {
    doc.text(line, x, cursorY, { width: w });
    cursorY = doc.y + 2;
  }
}

function drawMultiline(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  lines: string[],
  opts: { fontSize?: number; bold?: boolean } = {},
) {
  const fontSize = opts.fontSize ?? 8;
  doc.fontSize(fontSize).fillColor('#000000');
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
  let cursorY = y;
  for (const line of lines) {
    if (!line) continue;
    doc.text(line, x, cursorY, { width: w });
    cursorY = doc.y + 2;
  }
  return cursorY;
}

export function renderTmciDocument(company: TmciCompanyData, data: TmciDocumentData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const title =
      data.type === 'quotation'
        ? 'Quote'
        : data.type === 'credit_note'
          ? 'CREDIT NOTE'
          : data.type === 'delivery_challan'
            ? 'DELIVERY CHALLAN'
            : data.type === 'packing_list'
              ? 'PACKING LIST'
              : data.type === 'proforma_invoice'
                ? 'PROFORMA INVOICE'
                : data.type === 'purchase_order'
                  ? 'PURCHASE ORDER'
              : 'INVOICE';
    const isQtyOnly = data.type === 'delivery_challan' || data.type === 'packing_list';
    const isPackingList = data.type === 'packing_list';
    let y = MARGIN;

    // Outer border
    strokeRect(doc, MARGIN, y, CONTENT_WIDTH, 760);

    // Header — dynamic height so GSTIN/address never overlaps the next section
    const companyX = MARGIN + 88;
    const companyW = CONTENT_WIDTH - 180;
    const headerH = measureCompanyHeaderHeight(doc, companyW, company);
    strokeRect(doc, MARGIN, y, CONTENT_WIDTH, headerH);

    if (company.logoPath) {
      try {
        doc.image(company.logoPath, MARGIN + 8, y + 10, { fit: [70, 50] });
      } catch {
        // ignore missing logo
      }
    }

    drawCompanyHeader(doc, companyX, y, companyW, company);

    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000');
    doc.text(title, MARGIN + CONTENT_WIDTH - 120, y + 28, { width: 110, align: 'right' });

    y += headerH;

    // Meta row
    const metaH = 52;
    const metaLeftW = CONTENT_WIDTH * 0.55;
    strokeRect(doc, MARGIN, y, metaLeftW, metaH);
    strokeRect(doc, MARGIN + metaLeftW, y, CONTENT_WIDTH - metaLeftW, metaH);

    let metaY = y;
    const numberLabel =
      data.type === 'quotation'
        ? 'Quote No'
        : data.type === 'credit_note'
          ? 'Credit Note No'
          : data.type === 'delivery_challan'
            ? 'Challan No'
            : data.type === 'packing_list'
              ? 'Packing List No'
              : data.type === 'proforma_invoice'
                ? 'Proforma No'
                : data.type === 'purchase_order'
                  ? 'PO Number'
              : 'Invoice Number';
    metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, numberLabel, data.documentNumber);
    const dateLabel =
      data.type === 'quotation'
        ? 'Quote Date'
        : data.type === 'credit_note'
          ? 'Credit Note Date'
          : data.type === 'delivery_challan'
            ? 'Challan Date'
            : data.type === 'packing_list'
              ? 'Packing Date'
              : data.type === 'proforma_invoice'
                ? 'Proforma Date'
                : data.type === 'purchase_order'
                  ? 'Order Date'
              : 'Invoice Date';
    metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, dateLabel, formatIndianDate(data.documentDate));

    if (data.type === 'quotation') {
      drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Reference#', data.reference || '—');
    } else if (data.type === 'credit_note') {
      metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Against Invoice', data.reference || '—');
      drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Reason', data.subject || '—');
    } else if (data.type === 'delivery_challan') {
      metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Against Invoice', data.reference || '—');
      metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Vehicle No', data.vehicleNumber || '—');
      drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Driver', data.driverName || '—');
    } else if (data.type === 'packing_list') {
      metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Against Invoice', data.reference || '—');
      metaY = drawLabelValue(
        doc,
        MARGIN,
        metaY,
        metaLeftW,
        'Delivery Challan',
        data.deliveryChallanReference || '—',
      );
      drawLabelValue(
        doc,
        MARGIN,
        metaY,
        metaLeftW,
        'Total Packages',
        data.totalPackages != null ? String(data.totalPackages) : '—',
      );
    } else if (data.type === 'proforma_invoice') {
      metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Against Quotation', data.reference || '—');
      metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Terms', data.paymentTerms || 'Due on Receipt');
      drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Due Date', data.dueDate ? formatIndianDate(data.dueDate) : '—');
    } else if (data.type === 'purchase_order') {
      metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Project', data.reference || '—');
      metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Terms', data.paymentTerms || 'Due on Receipt');
      drawLabelValue(
        doc,
        MARGIN,
        metaY,
        metaLeftW,
        'Expected Delivery',
        data.dueDate ? formatIndianDate(data.dueDate) : '—',
      );
    } else {
      metaY = drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Terms', data.paymentTerms || 'Due on Receipt');
      drawLabelValue(doc, MARGIN, metaY, metaLeftW, 'Due Date', data.dueDate ? formatIndianDate(data.dueDate) : '—');
    }

    if (data.type === 'delivery_challan') {
      let rightMetaY = y;
      rightMetaY = drawLabelValue(
        doc,
        MARGIN + metaLeftW,
        rightMetaY,
        CONTENT_WIDTH - metaLeftW,
        'Place Of Supply',
        data.placeOfSupply || '—',
      );
      drawLabelValue(
        doc,
        MARGIN + metaLeftW,
        rightMetaY,
        CONTENT_WIDTH - metaLeftW,
        'Transport Mode',
        data.transportMode || '—',
      );
    } else if (data.type === 'packing_list') {
      let rightMetaY = y;
      rightMetaY = drawLabelValue(
        doc,
        MARGIN + metaLeftW,
        rightMetaY,
        CONTENT_WIDTH - metaLeftW,
        'Place Of Supply',
        data.placeOfSupply || '—',
      );
      rightMetaY = drawLabelValue(
        doc,
        MARGIN + metaLeftW,
        rightMetaY,
        CONTENT_WIDTH - metaLeftW,
        'Gross Weight (kg)',
        data.grossWeightKg != null ? formatIndianNumber(data.grossWeightKg) : '—',
      );
      drawLabelValue(
        doc,
        MARGIN + metaLeftW,
        rightMetaY,
        CONTENT_WIDTH - metaLeftW,
        'Net Weight (kg)',
        data.netWeightKg != null ? formatIndianNumber(data.netWeightKg) : '—',
      );
    } else {
      drawLabelValue(
        doc,
        MARGIN + metaLeftW,
        y,
        CONTENT_WIDTH - metaLeftW,
        'Place Of Supply',
        data.placeOfSupply || '—',
      );
    }

    y += metaH;

    // Bill / Ship
    const addrH = 72;
    const colW = CONTENT_WIDTH / 2;
    fillRect(doc, MARGIN, y, colW, 16, HEADER_BG);
    fillRect(doc, MARGIN + colW, y, colW, 16, HEADER_BG);
    strokeRect(doc, MARGIN, y, colW, addrH);
    strokeRect(doc, MARGIN + colW, y, colW, addrH);

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000');
    doc.text(data.type === 'purchase_order' ? 'Vendor' : 'Bill To', MARGIN + 4, y + 4);
    doc.text('Ship To', MARGIN + colW + 4, y + 4);

    const billLines = [
      data.billToName,
      data.billToAddress || '',
      data.customerGstin ? `GSTIN: ${data.customerGstin}` : '',
    ].filter(Boolean);

    const shipLines = [
      data.shipToName || data.billToName,
      data.shipToAddress || data.billToAddress || '',
      data.type === 'purchase_order' && company.gstNumber ? `GSTIN: ${company.gstNumber}` : data.customerGstin ? `GSTIN: ${data.customerGstin}` : '',
    ].filter(Boolean);

    drawMultiline(doc, MARGIN + 4, y + 18, colW - 8, billLines, { fontSize: 8 });
    drawMultiline(doc, MARGIN + colW + 4, y + 18, colW - 8, shipLines, { fontSize: 8 });

    y += addrH;

    // Subject
    const subjectH = 20;
    strokeRect(doc, MARGIN, y, CONTENT_WIDTH, subjectH);
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text(`Subject : ${data.subject || '—'}`, MARGIN + 4, y + 6, { width: CONTENT_WIDTH - 8 });
    y += subjectH;

    // Table header
    const cols = isPackingList
      ? {
          sno: 28,
          box: 48,
          desc: CONTENT_WIDTH - 28 - 48 - 70 - 70,
          hsn: 70,
          qty: 70,
          rate: 0,
          igst: 0,
          amount: 0,
        }
      : isQtyOnly
      ? {
          sno: 36,
          box: 0,
          desc: CONTENT_WIDTH - 36 - 90 - 90,
          hsn: 90,
          qty: 90,
          rate: 0,
          igst: 0,
          amount: 0,
        }
      : {
          sno: 28,
          box: 0,
          desc: 210,
          hsn: 58,
          qty: 48,
          rate: 62,
          igst: 52,
          amount: CONTENT_WIDTH - 28 - 210 - 58 - 48 - 62 - 52,
        };

    const tableHeaderH = 18;
    fillRect(doc, MARGIN, y, CONTENT_WIDTH, tableHeaderH, HEADER_BG);
    strokeRect(doc, MARGIN, y, CONTENT_WIDTH, tableHeaderH);

    let cx = MARGIN;
    const headers = isPackingList
      ? ([
          ['S.No', cols.sno],
          ['Box', cols.box],
          ['Item & Description', cols.desc],
          ['HSN / SAC', cols.hsn],
          ['Qty', cols.qty],
        ] as const)
      : isQtyOnly
      ? ([
          ['S.No', cols.sno],
          ['Item & Description', cols.desc],
          ['HSN / SAC', cols.hsn],
          ['Qty', cols.qty],
        ] as const)
      : ([
          ['S.No', cols.sno],
          ['Item & Description', cols.desc],
          ['HSN / SAC', cols.hsn],
          ['Qty', cols.qty],
          ['Rate', cols.rate],
          ['IGST', cols.igst],
          ['Amount', cols.amount],
        ] as const);

    doc.fontSize(7).font('Helvetica-Bold');
    for (const [label, width] of headers) {
      strokeRect(doc, cx, y, width, tableHeaderH);
      doc.text(label, cx + 2, y + 5, { width: width - 4, align: label === 'S.No' || label === 'Item & Description' ? 'left' : 'right' });
      cx += width;
    }

    y += tableHeaderH;

    // Table rows
    const rowH = 22;
    data.items.forEach((item, index) => {
      if (y > 700) {
        doc.addPage();
        y = MARGIN;
      }

      cx = MARGIN;
      const rowValues: Array<{ text: string; width: number; align: 'left' | 'right' }> = isPackingList
        ? [
            { text: String(index + 1), width: cols.sno, align: 'left' },
            { text: item.boxNo || '—', width: cols.box, align: 'left' },
            { text: item.description, width: cols.desc, align: 'left' },
            { text: item.hsnCode || '—', width: cols.hsn, align: 'left' },
            {
              text: `${formatIndianNumber(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`,
              width: cols.qty,
              align: 'right',
            },
          ]
        : isQtyOnly
        ? [
            { text: String(index + 1), width: cols.sno, align: 'left' },
            { text: item.description, width: cols.desc, align: 'left' },
            { text: item.hsnCode || '—', width: cols.hsn, align: 'left' },
            {
              text: `${formatIndianNumber(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`,
              width: cols.qty,
              align: 'right',
            },
          ]
        : [
            { text: String(index + 1), width: cols.sno, align: 'left' },
            { text: item.description, width: cols.desc, align: 'left' },
            { text: item.hsnCode || '—', width: cols.hsn, align: 'left' },
            {
              text: `${formatIndianNumber(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`,
              width: cols.qty,
              align: 'right',
            },
            { text: formatIndianNumber(item.rate), width: cols.rate, align: 'right' },
            { text: formatIndianNumber(item.igstAmount), width: cols.igst, align: 'right' },
            { text: formatIndianNumber(item.amount), width: cols.amount, align: 'right' },
          ];

      doc.font('Helvetica').fontSize(7);
      for (const cell of rowValues) {
        strokeRect(doc, cx, y, cell.width, rowH);
        doc.text(cell.text, cx + 2, y + 6, { width: cell.width - 4, align: cell.align, height: rowH - 4 });
        cx += cell.width;
      }
      y += rowH;
    });

    // Footer area
    const footerTop = Math.max(y + 8, 560);
    const footerH = 760 - (footerTop - MARGIN);
    strokeRect(doc, MARGIN, footerTop, CONTENT_WIDTH, footerH);

    const leftFooterW = CONTENT_WIDTH * 0.58;
    const rightFooterW = CONTENT_WIDTH - leftFooterW;
    strokeRect(doc, MARGIN, footerTop, leftFooterW, footerH);
    strokeRect(doc, MARGIN + leftFooterW, footerTop, rightFooterW, footerH);

    let leftY = footerTop + 8;
    if (isQtyOnly) {
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('Notes', MARGIN + 6, leftY);
      leftY += 12;
      doc.font('Helvetica').fontSize(7);
      const notes = (data.terms || '').split('\n').filter(Boolean);
      if (notes.length === 0) {
        doc.text('—', MARGIN + 6, leftY, { width: leftFooterW - 12 });
        leftY = doc.y + 2;
      } else {
        for (const line of notes) {
          doc.text(line, MARGIN + 6, leftY, { width: leftFooterW - 12 });
          leftY = doc.y + 2;
        }
      }
    } else {
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('Total In Words', MARGIN + 6, footerTop + 6);
      doc.font('Helvetica-Oblique').fontSize(8);
      doc.text(amountToIndianWords(data.total), MARGIN + 6, footerTop + 18, { width: leftFooterW - 12 });
      leftY = footerTop + 42;
    }

    if (data.type === 'quotation') {
      doc.font('Helvetica-Bold').fontSize(8).text('Terms & Conditions', MARGIN + 6, leftY);
      leftY += 12;
      doc.font('Helvetica').fontSize(7);
      const terms = (data.terms || '').split('\n').filter(Boolean);
      for (const line of terms) {
        doc.text(line, MARGIN + 6, leftY, { width: leftFooterW - 12 });
        leftY = doc.y + 2;
      }
    } else if (!isQtyOnly) {
      doc.font('Helvetica-Bold').fontSize(8).text('Bank Details', MARGIN + 6, leftY);
      leftY += 12;
      doc.font('Helvetica').fontSize(7);
      const bankLines = [
        company.bankName ? `Bank Name: ${company.bankName}` : '',
        company.bankAccountNumber ? `Account Number: ${company.bankAccountNumber}` : '',
        company.bankBranch ? `Branch Name: ${company.bankBranch}` : '',
        company.bankIfsc ? `IFSC Code: ${company.bankIfsc}` : '',
      ].filter(Boolean);
      for (const line of bankLines) {
        doc.text(line, MARGIN + 6, leftY, { width: leftFooterW - 12 });
        leftY = doc.y + 2;
      }
    }

    // Totals (right)
    let totalY = footerTop + 8;
    const labelX = MARGIN + leftFooterW + 8;
    const valueX = MARGIN + leftFooterW + rightFooterW - 78;
    const totalLabelW = rightFooterW - 90;

    doc.font('Helvetica').fontSize(8).fillColor('#000000');
    const totalRows: Array<[string, string, boolean?]> = isQtyOnly
      ? [['Total Qty', formatIndianNumber(data.total), true]]
      : [['Sub Total', formatIndianNumber(data.subtotal)]];
    if (!isQtyOnly) {
      if (data.discount && data.discount > 0) {
        totalRows.push(['Discount', formatIndianNumber(data.discount)]);
      }
      totalRows.push([`IGST18 (18%)`, formatIndianNumber(data.tax)]);
      totalRows.push(['Total', formatIndianCurrency(data.total), true]);
    }

    for (const [label, value, bold] of totalRows) {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 9 : 8);
      doc.text(label, labelX, totalY, { width: totalLabelW, align: 'left' });
      doc.text(value, valueX, totalY, { width: 70, align: 'right' });
      totalY += bold ? 18 : 14;
    }

    const signBoxY = footerTop + footerH - 58;
    strokeRect(doc, MARGIN + leftFooterW + 10, signBoxY, rightFooterW - 20, 40);
    doc.fontSize(7).font('Helvetica');
    if (data.type === 'quotation' || data.type === 'delivery_challan' || data.type === 'packing_list') {
      doc.text(
        data.type === 'quotation'
          ? 'This is a computer generated Quote, no signature required'
          : data.type === 'delivery_challan'
            ? 'This is a computer generated Delivery Challan'
            : 'This is a computer generated Packing List',
        MARGIN + leftFooterW + 14,
        signBoxY + 6,
        {
          width: rightFooterW - 28,
          align: 'center',
        },
      );
    }
    doc.font('Helvetica-Bold').text(
      data.type === 'quotation' ? 'Authorized Signature' : 'Authorized Signatory',
      MARGIN + leftFooterW + 14,
      signBoxY + (data.type === 'quotation' || data.type === 'delivery_challan' || data.type === 'packing_list' ? 26 : 30),
      { width: rightFooterW - 28, align: 'center' },
    );

    doc.end();
  });
}

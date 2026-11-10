const express = require('express');
const PDFDocument = require('pdfkit');
const { z } = require('zod');
const { getInvoiceExportData } = require('../db/invoices');

const router = express.Router();

const positiveInvoiceIdSchema = z.coerce.number().int().positive();

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function sendValidationError(res, message) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message,
    },
  });
}

function sendNotFound(res, message = 'Invoice not found') {
  return res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message,
    },
  });
}

function formatCurrency(amount) {
  return currencyFormatter.format(Number(amount ?? 0));
}

function drawPill(doc, x, y, width, label, fillColor, textColor) {
  doc.save();
  doc.roundedRect(x, y, width, 18, 9).fillAndStroke(fillColor, fillColor);
  doc.fillColor(textColor).font('Helvetica-Bold').fontSize(9);
  doc.text(label.toUpperCase(), x, y + 4, {
    width,
    align: 'center',
  });
  doc.restore();
}

function drawInvoiceHeader(doc, data) {
  const { invoice, client } = data;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const leftWidth = 250;
  const rightWidth = 170;
  const headerTop = doc.y;

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(24);
  doc.text('Invoice Preview', { continued: false });

  doc.fillColor('#64748b').font('Helvetica').fontSize(10);
  doc.text('Fully offline PDF generated from local SQLite data.');

  doc.moveDown(1.2);

  doc.roundedRect(doc.x, doc.y, pageWidth, 126, 12).lineWidth(1).strokeColor('#dbe3f1').stroke();

  const innerTop = doc.y + 18;
  const innerLeft = doc.x + 18;

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(20);
  doc.text('INVOICE', innerTop, innerTop, {
    width: leftWidth,
  });

  doc.fillColor('#475569').font('Helvetica').fontSize(10);
  doc.text(`Invoice #: ${invoice.invoiceNumber}`, innerLeft, innerTop + 28, {
    width: leftWidth,
  });
  doc.text(`Issued: ${invoice.issueDate}`, innerLeft, innerTop + 44, {
    width: leftWidth,
  });
  doc.text(`Due: ${invoice.dueDate}`, innerLeft, innerTop + 60, {
    width: leftWidth,
  });

  drawPill(doc, doc.page.width - doc.page.margins.right - rightWidth - 18, innerTop, rightWidth, invoice.status, '#e2e8f0', '#0f172a');

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11);
  doc.text(client.name || 'Unknown Client', doc.page.width - doc.page.margins.right - rightWidth - 18, innerTop + 30, {
    width: rightWidth,
    align: 'left',
  });
  doc.fillColor('#475569').font('Helvetica').fontSize(9);
  doc.text(client.company || 'No company provided', doc.page.width - doc.page.margins.right - rightWidth - 18, innerTop + 46, {
    width: rightWidth,
  });
  if (client.email) {
    doc.text(client.email, doc.page.width - doc.page.margins.right - rightWidth - 18, innerTop + 60, {
      width: rightWidth,
    });
  }

  doc.y = headerTop + 148;
}

function drawBillToSection(doc, data) {
  const { client, invoice } = data;
  const leftX = doc.page.margins.left;
  const cardWidth = 260;

  doc.roundedRect(leftX, doc.y, cardWidth, 96, 10).lineWidth(1).strokeColor('#dbe3f1').stroke();
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Bill To', leftX + 14, doc.y + 12);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(client.name || 'Unknown Client', leftX + 14, doc.y + 30, {
    width: cardWidth - 28,
  });
  doc.fillColor('#475569').font('Helvetica').fontSize(9);
  if (client.company) {
    doc.text(client.company, leftX + 14, doc.y + 52, { width: cardWidth - 28 });
  }
  if (client.email) {
    doc.text(client.email, leftX + 14, doc.y + 66, { width: cardWidth - 28 });
  }
  if (invoice.notes) {
    doc.text(invoice.notes, leftX + 14, doc.y + 80, { width: cardWidth - 28, height: 20 });
  }

  doc.y += 110;
}

function drawTotalsBox(doc, invoice) {
  const boxWidth = 190;
  const x = doc.page.width - doc.page.margins.right - boxWidth;
  const y = doc.y;

  doc.roundedRect(x, y, boxWidth, 108, 10).lineWidth(1).strokeColor('#dbe3f1').stroke();
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Summary', x + 14, y + 12);

  const rows = [
    ['Subtotal', formatCurrency(invoice.subtotal)],
    [`Tax (${Number(invoice.taxRate || 0)}%)`, formatCurrency(invoice.subtotal * (Number(invoice.taxRate || 0) / 100))],
    ['Total', formatCurrency(invoice.total)],
  ];

  let rowY = y + 34;
  rows.forEach(([label, value], index) => {
    const isTotal = index === rows.length - 1;
    doc.fillColor(isTotal ? '#0f172a' : '#475569').font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isTotal ? 12 : 10);
    doc.text(label, x + 14, rowY, { width: 110 });
    doc.text(value, x + 14, rowY, { width: boxWidth - 28, align: 'right' });
    rowY += isTotal ? 26 : 18;
  });

  doc.y += 122;
}

function drawItemsTable(doc, items) {
  const startX = doc.page.margins.left;
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const rowHeight = 28;
  const columns = {
    description: { x: startX, width: 280 },
    hours: { x: startX + 280, width: 70 },
    rate: { x: startX + 350, width: 90 },
    total: { x: startX + tableWidth - 100, width: 100 },
  };
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 60;

  if (doc.y > bottomLimit) {
    doc.addPage();
  }

  doc.roundedRect(startX, doc.y, tableWidth, 26, 8).lineWidth(1).strokeColor('#dbe3f1').stroke();
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9);
  doc.text('Description', columns.description.x + 10, doc.y + 9, { width: columns.description.width - 20 });
  doc.text('Hours', columns.hours.x, doc.y + 9, { width: columns.hours.width, align: 'center' });
  doc.text('Rate', columns.rate.x, doc.y + 9, { width: columns.rate.width, align: 'center' });
  doc.text('Amount', columns.total.x, doc.y + 9, { width: columns.total.width - 10, align: 'right' });

  doc.y += 30;

  items.forEach((item, index) => {
    if (doc.y + rowHeight > bottomLimit) {
      doc.addPage();
    }

    const rowFill = index % 2 === 0 ? '#f8fbff' : '#ffffff';
    doc.roundedRect(startX, doc.y, tableWidth, rowHeight, 6).fillAndStroke(rowFill, '#e5edf7');

    doc.fillColor('#0f172a').font('Helvetica').fontSize(10);
    doc.text(item.description, columns.description.x + 10, doc.y + 8, {
      width: columns.description.width - 20,
      ellipsis: true,
    });
    doc.text(String(item.hours.toFixed(2)).replace(/\.00$/, ''), columns.hours.x, doc.y + 8, {
      width: columns.hours.width,
      align: 'center',
    });
    doc.text(formatCurrency(item.rate), columns.rate.x, doc.y + 8, {
      width: columns.rate.width,
      align: 'center',
    });
    doc.text(formatCurrency(item.total), columns.total.x, doc.y + 8, {
      width: columns.total.width - 10,
      align: 'right',
    });

    doc.y += rowHeight + 4;
  });
}

function buildInvoicePdf(doc, data) {
  doc.font('Helvetica');
  drawInvoiceHeader(doc, data);
  drawBillToSection(doc, data);
  drawTotalsBox(doc, data.invoice);
  doc.moveDown(0.5);
  drawItemsTable(doc, data.items);

  if (data.invoice.notes) {
    doc.moveDown(1.5);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Notes', { continued: false });
    doc.fillColor('#475569').font('Helvetica').fontSize(10).text(data.invoice.notes, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
  }

  doc.moveDown(1.5);
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(8).text('Generated locally from FreelanceFlow SQLite data.', {
    align: 'center',
  });
}

router.post('/invoices/:id/export-pdf', (req, res, next) => {
  const parsedId = positiveInvoiceIdSchema.safeParse(req.params.id);

  if (!parsedId.success) {
    return sendValidationError(res, 'id must be a positive integer');
  }

  const invoiceData = getInvoiceExportData(parsedId.data);

  if (!invoiceData) {
    return sendNotFound(res);
  }

  const safeInvoiceNumber = String(invoiceData.invoice.invoiceNumber).replace(/[^a-z0-9_-]+/gi, '_');
  const fileName = `invoice-${safeInvoiceNumber}.pdf`;

  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 48, left: 48, right: 48, bottom: 48 },
    bufferPages: true,
    compress: true,
  });

  const handleError = (error) => {
    if (!res.headersSent) {
      return next(error);
    }

    res.destroy(error);
    return undefined;
  };

  doc.on('error', handleError);
  res.on('close', () => {
    if (!doc.destroyed) {
      doc.destroy();
    }
  });

  doc.pipe(res);
  buildInvoicePdf(doc, invoiceData);
  doc.end();
});

module.exports = router;
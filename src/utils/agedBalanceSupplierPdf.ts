import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatMoney } from './formatters';
import type { SupplierAgedInvoicesGrouped, AgedBalanceInvoiceRow } from '../services/tableService';
import {
  getSupplierAgedBalanceFileBase,
  sumAgedBalanceRowsMoney,
  SUPPLIER_AGED_BALANCE_EXPORT_BLOCKS,
} from './agedBalanceSupplierExcel';

function stripDiacriticsForPdf(text: string): string {
  const s = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code <= 0xff ? s[i]! : '?';
  }
  return out;
}

async function embedReportFonts(pdf: PDFDocument): Promise<{ font: PDFFont; fontBold: PDFFont }> {
  pdf.registerFontkit(fontkit);
  let font = await pdf.embedFont(StandardFonts.Helvetica);
  let fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  try {
    const base = `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '')}/`;
    const calibri = await fetch(`${base}fonts/Calibri.ttf`);
    if (calibri.ok) {
      const regBuf = await calibri.arrayBuffer();
      const calBold = await fetch(`${base}fonts/Calibri-Bold.ttf`);
      const boldBuf = calBold.ok ? await calBold.arrayBuffer() : regBuf;
      font = await pdf.embedFont(regBuf, { subset: false });
      fontBold = await pdf.embedFont(boldBuf, { subset: false });
    } else {
      const regBuf = await fetch(`${base}fonts/Carlito-Regular.ttf`).then((r) => r.arrayBuffer());
      const boldBuf = await fetch(`${base}fonts/Carlito-Bold.ttf`).then((r) => r.arrayBuffer());
      font = await pdf.embedFont(regBuf, { subset: false });
      fontBold = await pdf.embedFont(boldBuf, { subset: false });
    }
  } catch {
    /* Helvetica fallback */
  }
  return { font, fontBold };
}

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 34;
const RED_HEADER = rgb(0.62, 0.12, 0.14);
const RED_LINE = rgb(0.72, 0.14, 0.17);
const TEXT = rgb(0.1, 0.1, 0.1);
const BLACK = rgb(0, 0, 0);
const GRAY_META = rgb(0.35, 0.35, 0.38);
const ROW_ALT = rgb(0.945, 0.945, 0.945);
const WHITE = rgb(1, 1, 1);
const BRAND_RIGHT = 'PMD - Shipping GL';
const SECTION_BG = rgb(0.92, 0.93, 0.95);
const SUBTOTAL_BG = rgb(0.96, 0.97, 0.98);

function truncateToWidth(raw: string, maxW: number, f: PDFFont, size: number): string {
  let s = stripDiacriticsForPdf(raw);
  if (f.widthOfTextAtSize(s, size) <= maxW) return s;
  const ell = '...';
  while (s.length > 1 && f.widthOfTextAtSize(s.slice(0, -1) + ell, size) > maxW) s = s.slice(0, -1);
  return s.slice(0, -1) + ell;
}

function drawTextRight(
  page: PDFPage,
  text: string,
  xRight: number,
  baselineY: number,
  size: number,
  f: PDFFont,
  color = TEXT
) {
  const safe = stripDiacriticsForPdf(text);
  const w = f.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: xRight - w, y: baselineY, size, font: f, color });
}

function scaleWidthsToContent(base: number[], innerW: number, gap: number): number[] {
  const n = base.length;
  const gaps = gap * Math.max(0, n - 1);
  const sum = base.reduce((a, b) => a + b, 0);
  const scale = (innerW - gaps) / sum;
  return base.map((w) => w * scale);
}

function formatPdfCellDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? stripDiacriticsForPdf(String(iso)) : d.toLocaleDateString('fr-FR');
}

/**
 * Export PDF balance âgée par fournisseur : même logique que l’Excel
 * (bandeau par catégorie, en-têtes de colonnes, lignes, sous-totaux, total général).
 */
export async function downloadSupplierAgedBalancePdf(opts: {
  supplier: string;
  year: string;
  regionLabel: string;
  grouped: SupplierAgedInvoicesGrouped;
}): Promise<void> {
  const { supplier, year, regionLabel, grouped } = opts;

  const totalInvoices = SUPPLIER_AGED_BALANCE_EXPORT_BLOCKS.reduce((n, b) => n + grouped[b.key].length, 0);
  if (totalInvoices === 0) {
    throw new Error('Aucune facture à exporter');
  }

  const pdf = await PDFDocument.create();
  const { font, fontBold } = await embedReportFonts(pdf);

  const contentW = PAGE_W - MARGIN * 2;
  const innerPad = 4;
  const innerTableW = contentW - innerPad * 2;
  const stamp = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const headH = 18;
  const rowH = 14;
  const catBandH = 14;
  const headFont = 6.8;
  const bodyFont = 6.2;
  const catTitleSize = 8;
  const titleSize = 12;
  const metaSize = 9;
  const subtotalH = 13;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const needNewPage = (minH: number) => y < MARGIN + minH;

  const drawPageMeta = () => {
    page.drawText(stripDiacriticsForPdf(stamp), {
      x: MARGIN,
      y: y - metaSize * 0.85,
      size: metaSize,
      font,
      color: GRAY_META,
    });
    drawTextRight(page, stripDiacriticsForPdf(BRAND_RIGHT), PAGE_W - MARGIN, y - metaSize * 0.85, metaSize, font, GRAY_META);
    y -= 24;
  };

  const drawMainTitle = () => {
    const title = stripDiacriticsForPdf(`Balance agee - ${supplier}`);
    const tw = fontBold.widthOfTextAtSize(title, titleSize);
    const titleX = MARGIN + (contentW - tw) / 2;
    page.drawText(title, {
      x: titleX,
      y: y - titleSize * 0.85,
      size: titleSize,
      font: fontBold,
      color: TEXT,
    });
    y -= titleSize + 8;

    const meta1 = stripDiacriticsForPdf(`Annee: ${year}   Region: ${regionLabel}`);
    page.drawText(meta1, {
      x: MARGIN,
      y: y - metaSize * 0.85,
      size: metaSize,
      font,
      color: GRAY_META,
    });
    y -= metaSize + 12;

    page.drawLine({
      start: { x: MARGIN, y: y },
      end: { x: MARGIN + contentW, y: y },
      thickness: 2.2,
      color: RED_LINE,
    });
    y -= 14;
  };

  const labels = ['N° FACT.', 'DATE REC.', 'DATE ECHE.', 'STATUT', 'MONTANT', 'PAYE', 'SOLDE'];
  const gap = 2.5;
  const baseW = [64, 48, 48, 108, 56, 56, 56];
  const widths = scaleWidthsToContent(baseW, innerTableW, gap);
  const colStarts: number[] = [];
  let xWalk = MARGIN + innerPad;
  for (let i = 0; i < widths.length; i++) {
    colStarts.push(xWalk);
    xWalk += widths[i]! + (i < widths.length - 1 ? gap : 0);
  }
  const moneyStartIdx = 4;

  const drawTableHeader = () => {
    if (needNewPage(headH + 10)) {
      newPage();
      drawPageMeta();
    }
    const headerTopY = y;
    const headerBottomY = y - headH;
    page.drawLine({
      start: { x: MARGIN, y: headerTopY },
      end: { x: MARGIN + contentW, y: headerTopY },
      thickness: 1.1,
      color: BLACK,
    });
    page.drawRectangle({
      x: MARGIN,
      y: headerBottomY,
      width: contentW,
      height: headH,
      color: RED_HEADER,
    });
    page.drawLine({
      start: { x: MARGIN, y: headerBottomY },
      end: { x: MARGIN + contentW, y: headerBottomY },
      thickness: 1.1,
      color: BLACK,
    });
    const headerBaseline = headerBottomY + 5;
    for (let i = 0; i < labels.length; i++) {
      const cx = colStarts[i]!;
      const w = widths[i]!;
      const lab = stripDiacriticsForPdf(labels[i]!);
      const t = truncateToWidth(lab, w - 4, fontBold, headFont);
      if (i >= moneyStartIdx) {
        drawTextRight(page, t, cx + w - 2, headerBaseline, headFont, fontBold, WHITE);
      } else {
        page.drawText(t, {
          x: cx + 2,
          y: headerBaseline,
          size: headFont,
          font: fontBold,
          color: WHITE,
        });
      }
    }
    y -= headH + 2;
  };

  const drawCategoryBanner = (blockTitle: string) => {
    const need = catBandH + 6;
    if (needNewPage(need)) {
      newPage();
      drawPageMeta();
    }
    const bottom = y - catBandH;
    page.drawRectangle({
      x: MARGIN,
      y: bottom,
      width: contentW,
      height: catBandH,
      color: SECTION_BG,
      borderColor: rgb(0.8, 0.82, 0.86),
      borderWidth: 0.45,
    });
    const txt = stripDiacriticsForPdf(`--- ${blockTitle} ---`);
    page.drawText(truncateToWidth(txt, contentW - 12, fontBold, catTitleSize), {
      x: MARGIN + 6,
      y: bottom + 4,
      size: catTitleSize,
      font: fontBold,
      color: TEXT,
    });
    y -= catBandH + 4;
  };

  const drawDataRow = (inv: AgedBalanceInvoiceRow, stripe: number) => {
    if (needNewPage(rowH + 4)) {
      newPage();
      drawPageMeta();
      drawTableHeader();
    }
    const bg = stripe % 2 === 1 ? ROW_ALT : WHITE;
    page.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: contentW,
      height: rowH,
      color: bg,
    });
    const baseline = y - rowH + 4.5;

    const cells = [
      inv.numeroFacture,
      formatPdfCellDate(inv.dateReception),
      formatPdfCellDate(inv.dateEcheance),
      String(inv.statut ?? '').trim(),
    ];
    const monies = [
      formatMoney(inv.montant, 'USD'),
      formatMoney(inv.paye, 'USD'),
      formatMoney(inv.solde, 'USD'),
    ];

    for (let i = 0; i < cells.length; i++) {
      const cx = colStarts[i]!;
      const w = widths[i]!;
      const fCell = i === 0 ? fontBold : font;
      const t = truncateToWidth(cells[i] || '', w - 4, fCell, bodyFont);
      page.drawText(t, { x: cx + 2, y: baseline, size: bodyFont, font: fCell, color: TEXT });
    }
    for (let j = 0; j < 3; j++) {
      const i = moneyStartIdx + j;
      const cx = colStarts[i]!;
      const w = widths[i]!;
      drawTextRight(page, monies[j]!, cx + w - 2, baseline, bodyFont, fontBold, TEXT);
    }
    y -= rowH;
  };

  const drawSubtotalRow = (sub: { montant: number; paye: number; solde: number }) => {
    if (needNewPage(subtotalH + 4)) {
      newPage();
      drawPageMeta();
    }
    page.drawRectangle({
      x: MARGIN,
      y: y - subtotalH,
      width: contentW,
      height: subtotalH,
      color: SUBTOTAL_BG,
    });
    const baseline = y - subtotalH + 4.5;
    page.drawText(stripDiacriticsForPdf('Sous-total (categorie)'), {
      x: colStarts[0]! + 2,
      y: baseline,
      size: bodyFont,
      font: fontBold,
      color: TEXT,
    });
    const mStrs = [
      formatMoney(sub.montant, 'USD'),
      formatMoney(sub.paye, 'USD'),
      formatMoney(sub.solde, 'USD'),
    ];
    for (let j = 0; j < 3; j++) {
      const i = moneyStartIdx + j;
      const cx = colStarts[i]!;
      const w = widths[i]!;
      drawTextRight(page, mStrs[j]!, cx + w - 2, baseline, bodyFont, fontBold, TEXT);
    }
    y -= subtotalH + 6;
  };

  drawPageMeta();
  drawMainTitle();

  let grand = { montant: 0, paye: 0, solde: 0 };
  let stripeAll = 0;

  for (const block of SUPPLIER_AGED_BALANCE_EXPORT_BLOCKS) {
    const rows = grouped[block.key];
    if (!rows.length) continue;

    drawCategoryBanner(block.title);
    drawTableHeader();

    for (const inv of rows) {
      drawDataRow(inv, stripeAll);
      stripeAll += 1;
    }
    const sub = sumAgedBalanceRowsMoney(rows);
    drawSubtotalRow(sub);
    y -= 4;

    grand = {
      montant: grand.montant + sub.montant,
      paye: grand.paye + sub.paye,
      solde: grand.solde + sub.solde,
    };
  }

  const moneyColRight = colStarts[6]! + widths[6]! - 2;
  const labelX = colStarts[0]! + 4;
  const grandSummaryTitleSize = 8;
  const sumLineSize = 7.6;
  const lineGap = 1.2;
  const titleBandH = 13;
  const summaryLineH = sumLineSize + lineGap;
  const summaryPad = 5;
  const grandH = titleBandH + summaryPad * 2 + summaryLineH * 3 + 4;

  if (needNewPage(grandH + 8)) {
    newPage();
    drawPageMeta();
  }
  const blockTop = y;
  const blockBottom = y - grandH;
  page.drawRectangle({
    x: MARGIN,
    y: blockBottom,
    width: contentW,
    height: grandH,
    color: rgb(0.88, 0.9, 0.94),
    borderColor: BLACK,
    borderWidth: 0.8,
  });
  page.drawRectangle({
    x: MARGIN,
    y: blockTop - titleBandH,
    width: contentW,
    height: titleBandH,
    color: rgb(0.82, 0.86, 0.92),
    borderColor: rgb(0.55, 0.58, 0.62),
    borderWidth: 0.35,
  });
  page.drawText(stripDiacriticsForPdf('TOTAL GENERAL'), {
    x: labelX,
    y: blockTop - titleBandH + 4,
    size: grandSummaryTitleSize,
    font: fontBold,
    color: TEXT,
  });

  const summaryRows: Array<{ label: string; value: string }> = [
    { label: 'Montant Total :', value: formatMoney(grand.montant, 'USD') },
    { label: 'Montant Paye :', value: formatMoney(grand.paye, 'USD') },
    { label: 'Montant :', value: formatMoney(grand.solde, 'USD') },
  ];
  let lineY = blockTop - titleBandH - summaryPad - sumLineSize * 0.85;
  for (const row of summaryRows) {
    page.drawText(stripDiacriticsForPdf(row.label), {
      x: labelX,
      y: lineY,
      size: sumLineSize,
      font: fontBold,
      color: TEXT,
    });
    drawTextRight(page, row.value, moneyColRight, lineY, sumLineSize, fontBold, TEXT);
    lineY -= summaryLineH;
  }

  y = blockBottom;

  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const base = getSupplierAgedBalanceFileBase({ supplier, year, regionLabel });
  const safe = stripDiacriticsForPdf(base)
    .replace(/[^\w._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 160);
  a.download = `${safe || 'balance_agee'}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

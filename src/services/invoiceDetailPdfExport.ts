import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatMoney } from '../utils/formatters';

function stripDiacriticsForPdf(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\xFF]/g, '?');
}

/** Conversion vers USD pour l’export PDF (CDF via « Taux facture », défaut 2000 si absent — aligné InvoicesPage). */
export function convertMoneyToUsd(
  amount: number,
  currency: string,
  tauxFacture: number | string | null | undefined
): number {
  const c = (currency || 'USD').toUpperCase().trim();
  if (c === 'USD' || c === '') return amount;
  const t = parseFloat(String(tauxFacture ?? ''));
  if (c === 'CDF') {
    const rate = Number.isFinite(t) && t > 0 ? t : 2000;
    return amount / rate;
  }
  if (c === 'EUR') {
    return amount * 1.08;
  }
  return amount;
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

export type InvoiceDetailPdfNormalRow = {
  invoiceNumber: string;
  supplier: string;
  receptionDate: string;
  region?: string;
  chargeCategory: string;
  urgency: string;
  dueDate: string;
  validationPct: number;
  amountUsd: number;
  paidUsd: number;
  balanceUsd: number;
};

export type InvoiceDetailPdfPaidRow = {
  invoiceNumber: string;
  supplier: string;
  amountUsd: number;
  modePaiement: string;
  banqueSgl: string;
  compteSgl: string;
  banqueFournisseur: string;
  compteFournisseur: string;
  paidBy: string;
  hasFichier: boolean;
  datePaiement: string;
};

export type InvoiceDetailPdfExportParams = {
  title: string;
  summaryFooterUsd: { total: number; paid: number; balance: number };
  isPaidReportMode: boolean;
  includeRegion: boolean;
  normalRows?: InvoiceDetailPdfNormalRow[];
  paidRows?: InvoiceDetailPdfPaidRow[];
  /** Nom de fichier sans extension (déjà suffixé année/région/date côté UI). */
  fileBaseName?: string;
};

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 34;
const RED_LINE = rgb(0.72, 0.14, 0.17);
/** Fond rouge bandeau en-têtes du tableau (PDF). */
const RED_HEADER = rgb(0.62, 0.12, 0.14);
const TEXT = rgb(0.1, 0.1, 0.1);
const BLACK = rgb(0, 0, 0);
const GRAY_META = rgb(0.35, 0.35, 0.38);
const ROW_ALT = rgb(0.945, 0.945, 0.945);
const WHITE = rgb(1, 1, 1);
/** Fond bloc résumé sous le tableau. */
const SUMMARY_BLOCK_BG = rgb(0.93, 0.94, 0.96);

const BRAND_RIGHT = 'PMD - Shipping GL';

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

export async function downloadInvoiceDetailModalPdf(params: InvoiceDetailPdfExportParams): Promise<void> {
  const { title, summaryFooterUsd, isPaidReportMode, includeRegion, normalRows = [], paidRows = [], fileBaseName } =
    params;

  const rows = isPaidReportMode ? paidRows : normalRows;
  if (rows.length === 0) {
    throw new Error('Aucune ligne à exporter');
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

  const headH = 20;
  const rowH = 15;
  const headFont = 7;
  const bodyFont = 6.5;
  const titleSize = 13;
  const metaSize = 9;
  const titleBottomLineThickness = 2.8;
  const footerLineSize = 8;
  const summaryLineH = 15;
  const summaryBlockPadX = 10;
  const summaryBlockPadY = 11;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  /** En-tête page : date, marque, titre (sans bordure haute, bordure basse épaisse). Pas de stats ici. */
  const drawPageHeader = () => {
    page.drawText(stripDiacriticsForPdf(stamp), {
      x: MARGIN,
      y: y - metaSize * 0.85,
      size: metaSize,
      font,
      color: GRAY_META,
    });
    drawTextRight(page, BRAND_RIGHT, PAGE_W - MARGIN, y - metaSize * 0.85, metaSize, font, GRAY_META);
    y -= 26;

    const lineW = contentW;
    const titleSafe = stripDiacriticsForPdf(title);
    const tw = fontBold.widthOfTextAtSize(titleSafe, titleSize);
    const titleX = MARGIN + (contentW - tw) / 2;
    page.drawText(titleSafe, {
      x: titleX,
      y: y - titleSize * 0.85,
      size: titleSize,
      font: fontBold,
      color: TEXT,
    });
    y -= titleSize + 6;

    page.drawLine({
      start: { x: MARGIN, y: y },
      end: { x: MARGIN + lineW, y: y },
      thickness: titleBottomLineThickness,
      color: RED_LINE,
    });
    y -= 16;
  };

  const needNewPage = (minY: number) => y < MARGIN + minY;

  const drawSummaryFooterInLastTwoCols = (colStarts: number[], widths: number[], fromEnd = 2) => {
    const tableRight = MARGIN + innerPad + innerTableW;
    const payIdx = Math.max(0, widths.length - fromEnd);
    const footerLeft = colStarts[payIdx] ?? MARGIN + innerPad;

    const items: { label: string; val: string }[] = [
      { label: 'Montant Total :', val: formatMoney(summaryFooterUsd.total, 'USD') },
      { label: 'Montant paye :', val: formatMoney(summaryFooterUsd.paid, 'USD') },
      { label: 'Solde a payer :', val: formatMoney(summaryFooterUsd.balance, 'USD') },
    ];

    let maxLineW = 0;
    for (const it of items) {
      const lw = fontBold.widthOfTextAtSize(stripDiacriticsForPdf(it.label), footerLineSize);
      const vw = font.widthOfTextAtSize(stripDiacriticsForPdf(it.val), footerLineSize);
      maxLineW = Math.max(maxLineW, lw + 4 + vw);
    }

    const blockPadXOuter = summaryBlockPadX;
    const blockW = Math.min(tableRight - footerLeft + blockPadXOuter * 2, maxLineW + summaryBlockPadX * 2);
    const blockLeft = Math.max(MARGIN, tableRight - blockW);
    const blockHeight = summaryBlockPadY * 2 + items.length * summaryLineH;

    if (needNewPage(blockHeight + 14)) {
      newPage();
      drawPageHeader();
    }

    const gapBelowTable = 10;
    const blockBottom = y - gapBelowTable - blockHeight;
    page.drawRectangle({
      x: blockLeft,
      y: blockBottom,
      width: tableRight - blockLeft,
      height: blockHeight,
      color: SUMMARY_BLOCK_BG,
      borderColor: rgb(0.82, 0.84, 0.88),
      borderWidth: 0.6,
    });

    for (let li = 0; li < items.length; li++) {
      const it = items[li]!;
      const lab = stripDiacriticsForPdf(it.label);
      const val = stripDiacriticsForPdf(it.val);
      const wLabel = fontBold.widthOfTextAtSize(lab, footerLineSize);
      const wVal = font.widthOfTextAtSize(val, footerLineSize);
      const lineW = wLabel + 4 + wVal;
      const baseline = blockBottom + summaryBlockPadY + (li + 0.72) * summaryLineH;
      const startX = tableRight - summaryBlockPadX - lineW;
      page.drawText(lab, {
        x: startX,
        y: baseline,
        size: footerLineSize,
        font: fontBold,
        color: TEXT,
      });
      page.drawText(val, {
        x: startX + wLabel + 4,
        y: baseline,
        size: footerLineSize,
        font,
        color: TEXT,
      });
    }

    y = blockBottom - 10;
  };

  drawPageHeader();

  if (!isPaidReportMode) {
    const g = 3;
    const labels = [
      'N° FACTURE',
      'FOURNISSEUR',
      'DATE REC.',
      ...(includeRegion ? ['REGION'] : []),
      'CATEG. CHARGE',
      'PRIORITE',
      'ECHEANCE',
      'VAL.',
      'MONTANT',
      'PAYE',
      'SOLDE',
    ];
    const baseW = includeRegion
      ? [72, 88, 44, 36, 92, 42, 42, 24, 56, 56, 56]
      : [78, 96, 46, 102, 44, 44, 26, 60, 60, 60];
    const widths = scaleWidthsToContent(baseW, innerTableW, g);

    const colStarts: number[] = [];
    let xWalk = MARGIN + innerPad;
    for (let i = 0; i < widths.length; i++) {
      colStarts.push(xWalk);
      xWalk += widths[i] + (i < widths.length - 1 ? g : 0);
    }

    const drawTableHeader = () => {
      if (needNewPage(headH + 8)) {
        newPage();
        drawPageHeader();
      }
      const headerTopY = y;
      const headerBottomY = y - headH;
      const hdrBorder = 1.15;
      page.drawLine({
        start: { x: MARGIN, y: headerTopY },
        end: { x: MARGIN + contentW, y: headerTopY },
        thickness: hdrBorder,
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
        thickness: hdrBorder,
        color: BLACK,
      });
      const headerBaseline = headerBottomY + 6;
      const moneyHdrStart = labels.length - 3;
      for (let i = 0; i < labels.length; i++) {
        const cx = colStarts[i]!;
        const w = widths[i]!;
        const lab = stripDiacriticsForPdf(labels[i]!);
        const t = truncateToWidth(lab, w - 4, fontBold, headFont);
        if (i >= moneyHdrStart) {
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

    drawTableHeader();

    const moneyStartIdx = widths.length - 3;

    let stripe = 0;
    normalRows.forEach((r) => {
      if (needNewPage(rowH + 4)) {
        newPage();
        drawPageHeader();
        drawTableHeader();
      }
      const bg = stripe % 2 === 1 ? ROW_ALT : WHITE;
      stripe += 1;
      page.drawRectangle({
        x: MARGIN,
        y: y - rowH,
        width: contentW,
        height: rowH,
        color: bg,
      });
      const baseline = y - rowH + 5;

      const textCells: string[] = [
        r.invoiceNumber,
        r.supplier,
        r.receptionDate,
      ];
      if (includeRegion) textCells.push(r.region || '');
      textCells.push(r.chargeCategory, r.urgency, r.dueDate, `${r.validationPct}%`);

      const moneyStr = [
        formatMoney(r.amountUsd, 'USD'),
        formatMoney(r.paidUsd, 'USD'),
        formatMoney(r.balanceUsd, 'USD'),
      ];

      for (let i = 0; i < textCells.length; i++) {
        const cx = colStarts[i]!;
        const w = widths[i]!;
        const fCell = i === 0 ? fontBold : font;
        const t = truncateToWidth(textCells[i] || '', w - 4, fCell, bodyFont);
        page.drawText(t, { x: cx + 2, y: baseline, size: bodyFont, font: fCell, color: TEXT });
      }

      for (let j = 0; j < 3; j++) {
        const i = moneyStartIdx + j;
        const cx = colStarts[i]!;
        const w = widths[i]!;
        const t = moneyStr[j]!;
        drawTextRight(page, t, cx + w - 2, baseline, bodyFont, fontBold, TEXT);
      }

      y -= rowH;
    });

    drawSummaryFooterInLastTwoCols(colStarts, widths, 2);
  } else {
    const g = 2;
    const paidLabels = [
      'N° FACT.',
      'FOURNISSEUR',
      'MONTANT',
      'MODE',
      'BQ SGL',
      'CPT SGL',
      'BQ FOUR.',
      'CPT FOUR.',
      'PAR',
      'FICH.',
      'DATE PAIE.',
    ];
    const basePaid = [56, 72, 52, 38, 58, 46, 58, 46, 38, 22, 44];
    const paidWidths = scaleWidthsToContent(basePaid, innerTableW, g);
    const paidStarts: number[] = [];
    let px = MARGIN + innerPad;
    for (let i = 0; i < paidWidths.length; i++) {
      paidStarts.push(px);
      px += paidWidths[i] + (i < paidWidths.length - 1 ? g : 0);
    }

    const drawPaidHeader = () => {
      if (needNewPage(headH + 8)) {
        newPage();
        drawPageHeader();
      }
      const headerTopY = y;
      const headerBottomY = y - headH;
      const hdrBorder = 1.15;
      page.drawLine({
        start: { x: MARGIN, y: headerTopY },
        end: { x: MARGIN + contentW, y: headerTopY },
        thickness: hdrBorder,
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
        thickness: hdrBorder,
        color: BLACK,
      });
      const headerBaseline = headerBottomY + 6;
      const paidMoneyCol = 2;
      for (let i = 0; i < paidLabels.length; i++) {
        const cx = paidStarts[i]!;
        const w = paidWidths[i]!;
        const lab = stripDiacriticsForPdf(paidLabels[i]!);
        const t = truncateToWidth(lab, w - 2, fontBold, 6.2);
        if (i === paidMoneyCol) {
          drawTextRight(page, t, cx + w - 2, headerBaseline, 6.2, fontBold, WHITE);
        } else {
          page.drawText(t, {
            x: cx + 1,
            y: headerBaseline,
            size: 6.2,
            font: fontBold,
            color: WHITE,
          });
        }
      }
      y -= headH + 2;
    };

    drawPaidHeader();

    let paidStripe = 0;
    paidRows.forEach((r) => {
      if (needNewPage(rowH + 4)) {
        newPage();
        drawPageHeader();
        drawPaidHeader();
      }
      const bg = paidStripe % 2 === 1 ? ROW_ALT : WHITE;
      paidStripe += 1;
      page.drawRectangle({
        x: MARGIN,
        y: y - rowH,
        width: contentW,
        height: rowH,
        color: bg,
      });
      const baseline = y - rowH + 5;
      const amtStr = formatMoney(r.amountUsd, 'USD');
      const vals = [
        truncateToWidth(r.invoiceNumber, paidWidths[0]! - 4, fontBold, bodyFont),
        truncateToWidth(r.supplier, paidWidths[1]! - 4, font, bodyFont),
        amtStr,
        truncateToWidth(r.modePaiement, paidWidths[3]! - 2, font, bodyFont),
        truncateToWidth(r.banqueSgl, paidWidths[4]! - 2, font, bodyFont),
        truncateToWidth(r.compteSgl, paidWidths[5]! - 2, font, bodyFont),
        truncateToWidth(r.banqueFournisseur, paidWidths[6]! - 2, font, bodyFont),
        truncateToWidth(r.compteFournisseur, paidWidths[7]! - 2, font, bodyFont),
        truncateToWidth(r.paidBy, paidWidths[8]! - 2, font, bodyFont),
        r.hasFichier ? 'Oui' : '-',
        truncateToWidth(r.datePaiement, paidWidths[10]! - 2, font, bodyFont),
      ];
      for (let i = 0; i < vals.length; i++) {
        const cx = paidStarts[i]!;
        const w = paidWidths[i]!;
        const txt = vals[i]!;
        const fCell = i === 0 || i === 2 ? fontBold : font;
        if (i === 2) {
          drawTextRight(page, txt, cx + w - 2, baseline, bodyFont, fCell, TEXT);
        } else {
          page.drawText(txt, { x: cx + 1, y: baseline, size: bodyFont, font: fCell, color: TEXT });
        }
      }
      y -= rowH;
    });

    drawSummaryFooterInLastTwoCols(paidStarts, paidWidths, 3);
  }

  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  const base =
    fileBaseName?.trim() ||
    `${stripDiacriticsForPdf(title).replace(/\s+/g, '_').slice(0, 80)}_${dateStr}`;
  const safe = stripDiacriticsForPdf(base)
    .replace(/[^\w._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 160);
  a.download = `${safe || 'export'}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

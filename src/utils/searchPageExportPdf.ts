import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

/** A4 portrait (pt) */
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const GAP = 2;

/** Texte du corps : +0,5 pt vs ancienne base ~7,7 pt */
const BODY_SIZE = 8.2;
const HEADER_SIZE = 9;
const META_SIZE = 9;
/** Titre principal (ex. FACTURES ÉCHUES) */
const TITLE_SIZE = 11.5;

export type SearchDetailPdfStatusKey = 'unpaid' | 'overdue' | 'rejected' | 'paid';

const SEARCH_DETAIL_PDF_TITLES: Record<SearchDetailPdfStatusKey, string> = {
  unpaid: 'FACTURES NON PAYÉES',
  overdue: 'FACTURES ÉCHUES',
  rejected: 'FACTURES REJETÉES',
  paid: 'FACTURES PAYÉES',
};

function getSearchDetailPdfTitle(
  statusKey: SearchDetailPdfStatusKey | undefined,
  statusLabel: string,
): string {
  if (statusKey && SEARCH_DETAIL_PDF_TITLES[statusKey]) {
    return SEARCH_DETAIL_PDF_TITLES[statusKey];
  }
  const norm = statusLabel
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const byLabel: Record<string, string> = {
    'non payees': 'FACTURES NON PAYÉES',
    echues: 'FACTURES ÉCHUES',
    rejetees: 'FACTURES REJETÉES',
    payees: 'FACTURES PAYÉES',
    'en attente de validation': 'FACTURES EN ATTENTE DE VALIDATION',
  };
  return byLabel[norm] ?? `FACTURES ${statusLabel.toUpperCase()}`;
}
const STAMP_SIZE = 9;

const HEADER_FILL = rgb(0.72, 0.16, 0.2);
/** Trait tableau / séparation totaux (noir) */
const RULE_BLACK = rgb(0.15, 0.15, 0.18);
const HEADER_RULE_THICK = 0.65;
/** Traits haut / bas du bandeau d’en-tête du tableau (export détail) : +0,5 pt vs HEADER_RULE_THICK */
const DETAIL_TABLE_HEADER_RULE_THICK = HEADER_RULE_THICK + 0.5;
const TEXT = rgb(0.11, 0.11, 0.12);
const GRAY_META = rgb(0.35, 0.35, 0.38);
const RED_SOLDE = rgb(0.55, 0.08, 0.12);
const GREEN_PAID = rgb(0.05, 0.55, 0.38);
const ROW_ALT = rgb(0.86, 0.86, 0.88);
const WHITE = rgb(1, 1, 1);
const META_BOX = rgb(0.98, 0.98, 0.99);
const RED_ACCENT = rgb(0.72, 0.14, 0.17);

export type SearchPdfInvoiceRow = {
  invoiceNumber: string;
  /** Utilisé par l’export « détail statut » uniquement */
  supplier?: string;
  date: string;
  dueDate: string | null;
  amount: number;
  totalPaid: number;
  restAPayer: number;
  status: string;
};

function formatCellDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

function isInvoiceFullyPaid(status: string): boolean {
  const t = String(status || '').trim();
  return t === 'PAYÉE' || t.toUpperCase() === 'PAYEE';
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
    /* Helvetica */
  }
  return { font, fontBold };
}

function fitText(text: string, maxW: number, f: PDFFont, size: number): string {
  const s = String(text ?? '');
  if (f.widthOfTextAtSize(s, size) <= maxW) return s;
  let t = s;
  const ell = '…';
  while (t.length > 1 && f.widthOfTextAtSize(t.slice(0, -1) + ell, size) > maxW) t = t.slice(0, -1);
  return t.slice(0, -1) + ell;
}

/** Montants PDF style français + devise : espace milliers, virgule décimale, « $ » après le chiffre. */
function formatMoneyFr(n: number): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  const core = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(n)
    .replace(/\u202f/g, ' ')
    .replace(/\u00a0/g, ' ');
  return `${core} $`;
}

/** Découpe un libellé d’en-tête de colonne sur plusieurs lignes selon la largeur utile. */
function wrapHeaderLines(rawLabel: string, maxW: number, f: PDFFont, size: number): string[] {
  const lab = rawLabel.toLocaleUpperCase('fr-FR');
  const key = lab.replace(/\u2019/g, "'").replace(/\s+/g, ' ');
  const forceSingleLine = key === 'D. RÉCEPTION' || key === "D.D'ÉCHÉANCE";
  if (maxW <= 8) return [fitText(lab, Math.max(4, maxW), f, size)];
  if (f.widthOfTextAtSize(lab, size) <= maxW) return [lab];
  if (forceSingleLine) return [fitText(lab, maxW, f, size)];
  const words = lab.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (f.widthOfTextAtSize(cand, size) <= maxW) {
      cur = cand;
    } else {
      if (cur) out.push(cur);
      if (f.widthOfTextAtSize(w, size) <= maxW) cur = w;
      else {
        out.push(fitText(w, maxW, f, size));
        cur = '';
      }
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [fitText(lab, maxW, f, size)];
}

function drawTableHeaderWrapped(
  page: PDFPage,
  yTop: number,
  colStarts: number[],
  widths: number[],
  labels: string[],
  fontBold: PDFFont,
  alignRightForIndex: (i: number) => boolean,
  headerFontSize: number,
  boostHeaderCols?: { indices: number[]; pt: number },
): number {
  const fsAt = (i: number) =>
    boostHeaderCols?.indices?.includes(i) ? headerFontSize + boostHeaderCols.pt : headerFontSize;
  const maxFs = Math.max(...labels.map((_, i) => fsAt(i)));
  const lineLead = maxFs + 2.8;
  const linesPerCol = labels.map((lab, i) =>
    wrapHeaderLines(lab, Math.max(8, widths[i]! - 4), fontBold, fsAt(i)),
  );
  const maxLines = Math.max(1, ...linesPerCol.map((a) => a.length));
  const headH = maxLines * lineLead + 14;
  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const bandBottom = yTop - headH;

  page.drawLine({
    start: { x: left, y: yTop },
    end: { x: right, y: yTop },
    thickness: DETAIL_TABLE_HEADER_RULE_THICK,
    color: RULE_BLACK,
  });
  page.drawRectangle({
    x: left,
    y: bandBottom,
    width: right - left,
    height: headH,
    color: HEADER_FILL,
  });
  page.drawLine({
    start: { x: left, y: bandBottom },
    end: { x: right, y: bandBottom },
    thickness: DETAIL_TABLE_HEADER_RULE_THICK,
    color: RULE_BLACK,
  });

  for (let i = 0; i < labels.length; i++) {
    const cx = colStarts[i]!;
    const w = widths[i]!;
    const lines = linesPerCol[i]!;
    const alignRight = alignRightForIndex(i);
    const fs = fsAt(i);
    const centerFromTop = headH / 2;
    const firstBaseline =
      yTop -
      centerFromTop +
      ((lines.length - 1) * lineLead) / 2 -
      fs * 0.28;
    for (let L = 0; L < lines.length; L++) {
      const baseline = firstBaseline - L * lineLead;
      const t = lines[L]!;
      if (alignRight) {
        drawRight(page, t, cx + w - 2, baseline, fs, fontBold, WHITE, w);
      } else {
        page.drawText(t, { x: cx + 2, y: baseline, size: fs, font: fontBold, color: WHITE });
      }
    }
  }
  return bandBottom;
}

function drawRight(
  page: PDFPage,
  text: string,
  xRight: number,
  y: number,
  size: number,
  f: PDFFont,
  color = TEXT,
  maxW = 400,
) {
  const t = fitText(text, maxW, f, size);
  const w = f.widthOfTextAtSize(t, size);
  page.drawText(t, { x: xRight - w, y, size, font: f, color });
}

function scaleWidths(base: number[], innerW: number, gap: number): number[] {
  const n = base.length;
  const gaps = gap * Math.max(0, n - 1);
  const sum = base.reduce((a, b) => a + b, 0);
  const scale = (innerW - gaps) / sum;
  return base.map((w) => w * scale);
}

function colStartsFromWidths(widths: number[], left: number, gap: number): number[] {
  const out: number[] = [];
  let x = left;
  for (let i = 0; i < widths.length; i++) {
    out.push(x);
    x += widths[i]! + (i < widths.length - 1 ? gap : 0);
  }
  return out;
}

/** Baseline pour une ligne de texte centrée verticalement dans [rowTop - rowH, rowTop] (repère PDF). */
function baselineVerticallyCentered(rowTop: number, rowH: number, fontSize: number): number {
  return rowTop - rowH / 2 - fontSize * 0.26;
}

/** Découpe la ligne « Statut … | Année … | … » pour affichage structuré. */
function splitDetailMetaLine(metaLine: string): string[] {
  const s = String(metaLine || '').trim();
  if (!s) return [];
  const parts = s.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts : [s];
}

/**
 * Libellés « Statut : », « Région : », « Année : », « Type : » en tête de segment méta (gras côté PDF).
 */
function splitMetaBoldLabel(line: string): { bold: string; normal: string } | null {
  const s = String(line || '').trim();
  const m = s.match(/^(Statut|Région|Année|Type)(\s*:\s*)(.*)$/i);
  if (!m) return null;
  return { bold: `${m[1]}${m[2] ?? ': '}`, normal: m[3] ?? '' };
}

function triggerDownload(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function drawTableHeader(
  page: PDFPage,
  yTop: number,
  colStarts: number[],
  widths: number[],
  labels: string[],
  fontBold: PDFFont,
  alignRightForIndex: (i: number) => boolean,
  headerFontSize: number = HEADER_SIZE,
): number {
  const headH = headerFontSize + 14;
  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const bandBottom = yTop - headH;

  page.drawLine({
    start: { x: left, y: yTop },
    end: { x: right, y: yTop },
    thickness: HEADER_RULE_THICK,
    color: RULE_BLACK,
  });
  page.drawRectangle({
    x: left,
    y: bandBottom,
    width: right - left,
    height: headH,
    color: HEADER_FILL,
  });
  page.drawLine({
    start: { x: left, y: bandBottom },
    end: { x: right, y: bandBottom },
    thickness: HEADER_RULE_THICK,
    color: RULE_BLACK,
  });

  const baseline = baselineVerticallyCentered(yTop, headH, headerFontSize);
  for (let i = 0; i < labels.length; i++) {
    const cx = colStarts[i]!;
    const w = widths[i]!;
    const lab = labels[i]!.toLocaleUpperCase('fr-FR');
    const alignRight = alignRightForIndex(i);
    const t = fitText(lab, w - 4, fontBold, headerFontSize);
    if (alignRight) {
      drawRight(page, t, cx + w - 2, baseline, headerFontSize, fontBold, WHITE, w);
    } else {
      page.drawText(t, { x: cx + 2, y: baseline, size: headerFontSize, font: fontBold, color: WHITE });
    }
  }
  return bandBottom;
}

function drawTotalsBlock(
  page: PDFPage,
  y: number,
  totals: { montant: number; paiement: number; solde: number },
  formatMoney: (n: number) => string,
  font: PDFFont,
  fontBold: PDFFont,
  firstLineOffset = 0,
  opts?: { bodySize?: number; valueStartX?: number; valueRightEdge?: boolean },
): number {
  const labels = ['Montant Total :', 'Montant payé :', 'Solde à payer :'];
  const vals = [formatMoney(totals.montant), formatMoney(totals.paiement), formatMoney(totals.solde)];
  const sz = opts?.bodySize ?? BODY_SIZE;
  const valueRight = PAGE_W - MARGIN - 2;
  const gap = 10;
  let yy = y - firstLineOffset;
  const lineH = sz + 3.5;
  const valueStartX = opts?.valueStartX;

  if (opts?.valueRightEdge) {
    const maxLabW = Math.max(...labels.map((lb) => fontBold.widthOfTextAtSize(lb, sz)));
    const maxValW = Math.max(...vals.map((val) => fontBold.widthOfTextAtSize(val, sz)));
    const gapCol = 14;
    const valueEdge = PAGE_W - MARGIN - 14;
    const labelX = valueEdge - maxValW - gapCol - maxLabW;
    let yy2 = yy;
    for (let i = 0; i < 3; i++) {
      const v = vals[i]!;
      const lab = labels[i]!;
      const color = i === 2 ? RED_SOLDE : TEXT;
      page.drawText(lab, {
        x: labelX,
        y: yy2,
        size: sz,
        font: fontBold,
        color: GRAY_META,
      });
      drawRight(page, v, valueEdge, yy2, sz, fontBold, color, 400);
      yy2 -= lineH;
    }
    return yy2;
  }

  for (let i = 0; i < 3; i++) {
    const v = vals[i]!;
    const lab = labels[i]!;
    const lw = fontBold.widthOfTextAtSize(lab, sz);
    const color = i === 2 ? RED_SOLDE : TEXT;

    if (valueStartX != null) {
      const labelEndX = valueStartX - gap;
      page.drawText(lab, {
        x: labelEndX - lw,
        y: yy,
        size: sz,
        font: fontBold,
        color: GRAY_META,
      });
      page.drawText(v, {
        x: valueStartX,
        y: yy,
        size: sz,
        font: fontBold,
        color,
      });
    } else {
      const vw = fontBold.widthOfTextAtSize(v, sz);
      const labelRightX = valueRight - vw - gap;
      page.drawText(lab, {
        x: labelRightX - lw,
        y: yy,
        size: sz,
        font: fontBold,
        color: GRAY_META,
      });
      drawRight(page, v, valueRight, yy, sz, fontBold, color, 200);
    }
    yy -= lineH;
  }
  return yy;
}

export async function downloadSearchDetailStatusPdf(opts: {
  rows: SearchPdfInvoiceRow[];
  totals: { montant: number; paiement: number; solde: number };
  statusKey?: SearchDetailPdfStatusKey;
  statusLabel: string;
  filterLabel: string;
  metaLine: string;
  formatMoney: (n: number) => string;
  fileName: string;
}): Promise<void> {
  const { rows, totals, statusKey, statusLabel, filterLabel, metaLine, fileName } = opts;
  const pdf = await PDFDocument.create();
  const { font, fontBold } = await embedReportFonts(pdf);

  /** En-têtes : retours à la ligne + police un peu plus grande, centrage vertical par colonne */
  const detailHeaderSize = 6.95;
  const detailBodySize = BODY_SIZE - 0.5;

  const contentW = PAGE_W - MARGIN * 2;
  const labels = [
    'N°',
    'N° facture',
    'Fournisseur',
    'D. réception',
    "D.D'échéance",
    'Montant',
    'Payé',
    'Solde',
  ];
  /** Colonnes dates : libellés courts + léger agrandissement d’en-tête (indices 3–4) */
  const baseW = [16, 84, 54, 50, 54, 48, 46, 48];
  const widths = scaleWidths(baseW, contentW, GAP);
  const colStarts = colStartsFromWidths(widths, MARGIN, GAP);

  const stamp = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const title = getSearchDetailPdfTitle(statusKey, statusLabel);
  const rowH = detailBodySize + 9;
  const footerH = 78;
  const metaParts = splitDetailMetaLine(metaLine);
  const metaSmall = META_SIZE - 0.5;
  const metaRows = Math.max(1, Math.ceil(metaParts.length / 2));
  const metaBoxPadTop = 10;
  const filterLineBlock = META_SIZE + 8;
  const metaRowStep = metaSmall + 5;
  const metaBoxH = metaBoxPadTop + filterLineBlock + metaRows * metaRowStep + 10;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawHeaderBlock = (p: PDFPage) => {
    let yy = PAGE_H - MARGIN;
    p.drawText(stamp, { x: MARGIN, y: yy - STAMP_SIZE * 0.85, size: STAMP_SIZE, font, color: GRAY_META });
    const brand = 'PMD — Shipping GL';
    const bw = font.widthOfTextAtSize(brand, STAMP_SIZE);
    p.drawText(brand, {
      x: PAGE_W - MARGIN - bw,
      y: yy - STAMP_SIZE * 0.85,
      size: STAMP_SIZE,
      font,
      color: GRAY_META,
    });
    yy -= 22;
    const titleFit = fitText(title, contentW - 8, fontBold, TITLE_SIZE);
    const tw = fontBold.widthOfTextAtSize(titleFit, TITLE_SIZE);
    p.drawText(titleFit, {
      x: MARGIN + (contentW - tw) / 2,
      y: yy - TITLE_SIZE * 0.85,
      size: TITLE_SIZE,
      font: fontBold,
      color: TEXT,
    });
    yy -= TITLE_SIZE + 6;
    p.drawLine({
      start: { x: MARGIN, y: yy },
      end: { x: PAGE_W - MARGIN, y: yy },
      thickness: 2.2,
      color: RED_ACCENT,
    });
    yy -= 12;
    const boxBottom = yy - metaBoxH;
    p.drawRectangle({
      x: MARGIN,
      y: boxBottom,
      width: contentW,
      height: metaBoxH,
      color: META_BOX,
      borderColor: rgb(0.88, 0.88, 0.9),
      borderWidth: 0.4,
    });
    const yFilterBl = yy - metaBoxPadTop - META_SIZE * 0.35;
    p.drawText(fitText(filterLabel, contentW - 12, fontBold, META_SIZE), {
      x: MARGIN + 6,
      y: yFilterBl,
      size: META_SIZE,
      font: fontBold,
      color: TEXT,
    });
    const metaRightX = PAGE_W - MARGIN - 16;
    const colInnerW = Math.max(120, metaRightX - (MARGIN + 6) - 100);
    let yMetaBl = yFilterBl - filterLineBlock;
    for (let r = 0; r < metaRows; r++) {
      const i0 = r * 2;
      const i1 = r * 2 + 1;
      const t0 = metaParts[i0];
      const t1 = metaParts[i1];
      if (t0) {
        const pair = splitMetaBoldLabel(t0);
        if (pair) {
          const bfit = fitText(pair.bold, colInnerW, fontBold, metaSmall);
          const bw0 = fontBold.widthOfTextAtSize(bfit, metaSmall);
          const restW = Math.max(8, colInnerW - bw0);
          const nfit = fitText(pair.normal, restW, font, metaSmall);
          p.drawText(bfit, {
            x: MARGIN + 6,
            y: yMetaBl,
            size: metaSmall,
            font: fontBold,
            color: TEXT,
          });
          p.drawText(nfit, {
            x: MARGIN + 6 + bw0,
            y: yMetaBl,
            size: metaSmall,
            font,
            color: TEXT,
          });
        } else {
          p.drawText(fitText(t0, colInnerW, font, metaSmall), {
            x: MARGIN + 6,
            y: yMetaBl,
            size: metaSmall,
            font,
            color: TEXT,
          });
        }
      }
      if (t1) {
        const pair = splitMetaBoldLabel(t1);
        if (pair) {
          const nfit = fitText(pair.normal.trim(), Math.min(200, contentW * 0.45), font, metaSmall);
          const bfit = fitText(pair.bold, 120, fontBold, metaSmall);
          const vw = font.widthOfTextAtSize(nfit, metaSmall);
          const lw = fontBold.widthOfTextAtSize(bfit, metaSmall);
          const gapm = 3;
          const rightEdge = metaRightX;
          drawRight(p, nfit, rightEdge, yMetaBl, metaSmall, font, TEXT, 220);
          drawRight(p, bfit, rightEdge - vw - gapm, yMetaBl, metaSmall, fontBold, TEXT, 120);
        } else {
          const t1Fit = fitText(t1, Math.min(200, contentW * 0.45), font, metaSmall);
          drawRight(p, t1Fit, metaRightX, yMetaBl, metaSmall, font, TEXT, 220);
        }
      }
      yMetaBl -= metaRowStep;
    }
    yy = boxBottom - 10;
    return yy;
  };

  y = drawHeaderBlock(page);
  const detailAlignHeader = (i: number) => i === 3 || i === 4 || i >= 5;
  let tableBottom = drawTableHeaderWrapped(
    page,
    y,
    colStarts,
    widths,
    labels,
    fontBold,
    detailAlignHeader,
    detailHeaderSize,
    { indices: [3, 4], pt: 0.85 },
  );
  y = tableBottom - 4;

  const drawRow = (p: PDFPage, inv: SearchPdfInvoiceRow, idx: number, yy: number): number => {
    const zebra = idx % 2 === 1;
    const bg = zebra ? ROW_ALT : WHITE;
    p.drawRectangle({
      x: MARGIN,
      y: yy - rowH,
      width: contentW,
      height: rowH,
      color: bg,
    });
    const baseline = baselineVerticallyCentered(yy, rowH, detailBodySize);
    const cells: string[] = [
      String(idx + 1),
      inv.invoiceNumber,
      String(inv.supplier ?? '—'),
      formatCellDate(inv.date),
      formatCellDate(inv.dueDate),
      formatMoneyFr(inv.amount),
      formatMoneyFr(inv.totalPaid),
      isInvoiceFullyPaid(inv.status) ? '−' : formatMoneyFr(inv.restAPayer),
    ];
    for (let c = 0; c < 8; c++) {
      const cx = colStarts[c]!;
      const w = widths[c]!;
      const alignRight = c === 3 || c === 4 || c >= 5;
      const raw = cells[c]!;
      const color =
        c === 7
          ? isInvoiceFullyPaid(inv.status)
            ? GREEN_PAID
            : RED_SOLDE
          : TEXT;
      const f = c === 1 || c >= 5 ? fontBold : font;
      const t = fitText(raw, w - 4, f, detailBodySize);
      if (alignRight) {
        drawRight(p, t, cx + w - 2, baseline, detailBodySize, f, color, w);
      } else {
        p.drawText(t, { x: cx + 2, y: baseline, size: detailBodySize, font: f, color });
      }
    }
    return yy - rowH;
  };

  for (let i = 0; i < rows.length; i++) {
    if (y < MARGIN + footerH + rowH + 20) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = drawHeaderBlock(page);
      tableBottom = drawTableHeaderWrapped(
        page,
        y,
        colStarts,
        widths,
        labels,
        fontBold,
        detailAlignHeader,
        detailHeaderSize,
        { indices: [3, 4], pt: 0.85 },
      );
      y = tableBottom - 4;
    }
    y = drawRow(page, rows[i]!, i, y);
  }

  y -= 8;
  if (y < MARGIN + footerH) {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN - 20;
  }
  page.drawLine({
    start: { x: MARGIN, y: y },
    end: { x: PAGE_W - MARGIN, y: y },
    thickness: 1.4,
    color: RULE_BLACK,
  });
  y -= 16;
  drawTotalsBlock(page, y, totals, formatMoneyFr, font, fontBold, 4, {
    bodySize: detailBodySize,
    valueRightEdge: true,
  });

  triggerDownload(await pdf.save(), fileName);
}

export async function downloadReleveSoaPdf(opts: {
  rows: SearchPdfInvoiceRow[];
  totals: { montant: number; paiement: number; solde: number };
  agentNom: string | null;
  releveSupplier: string;
  releveYear: string;
  releveDateStart: string;
  releveDateEnd: string;
  formatMoney: (n: number) => string;
  fileName: string;
}): Promise<void> {
  const { rows, totals, agentNom, releveSupplier, releveYear, releveDateStart, releveDateEnd, formatMoney, fileName } =
    opts;

  const pdf = await PDFDocument.create();
  const { font, fontBold } = await embedReportFonts(pdf);
  const contentW = PAGE_W - MARGIN * 2;

  const getPeriod = (): string => {
    if (releveDateStart && releveDateEnd) {
      const a = new Date(releveDateStart);
      const b = new Date(releveDateEnd);
      if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime())) {
        return `${a.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} – ${b.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
      }
    }
    const y = parseInt(releveYear, 10);
    if (!Number.isNaN(y)) {
      return `${new Date(y, 0, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} – ${new Date(y, 11, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
    }
    return '—';
  };

  const soaDateEn = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const compact = (releveSupplier || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const accountNo = releveSupplier ? `ACC-${(compact.slice(0, 10) || 'CLIENT')}-001` : '—';

  const labels = ['N°', 'N° facture', 'Fournisseur', 'Date réception', 'Échéance', 'Montant', 'Paiement', 'Solde'];
  const baseW = [18, 52, 78, 40, 40, 50, 50, 50];
  const widths = scaleWidths(baseW, contentW, GAP);
  const colStarts = colStartsFromWidths(widths, MARGIN, GAP);

  const stamp = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const rowH = BODY_SIZE + 10;
  const footerH = 62;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawSoaHeader = (p: PDFPage) => {
    let yy = PAGE_H - MARGIN;
    p.drawText(stamp, { x: MARGIN, y: yy - STAMP_SIZE * 0.85, size: STAMP_SIZE, font, color: GRAY_META });
    const brand = 'PMD — Shipping GL';
    const bw = font.widthOfTextAtSize(brand, STAMP_SIZE);
    p.drawText(brand, { x: PAGE_W - MARGIN - bw, y: yy - STAMP_SIZE * 0.85, size: STAMP_SIZE, font, color: GRAY_META });
    yy -= 22;
    const ttl = 'RELEVÉ DE FACTURES';
    const tw = fontBold.widthOfTextAtSize(ttl, TITLE_SIZE - 1);
    p.drawText(ttl, { x: MARGIN + (contentW - tw) / 2, y: yy - (TITLE_SIZE - 1) * 0.85, size: TITLE_SIZE - 1, font: fontBold, color: TEXT });
    yy -= TITLE_SIZE + 4;
    p.drawLine({
      start: { x: MARGIN, y: yy },
      end: { x: PAGE_W - MARGIN, y: yy },
      thickness: 2.2,
      color: RED_ACCENT,
    });
    yy -= 10;
    const mid = MARGIN + contentW / 2;
    const leftLines = [
      'RELEVÉ DE COMPTE',
      'Companie : SHIPPING GL SARL',
      'Addresse : 157 Avenu du livre, Kinshasa/Gombe',
      'RCCM : CD/KNG/RCCM/24-B-02901',
      'NIF : A1519206T',
      'Contact : accounting@shippinggreatlakes.com',
      `Prepared By : ${agentNom || '—'}`,
      `Date : ${soaDateEn}`,
      'Currency : USD',
    ];
    const rightLines = [
      'ACCOUNT INFORMATION',
      `Supplier / Client : ${releveSupplier || '—'}`,
      `Account Number : ${accountNo}`,
      'Payment Terms : TBA',
      `Period Covered : ${getPeriod()}`,
    ];
    const boxH = 88;
    p.drawRectangle({
      x: MARGIN,
      y: yy - boxH,
      width: contentW,
      height: boxH,
      color: META_BOX,
      borderColor: rgb(0.88, 0.88, 0.9),
      borderWidth: 0.45,
    });
    let ly = yy - 12;
    for (const line of leftLines) {
      const f = line.startsWith('RELEVÉ') ? fontBold : font;
      const s = line.startsWith('RELEVÉ') ? 8.5 : 7.8;
      p.drawText(fitText(line, mid - MARGIN - 14, f, s), { x: MARGIN + 8, y: ly, size: s, font: f, color: TEXT });
      ly -= s + 2.2;
    }
    let ry = yy - 12;
    for (const line of rightLines) {
      const f = line.startsWith('ACCOUNT') ? fontBold : font;
      const s = line.startsWith('ACCOUNT') ? 8.5 : 7.8;
      p.drawText(fitText(line, PAGE_W - MARGIN - mid - 8, f, s), { x: mid + 6, y: ry, size: s, font: f, color: TEXT });
      ry -= s + 2.2;
    }
    yy -= boxH + 10;
    return yy;
  };

  y = drawSoaHeader(page);
  const releveAlignHeader = (i: number) => i >= 3;
  let tableBottom = drawTableHeader(page, y, colStarts, widths, labels, fontBold, releveAlignHeader);
  y = tableBottom - 4;

  const drawRelRow = (p: PDFPage, inv: SearchPdfInvoiceRow, idx: number, yy: number): number => {
    const zebra = idx % 2 === 1;
    const bg = zebra ? ROW_ALT : WHITE;
    p.drawRectangle({ x: MARGIN, y: yy - rowH, width: contentW, height: rowH, color: bg });
    const baseline = baselineVerticallyCentered(yy, rowH, BODY_SIZE);
    const cells = [
      String(idx + 1),
      inv.invoiceNumber,
      String(inv.supplier ?? '—'),
      formatCellDate(inv.date),
      formatCellDate(inv.dueDate),
      formatMoney(inv.amount),
      formatMoney(inv.totalPaid),
      isInvoiceFullyPaid(inv.status) ? '−' : formatMoney(inv.restAPayer),
    ];
    for (let c = 0; c < 8; c++) {
      const cx = colStarts[c]!;
      const w = widths[c]!;
      const alignRight = c >= 3;
      const raw = cells[c]!;
      const color =
        c === 7
          ? isInvoiceFullyPaid(inv.status)
            ? GREEN_PAID
            : RED_SOLDE
          : TEXT;
      const f = c === 1 || c >= 5 ? fontBold : font;
      const t = fitText(raw, w - 4, f, BODY_SIZE);
      if (alignRight) drawRight(p, t, cx + w - 2, baseline, BODY_SIZE, f, color, w);
      else p.drawText(t, { x: cx + 2, y: baseline, size: BODY_SIZE, font: f, color });
    }
    return yy - rowH;
  };

  for (let i = 0; i < rows.length; i++) {
    if (y < MARGIN + footerH + rowH + 20) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = drawSoaHeader(page);
      tableBottom = drawTableHeader(page, y, colStarts, widths, labels, fontBold, releveAlignHeader);
      y = tableBottom - 4;
    }
    y = drawRelRow(page, rows[i]!, i, y);
  }

  y -= 8;
  if (y < MARGIN + footerH) {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN - 20;
  }
  page.drawLine({
    start: { x: MARGIN, y: y },
    end: { x: PAGE_W - MARGIN, y: y },
    thickness: 1.4,
    color: RULE_BLACK,
  });
  y -= 16;
  drawTotalsBlock(page, y, totals, formatMoney, font, fontBold, 4);

  triggerDownload(await pdf.save(), fileName);
}

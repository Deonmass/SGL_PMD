import * as XLSX from 'xlsx';
import type { SupplierAgedInvoicesGrouped, AgedBalanceInvoiceRow } from '../services/tableService';

export function sanitizeFilePart(value: string, maxLen = 40): string {
  const s = String(value || 'x')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return (s || 'x').slice(0, maxLen);
}

function formatExcelDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('fr-FR');
}

export const SUPPLIER_AGED_BALANCE_EXPORT_BLOCKS: Array<{
  key: keyof SupplierAgedInvoicesGrouped;
  title: string;
}> = [
  { key: 'zero30', title: 'Catégorie 1 : 0-30 jours' },
  { key: 'thirty60', title: 'Catégorie 2 : 31-60 jours' },
  { key: 'sixty90', title: 'Catégorie 3 : 61-90 jours' },
  { key: 'plus90', title: 'Catégorie 4 : plus de 90 jours' },
];

export function sumAgedBalanceRowsMoney(rows: AgedBalanceInvoiceRow[]) {
  return rows.reduce(
    (acc, r) => ({
      montant: acc.montant + r.montant,
      paye: acc.paye + r.paye,
      solde: acc.solde + r.solde,
    }),
    { montant: 0, paye: 0, solde: 0 }
  );
}

/** Base de nom de fichier (sans extension), alignée Excel / PDF. */
export function getSupplierAgedBalanceFileBase(opts: {
  supplier: string;
  year: string;
  regionLabel: string;
}): string {
  const { supplier, year, regionLabel } = opts;
  return `Balance_agee_${sanitizeFilePart(supplier, 44)}_${sanitizeFilePart(year, 6)}_${sanitizeFilePart(regionLabel, 24)}_${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Export Excel balance âgée par fournisseur : mêmes colonnes que l’écran,
 * avec une ligne séparatrice par tranche d’âge (catégorie).
 */
export function downloadSupplierAgedBalanceExcel(opts: {
  supplier: string;
  year: string;
  regionLabel: string;
  grouped: SupplierAgedInvoicesGrouped;
}): void {
  const { supplier, year, regionLabel, grouped } = opts;
  const aoa: (string | number)[][] = [];

  aoa.push([`Balance âgée — ${supplier}`]);
  aoa.push([`Année: ${year}`, `Région: ${regionLabel}`]);
  aoa.push([]);

  let grand = { montant: 0, paye: 0, solde: 0 };

  for (const block of SUPPLIER_AGED_BALANCE_EXPORT_BLOCKS) {
    const rows = grouped[block.key];
    if (!rows.length) continue;

    aoa.push([`--- ${block.title} ---`]);
    aoa.push(['N° facture', 'Date reçu', 'Date échue', 'Statut', 'Montant', 'Payé', 'Solde']);

    for (const inv of rows) {
      aoa.push([
        inv.numeroFacture,
        formatExcelDate(inv.dateReception),
        formatExcelDate(inv.dateEcheance),
        String(inv.statut ?? '').trim(),
        inv.montant,
        inv.paye,
        inv.solde,
      ]);
    }

    const sub = sumAgedBalanceRowsMoney(rows);
    aoa.push(['Sous-total (catégorie)', '', '', '', sub.montant, sub.paye, sub.solde]);
    aoa.push([]);
    grand = {
      montant: grand.montant + sub.montant,
      paye: grand.paye + sub.paye,
      solde: grand.solde + sub.solde,
    };
  }

  aoa.push(['TOTAL GÉNÉRAL', '', '', '', grand.montant, grand.paye, grand.solde]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Balance_agee');

  const fname = `${getSupplierAgedBalanceFileBase({ supplier, year, regionLabel })}.xlsx`;
  XLSX.writeFile(wb, fname);
}

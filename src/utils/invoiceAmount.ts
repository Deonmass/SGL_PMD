export function parseAmountValue(value: unknown): number {
  const n = parseFloat(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Valeur affichée dans un champ montant — CDF sans décimales parasites. */
export function formatAmountInputValue(value: unknown, currency: string): string {
  const n = parseAmountValue(value);
  if (!n) return '';
  if (currency === 'CDF') return String(Math.round(n));
  return String(n);
}

export function computeUsdAmount(
  invoiceAmount: number,
  currency: string,
  exchangeRate: number
): number {
  const rate = exchangeRate > 0 ? exchangeRate : 1;
  let usd = invoiceAmount;
  if (currency === 'CDF') usd = invoiceAmount / rate;
  else if (currency === 'EUR') usd = invoiceAmount * rate;
  return Math.round(usd * 100) / 100;
}

type InvoiceAmountSource = {
  Montant?: unknown;
  amount?: unknown;
  'montant facture'?: unknown;
  Devise?: unknown;
  currency?: unknown;
  'Taux facture'?: unknown;
  exchangeRate?: unknown;
};

/**
 * Montant USD à afficher / totaliser.
 * `Montant` en base est le converti USD ; si incohérent avec montant facture + taux, on recalcule.
 */
export function resolveInvoiceUsdMontant(source: InvoiceAmountSource): number {
  const devise = String(source.Devise ?? source.currency ?? 'USD').toUpperCase();
  const montantFacture = parseAmountValue(source['montant facture']);
  const montantUsd = parseAmountValue(source.Montant ?? source.amount);
  const taux = parseAmountValue(source['Taux facture'] ?? source.exchangeRate);

  if (devise === 'USD') {
    return montantUsd > 0 ? montantUsd : montantFacture;
  }

  if (montantFacture > 0 && taux > 0) {
    const computed = computeUsdAmount(montantFacture, devise, taux);
    if (montantUsd <= 0) return computed;
    const ref = Math.max(computed, 0.01);
    if (Math.abs(montantUsd - computed) / ref > 0.05) return computed;
    return montantUsd;
  }

  return montantUsd;
}

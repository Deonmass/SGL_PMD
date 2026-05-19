/** Espace insécable étroit / insécable → espace classique (séparateur de milliers lisible en fr-FR) */
const normalizeThousandsSpaces = (s: string) => s.replace(/\u202f|\u00a0/g, ' ');

// Format numbers with thousand separators (groupes de 3 chiffres)
export const formatCurrency = (value: number, locale: string = 'fr-FR'): string => {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return normalizeThousandsSpaces(
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(safe)
  );
};

export const formatNumber = (value: number, locale: string = 'fr-FR'): string => {
  const n = Number(value);
  const safe = Number.isFinite(n) ? Math.round(n) : 0;
  return normalizeThousandsSpaces(
    new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).format(safe)
  );
};

export const formatMoney = (
  value: number,
  currency: string = 'USD',
  locale: string = 'fr-FR'
): string => {
  const safeCurrency = String(currency || 'USD').toUpperCase();
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return normalizeThousandsSpaces(
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: safeCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      }).format(safe)
    );
  } catch {
    return `${formatCurrency(safe, locale)} ${safeCurrency}`;
  }
};

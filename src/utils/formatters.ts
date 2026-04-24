// Format numbers with thousand separators
export const formatCurrency = (value: number, locale: string = 'fr-FR'): string => {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatNumber = (value: number, locale: string = 'fr-FR'): string => {
  return new Intl.NumberFormat(locale).format(Math.round(value));
};

export const formatMoney = (
  value: number,
  currency: string = 'USD',
  locale: string = 'fr-FR'
): string => {
  const safeCurrency = String(currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `${formatCurrency(value || 0, locale)} ${safeCurrency}`;
  }
};

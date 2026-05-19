export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

/** ISO 3166-1 alpha-2 (pays et territoires couramment utilisés) */
const ISO_COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'YE', 'YT',
  'ZA', 'ZM', 'ZW',
] as const;

export function isoToFlag(code: string): string {
  const iso = code.trim().toUpperCase();
  if (iso.length !== 2) return '';
  return String.fromCodePoint(
    ...[...iso].map((char) => 0x1f1e6 - 65 + char.charCodeAt(0)),
  );
}

let cachedCountries: CountryOption[] | null = null;

export function getWorldCountries(locale = 'fr'): CountryOption[] {
  if (cachedCountries) return cachedCountries;

  const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
  const list: CountryOption[] = [];

  for (const code of ISO_COUNTRY_CODES) {
    const name = displayNames.of(code);
    if (!name || name === code) continue;
    list.push({ code, name, flag: isoToFlag(code) });
  }

  list.sort((a, b) => a.name.localeCompare(b.name, locale));
  cachedCountries = list;
  return list;
}

export function searchCountries(query: string, locale = 'fr'): CountryOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return getWorldCountries(locale).filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q),
  );
}

export function formatCountryDisplay(country: CountryOption): string {
  return `${country.flag} ${country.name}`;
}

/** Retrouve un pays à partir de la valeur stockée (nom seul ou "🇫🇷 France") */
export function matchStoredCountry(value: string, locale = 'fr'): CountryOption | null {
  const raw = value.trim();
  if (!raw) return null;
  const countries = getWorldCountries(locale);
  const byExactName = countries.find((c) => c.name.toLowerCase() === raw.toLowerCase());
  if (byExactName) return byExactName;
  const withoutFlag = raw.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '').trim();
  return countries.find((c) => c.name.toLowerCase() === withoutFlag.toLowerCase()) ?? null;
}

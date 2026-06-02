export const TRANSPORT_TITLE_AUTRE = 'Autre';

/** Ancien libellé en base — conservé pour lecture / affichage */
export const TRANSPORT_TITLE_LEGACY_ROUTIER = 'Lettre de voiture CMR';

export const TRANSPORT_TITLE_ROUTIER = 'Lettre de transport routier CRM';

export const TRANSPORT_TITLE_OPTIONS = [
  { value: 'Connaissement maritime BL', label: 'Connaissement maritime BL' },
  { value: 'Lettre de transport aérien LTA', label: 'Lettre de transport aérien LTA' },
  { value: TRANSPORT_TITLE_ROUTIER, label: TRANSPORT_TITLE_ROUTIER },
  { value: 'Lettre de transport ferroviaire CIM', label: 'Lettre de transport ferroviaire CIM' },
  { value: TRANSPORT_TITLE_AUTRE, label: TRANSPORT_TITLE_AUTRE },
] as const;

const TRANSPORT_NUMERO_LABELS: Record<string, string> = {
  'Connaissement maritime BL': 'Numéro BL',
  'Lettre de transport aérien LTA': 'Numéro LTA',
  [TRANSPORT_TITLE_ROUTIER]: 'Numéro CMR',
  [TRANSPORT_TITLE_LEGACY_ROUTIER]: 'Numéro CMR',
  'Lettre de transport ferroviaire CIM': 'Numéro CIM',
};

const TRANSPORT_COMPACT_CODES: Record<string, string> = {
  'Connaissement maritime BL': 'BL',
  'Lettre de transport aérien LTA': 'LTA',
  [TRANSPORT_TITLE_ROUTIER]: 'CMR',
  [TRANSPORT_TITLE_LEGACY_ROUTIER]: 'CMR',
  'Lettre de transport ferroviaire CIM': 'CIM',
};

const TRANSPORT_CODES = ['BL', 'LTA', 'CMR', 'CIM'] as const;

/** Normalise un titre stocké (anciennes valeurs en base). */
export function normalizeTransportTitle(transportTitle: string): string {
  const title = String(transportTitle || '').trim();
  if (title === TRANSPORT_TITLE_LEGACY_ROUTIER) return TRANSPORT_TITLE_ROUTIER;
  return title;
}

/** Afficher le champ numéro après sélection d’un titre (sauf « Autre »). */
export function shouldShowTransportNumero(transportTitle: string): boolean {
  const title = normalizeTransportTitle(transportTitle);
  return !!title && !isAutreTransportTitle(title);
}

export function isAutreTransportTitle(transportTitle: string): boolean {
  return transportTitle === TRANSPORT_TITLE_AUTRE;
}

export function getTransportNumeroLabel(transportTitle: string): string {
  const title = normalizeTransportTitle(transportTitle);
  if (!title || isAutreTransportTitle(title)) {
    return 'Numéro';
  }
  return TRANSPORT_NUMERO_LABELS[title] ?? 'Numéro';
}

/** Affichage compact : BL12344, LTA12345, CMR… */
export function formatTransportCompact(
  transportTitle: string,
  numero?: string | null,
): string | null {
  const title = normalizeTransportTitle(transportTitle);
  if (!title || isAutreTransportTitle(title)) return null;

  const code = TRANSPORT_COMPACT_CODES[title];
  const num = String(numero || '').trim();
  if (!code || !num || num.toUpperCase() === 'NA') return null;

  return `${code}${num}`;
}

/** Affichage code + numéro au format `BL:HLCUBO12512BBOC8` */
export function formatTransportCodeNumero(
  transportTitle: string,
  numero?: string | null,
): string | null {
  const title = normalizeTransportTitle(transportTitle);
  const num = String(numero || '').trim();
  const compact = formatTransportCompact(title, num);

  if (compact) {
    const code = TRANSPORT_COMPACT_CODES[title];
    if (code) return `${code}:${num}`;
  }

  if (!title && !num) return null;

  const upperTitle = title.toUpperCase();
  for (const code of TRANSPORT_CODES) {
    if (upperTitle.startsWith(code)) {
      const suffix = title.slice(code.length).trim();
      const merged = `${suffix}${num}`.trim();
      return merged ? `${code}:${merged}` : `${code}:`;
    }
  }

  if (title && num) return `${title}:${num}`;
  if (title) return title;
  if (num) return num;
  return null;
}

/** Valeur enregistrée en base pour la colonne numero */
export function resolveTransportNumero(transportTitle: string, numero: string): string | null {
  if (isAutreTransportTitle(normalizeTransportTitle(transportTitle))) {
    return 'NA';
  }
  const cleaned = String(numero || '').trim();
  return cleaned || null;
}

export type RejetExchangeEntry = Record<string, unknown>;

/** Niveaux DR/DOP/DG stockés dans `type` pour un vrai rejet — à ne pas confondre avec un « type » d’échange. */
const VALIDATION_LEVEL_IN_TYPE = new Set(['dr', 'dop', 'dg']);

function normExchangeKind(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
}

export function parseFactureRejetEntries(raw: unknown): RejetExchangeEntry[] {
  if (raw == null || raw === '') return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Entrée « mise à jour » uniquement si c’est indiqué explicitement (`eventType` / `type` = libellé mise à jour).
 *
 * **Ancien format rejet (toujours traité comme rejet, pas comme mise à jour)** — ex. :
 * `{ "datetime":"…", "raison":"…", "type":"dr", "name":"…", "email":"…" }`
 * Ici `type` est le **niveau** DR/DOP/DG, pas un type d’échange « mise à jour ».
 *
 * Autres cas comptés comme **rejet** : pas de `eventType`, pas de `type`, ou `eventType`/`type` = `rejet`.
 */
export function isEntryMiseAJour(entry: RejetExchangeEntry): boolean {
  const et = normExchangeKind(entry.eventType);
  if (et === 'miseajour') return true;

  const ty = normExchangeKind(entry.type);
  if (!ty || VALIDATION_LEVEL_IN_TYPE.has(ty) || ty === 'rejet') return false;
  return ty === 'miseajour';
}

/** Entrée de retrait de rejet (ne compte pas comme un rejet actif). */
export function isEntryRetraitRejet(entry: RejetExchangeEntry): boolean {
  const et = normExchangeKind(entry.eventType);
  return et === 'retraitrejet';
}

/** Rejet validateur ou legacy : tout sauf mise à jour ou retrait de rejet. */
export function isEntryRejetHistorique(entry: RejetExchangeEntry): boolean {
  if (isEntryRetraitRejet(entry)) return false;
  return !isEntryMiseAJour(entry);
}

/** Dernière entrée de rejet (hors mises à jour et retraits). */
export function getLastRejectionEntry(entries: RejetExchangeEntry[]): RejetExchangeEntry | null {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => entryTimestamp(a) - entryTimestamp(b));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const entry = sorted[i]!;
    if (isEntryMiseAJour(entry) || isEntryRetraitRejet(entry)) continue;
    if (isEntryRejetHistorique(entry)) return entry;
  }
  return null;
}

export function isAgentRejectionAuthor(
  entry: RejetExchangeEntry,
  agent?: { email?: string | null; Nom?: string | null } | null
): boolean {
  const myEmail = String(agent?.email || '')
    .trim()
    .toLowerCase();
  const authorEmail = String(entry.email || '')
    .trim()
    .toLowerCase();
  if (myEmail && authorEmail && myEmail === authorEmail) return true;

  const myName = String(agent?.Nom || '')
    .trim()
    .toLowerCase();
  const authorName = String(entry.name || '')
    .trim()
    .toLowerCase();
  if (myName && authorName && myName === authorName) return true;

  return false;
}

/** L’agent courant est l’auteur du dernier rejet enregistré (email ou nom). */
export function canAgentWithdrawLastRejection(
  rejetRaw: unknown,
  agent?: { email?: string | null; Nom?: string | null } | null
): boolean {
  const entries = parseFactureRejetEntries(rejetRaw);
  const last = getLastRejectionEntry(entries);
  if (!last) return false;
  return isAgentRejectionAuthor(last, agent);
}

function entryTimestamp(entry: RejetExchangeEntry): number {
  const d = String(entry.datetime ?? entry.date ?? '');
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Dernière entrée chronologique de la colonne Rejet : est-ce un rejet (pas une mise à jour) ?
 * Historique vide → rejet (compatibilité).
 * Entrée **sans** `eventType` / sans type d’échange explicite « mise à jour » → **rejet** (legacy).
 */
export function isLastRejetColumnEntryARejet(rejetRaw: unknown): boolean {
  const entries = parseFactureRejetEntries(rejetRaw);
  if (entries.length === 0) return true;
  const last = [...entries].sort((a, b) => entryTimestamp(a) - entryTimestamp(b))[entries.length - 1];
  return isEntryRejetHistorique(last);
}

/** Facture à classer / afficher comme « rejetée » : statut rejet ET dernière ligne d’historique = rejet. */
export function isInvoiceEffectivelyRejected(statut: unknown, rejetRaw: unknown): boolean {
  const s = String(statut || '').toLowerCase();
  if (!s.includes('rejet')) return false;
  return isLastRejetColumnEntryARejet(rejetRaw);
}

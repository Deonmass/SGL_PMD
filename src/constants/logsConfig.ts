export type LogTab = 'facture' | 'facture-ffg' | 'paiement' | 'user';

export const LOG_TABS: { id: LogTab; label: string }[] = [
  { id: 'facture', label: 'FACTURE' },
  { id: 'facture-ffg', label: 'FACTURE FFG' },
  { id: 'paiement', label: 'PAIEMENT' },
  { id: 'user', label: 'UTILISATEUR' },
];

export const LOG_PERMISSION_KEY = 'logs';

/** Types d’actions annulables depuis la page LOGs (dernière action facture uniquement). */
export const UNDOABLE_INVOICE_MODIFICATIONS = new Set([
  'Validation DR',
  'Validation DOP',
  'Rejet',
  'Retrait validation DR',
  'Retrait validation DOP',
]);

export function isUndoableLogEntry(
  log: { source: string; modification: string },
  canUndo: boolean,
): boolean {
  if (!canUndo) return false;
  if (log.source === 'PAIEMENT') return true;
  if (log.source === 'FACTURE' || log.source === 'FACTURE FFG') {
    return UNDOABLE_INVOICE_MODIFICATIONS.has(log.modification);
  }
  return false;
}

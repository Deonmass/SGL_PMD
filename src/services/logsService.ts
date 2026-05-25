import { supabase } from './supabase';
import { refreshLogs } from '../hooks/useDataRefresh';
import {
  appendFactureLogByInvoiceNumber,
  buildLogActor,
  parseFactureLogs,
  type FactureLogEntry,
} from './activityLogService';
import type { LogTab } from '../constants/logsConfig';

export type UiLog = {
  id: string;
  timestamp: string;
  nom: string;
  email: string;
  modification: string;
  explication: string;
  source: string;
  invoiceNumber?: string;
  rawLogIndex?: number;
  paymentId?: string;
};

const asText = (value: unknown) => String(value ?? '').trim();

function mapFactureEntries(
  rows: Array<Record<string, unknown>>,
  sourceLabel: 'FACTURE' | 'FACTURE FFG',
): UiLog[] {
  const parsed: UiLog[] = [];
  rows.forEach((row, rowIndex) => {
    const invoiceNumber = asText(row['Numéro de facture']);
    const entries = parseFactureLogs(row.updated_at);
    entries.forEach((entry: FactureLogEntry, idx) => {
      parsed.push({
        id: `${invoiceNumber}-${rowIndex}-${idx}`,
        timestamp: entry.timestamp,
        nom: entry.nom,
        email: entry.email,
        modification: entry.modification,
        explication: entry.explication,
        source: sourceLabel,
        invoiceNumber,
        rawLogIndex: idx,
      });
    });
  });
  return parsed;
}

async function loadFactureLogs(tab: 'facture' | 'facture-ffg'): Promise<UiLog[]> {
  const targetType = tab === 'facture' ? 'operationnel' : 'frais-generaux';
  const sourceLabel = tab === 'facture' ? 'FACTURE' : 'FACTURE FFG';

  const { data, error } = await supabase
    .from('FACTURES')
    .select('"Numéro de facture", "Type de facture", updated_at')
    .eq('Type de facture', targetType)
    .order('Date de réception', { ascending: false });

  if (error) throw error;

  const parsed = mapFactureEntries((data || []) as Record<string, unknown>[], sourceLabel);

  const { data: deletionLogs, error: delError } = await supabase
    .from('PAIEMENTS')
    .select('id, NumeroFacture, timestamp, paiedby, commentaires, modePaiement')
    .eq('typePaiement', 'log_suppression_facture')
    .eq('modePaiement', targetType)
    .order('timestamp', { ascending: false });

  if (delError) throw delError;

  (deletionLogs || []).forEach((row: Record<string, unknown>, idx: number) => {
    const email = asText(row.paiedby) || 'N/A';
    parsed.push({
      id: `suppression-${row.id || idx}`,
      timestamp: asText(row.timestamp) || new Date().toISOString(),
      nom: email.includes('@') ? email.split('@')[0] : 'Utilisateur',
      email,
      modification: 'Suppression',
      explication: asText(row.commentaires) || 'Facture supprimée.',
      source: sourceLabel,
      invoiceNumber: asText(row.NumeroFacture),
    });
  });

  return parsed;
}

async function loadPaiementLogs(): Promise<UiLog[]> {
  const { data, error } = await supabase
    .from('PAIEMENTS')
    .select(
      'id, NumeroFacture, timestamp, datePaiement, montantPaye, devise, modePaiement, referencePaiement, paiedby, typePaiement',
    )
    .neq('typePaiement', 'log_suppression_facture')
    .order('timestamp', { ascending: false });

  if (error) throw error;

  return (data || []).map((row: Record<string, unknown>, index: number) => {
    const email = asText(row.paiedby) || 'N/A';
    return {
      id: String(row.id || `paiement-${index}`),
      paymentId: String(row.id || ''),
      timestamp: asText(row.timestamp) || asText(row.datePaiement) || new Date().toISOString(),
      nom: email.includes('@') ? email.split('@')[0] : 'Utilisateur',
      email,
      modification: 'Paiement',
      explication: `Paiement ${asText(row.modePaiement) || 'non précisé'} de ${row.montantPaye ?? 0} ${asText(row.devise) || 'USD'} (réf: ${asText(row.referencePaiement) || 'N/A'}).`,
      source: 'PAIEMENT',
      invoiceNumber: asText(row.NumeroFacture),
    };
  });
}

async function loadUserLogs(): Promise<UiLog[]> {
  const { data, error } = await supabase
    .from('AGENTS')
    .select('ID, Nom, email, Role, REGION, Derniere_connexion, statut')
    .order('Derniere_connexion', { ascending: false });

  if (error) throw error;

  return (data || [])
    .filter((row: Record<string, unknown>) => row.Derniere_connexion)
    .map((row: Record<string, unknown>) => ({
      id: `agent-${row.ID}-${row.Derniere_connexion}`,
      timestamp: String(row.Derniere_connexion),
      nom: asText(row.Nom) || 'Utilisateur',
      email: asText(row.email) || 'N/A',
      modification: 'Connexion',
      explication: `Connexion au système. Rôle : ${asText(row.Role) || 'N/A'}, région : ${asText(row.REGION) || 'N/A'}, statut : ${asText(row.statut) || 'N/A'}.`,
      source: 'UTILISATEUR',
    }));
}

export async function fetchLogsForTab(tab: LogTab): Promise<UiLog[]> {
  switch (tab) {
    case 'facture':
    case 'facture-ffg':
      return loadFactureLogs(tab);
    case 'paiement':
      return loadPaiementLogs();
    case 'user':
      return loadUserLogs();
    default:
      return [];
  }
}

export function filterUiLogs(
  logs: UiLog[],
  filters: { search: string; emailFilter: string; dateFrom: string; dateTo: string },
): UiLog[] {
  const text = filters.search.trim().toLowerCase();
  const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null;

  return logs
    .filter((log) => {
      if (filters.emailFilter && log.email !== filters.emailFilter) return false;
      if (text) {
        const haystack =
          `${log.invoiceNumber || ''} ${log.nom} ${log.email} ${log.modification} ${log.explication} ${log.source}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      const ts = new Date(log.timestamp);
      if (from && ts < from) return false;
      if (to && ts > to) return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function undoLogEntry(
  log: UiLog,
  agent: { Nom?: string | null; email?: string | null } | null,
): Promise<void> {
  if (log.source === 'PAIEMENT' && log.paymentId) {
    const { error: deleteError } = await supabase.from('PAIEMENTS').delete().eq('id', log.paymentId);
    if (deleteError) throw deleteError;
    if (log.invoiceNumber) {
      const actor = buildLogActor(agent ?? undefined);
      await appendFactureLogByInvoiceNumber(
        log.invoiceNumber,
        actor,
        'Annulation paiement',
        `Paiement annulé depuis les LOGs (id: ${log.paymentId}).`,
      );
    }
    refreshLogs();
    return;
  }

  if ((log.source === 'FACTURE' || log.source === 'FACTURE FFG') && log.invoiceNumber) {
    const { data, error: fetchError } = await supabase
      .from('FACTURES')
      .select('"validation DR", "validation DOP", "Statut", updated_at')
      .eq('Numéro de facture', log.invoiceNumber)
      .single();
    if (fetchError) throw fetchError;

    const entries = parseFactureLogs(data?.updated_at);
    const last = entries[entries.length - 1];
    if (!last || last.timestamp !== log.timestamp) {
      throw new Error('Seule la dernière action de la facture peut être annulée.');
    }

    const updateData: Record<string, unknown> = {};
    const drValidated =
      data?.['validation DR'] != null && String(data?.['validation DR']).trim() !== '';
    const dopValidated =
      data?.['validation DOP'] != null && String(data?.['validation DOP']).trim() !== '';

    if (log.modification === 'Validation DR' || log.modification === 'Retrait validation DR') {
      updateData['validation DR'] = null;
      updateData['Statut'] = dopValidated ? 'Validée' : 'En attente validation DR';
    } else if (log.modification === 'Validation DOP' || log.modification === 'Retrait validation DOP') {
      updateData['validation DOP'] = null;
      updateData['Statut'] = drValidated ? 'En attente validation DOP' : 'En attente validation DR';
    } else if (log.modification === 'Rejet') {
      updateData['Statut'] = dopValidated
        ? 'Validée'
        : drValidated
          ? 'En attente validation DOP'
          : 'En attente validation DR';
    } else {
      throw new Error("Cette action n'est pas annulable depuis les LOGs.");
    }

    const actor = buildLogActor(agent ?? undefined);
    entries.push({
      timestamp: new Date().toISOString(),
      nom: actor.nom,
      email: actor.email,
      modification: 'Annulation',
      explication: `Annulation de l'action : ${log.modification}.`,
    });
    updateData.updated_at = JSON.stringify(entries);

    const { error: updateError } = await supabase
      .from('FACTURES')
      .update(updateData)
      .eq('Numéro de facture', log.invoiceNumber);
    if (updateError) throw updateError;
    refreshLogs();
    return;
  }

  throw new Error('Aucune annulation disponible pour cette ligne.');
}

export function exportLogsToCsv(logs: UiLog[]): void {
  const headers = [
    'Date et heure',
    'Source',
    'N° facture',
    'Nom',
    'Email',
    'Modification',
    'Explication',
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = logs.map((log) =>
    [
      log.timestamp,
      log.source,
      log.invoiceNumber || '',
      log.nom,
      log.email,
      log.modification,
      log.explication,
    ]
      .map(escape)
      .join(';'),
  );
  const csv = [headers.join(';'), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs_pmd_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

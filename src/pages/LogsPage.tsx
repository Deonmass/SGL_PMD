import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, RotateCcw } from 'lucide-react';
import { supabase } from '../services/supabase';
import { usePermission } from '../hooks/usePermission';
import AccessDenied from '../components/AccessDenied';
import { appendFactureLogByInvoiceNumber, buildLogActor, parseFactureLogs } from '../services/activityLogService';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';

type LogTab = 'facture' | 'facture-ffg' | 'paiement' | 'user';

interface LogsPageProps {
  menuTitle?: string;
}

interface UiLog {
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
}

const formatDateTime = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const EMPTY_ANIMATION_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120" viewBox="0 0 180 120">
  <rect x="24" y="22" width="132" height="82" rx="12" fill="#d7dee3" />
  <rect x="36" y="34" width="108" height="60" rx="8" fill="#f2f5f7" />
  <rect x="48" y="72" width="72" height="6" rx="3" fill="#c7d0d6" />
  <rect x="48" y="82" width="66" height="5" rx="2.5" fill="#d2d9de" />
  <circle cx="84" cy="56" r="3.2" fill="#8ea0ad" />
  <circle cx="104" cy="56" r="3.2" fill="#8ea0ad" />
  <path d="M83 65c3.2-3.6 7.6-3.6 10.8 0" stroke="#8ea0ad" stroke-width="2.5" fill="none" stroke-linecap="round" />
  <circle cx="124" cy="88" r="16" fill="none" stroke="#9fb1bd" stroke-width="6" />
  <path d="M136 100l12 12" stroke="#9fb1bd" stroke-width="6" stroke-linecap="round" />
</svg>`);

function LogsPage({ menuTitle = 'LOGs' }: LogsPageProps) {
  const { canView, hasPermission } = usePermission();
  const { success, error } = useToast();
  const { agent } = useAuth();
  const [activeTab, setActiveTab] = useState<LogTab>('facture');
  const [logs, setLogs] = useState<UiLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [undoingLogId, setUndoingLogId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const canAccess = canView('logs');
  const canUndo = hasPermission('logs', 'annuler');

  const loadLogs = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      if (activeTab === 'facture' || activeTab === 'facture-ffg') {
        const targetType = activeTab === 'facture' ? 'operationnel' : 'frais-generaux';
        const { data } = await supabase
          .from('FACTURES')
          .select('"Numéro de facture", "Type de facture", updated_at')
          .eq('Type de facture', targetType)
          .order('Date de réception', { ascending: false });

        const parsed: UiLog[] = [];
        (data || []).forEach((row: any, rowIndex: number) => {
          const invoiceNumber = String(row['Numéro de facture'] || '');
          const entries = parseFactureLogs(row.updated_at);
          entries.forEach((entry, idx) => {
            parsed.push({
              id: `${invoiceNumber}-${rowIndex}-${idx}`,
              timestamp: entry.timestamp,
              nom: entry.nom,
              email: entry.email,
              modification: entry.modification,
              explication: entry.explication,
              source: activeTab === 'facture' ? 'FACTURE' : 'FACTURE FFG',
              invoiceNumber,
              rawLogIndex: idx,
            });
          });
        });

        // Ajouter les suppressions persistées dans PAIEMENTS pour garder la trace
        const { data: deletionLogs } = await supabase
          .from('PAIEMENTS')
          .select('id, NumeroFacture, timestamp, paiedby, commentaires, modePaiement')
          .eq('typePaiement', 'log_suppression_facture')
          .eq('modePaiement', targetType)
          .order('timestamp', { ascending: false });

        (deletionLogs || []).forEach((row: any, idx: number) => {
          const email = String(row.paiedby || 'N/A');
          parsed.push({
            id: `suppression-${row.id || idx}`,
            timestamp: row.timestamp || new Date().toISOString(),
            nom: email.includes('@') ? email.split('@')[0] : 'Utilisateur',
            email,
            modification: 'Suppression',
            explication: String(row.commentaires || 'Facture supprimée.'),
            source: activeTab === 'facture' ? 'FACTURE' : 'FACTURE FFG',
            invoiceNumber: String(row.NumeroFacture || ''),
          });
        });
        setLogs(parsed);
        return;
      }

      if (activeTab === 'paiement') {
        const { data } = await supabase
          .from('PAIEMENTS')
          .select('id, NumeroFacture, timestamp, datePaiement, montantPaye, devise, modePaiement, referencePaiement, paiedby')
          .order('timestamp', { ascending: false });

        const parsed: UiLog[] = (data || []).map((row: any, index: number) => ({
          id: String(row.id || `paiement-${index}`),
          paymentId: String(row.id || ''),
          timestamp: row.timestamp || row.datePaiement || new Date().toISOString(),
          nom: row.paiedby ? String(row.paiedby).split('@')[0] : 'Utilisateur',
          email: row.paiedby || 'N/A',
          modification: 'Paiement',
          explication: `Paiement ${row.modePaiement || 'non précisé'} de ${row.montantPaye || 0} ${row.devise || 'USD'} (réf: ${row.referencePaiement || 'N/A'}).`,
          source: 'PAIEMENT',
          invoiceNumber: row.NumeroFacture || '',
        }));
        setLogs(parsed);
        return;
      }

      const { data } = await supabase
        .from('AGENTS')
        .select('ID, Nom, email, Role, REGION, Derniere_connexion, statut')
        .order('Derniere_connexion', { ascending: false });

      const parsed: UiLog[] = (data || [])
        .filter((row: any) => row.Derniere_connexion)
        .map((row: any) => ({
          id: `agent-${row.ID}-${row.Derniere_connexion}`,
          timestamp: row.Derniere_connexion,
          nom: row.Nom || 'Utilisateur',
          email: row.email || 'N/A',
          modification: 'Connexion',
          explication: `Dernière connexion enregistrée. Rôle: ${row.Role || 'N/A'}, Région: ${row.REGION || 'N/A'}, Statut: ${row.statut || 'N/A'}.`,
          source: 'USER',
        }));
      setLogs(parsed);
    } finally {
      setLoading(false);
    }
  }, [activeTab, canAccess]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleUndo = async (log: UiLog) => {
    if (!canUndo) return;
    setUndoingLogId(log.id);
    try {
      if (log.source === 'PAIEMENT' && log.paymentId) {
        const { error: deleteError } = await supabase.from('PAIEMENTS').delete().eq('id', log.paymentId);
        if (deleteError) throw deleteError;
        if (log.invoiceNumber) {
          const actor = buildLogActor(agent);
          await appendFactureLogByInvoiceNumber(
            log.invoiceNumber,
            actor,
            'Annulation paiement',
            `Paiement annulé depuis les LOGs (id: ${log.paymentId}).`
          );
        }
        success('Paiement annulé avec succès.');
        await loadLogs();
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
          throw new Error("Seule la dernière action de la facture peut être annulée.");
        }

        const updateData: Record<string, unknown> = {};
        const drValidated = data?.['validation DR'] != null && String(data?.['validation DR']).trim() !== '';
        const dopValidated = data?.['validation DOP'] != null && String(data?.['validation DOP']).trim() !== '';

        if (log.modification === 'Validation DR') {
          updateData['validation DR'] = null;
          updateData['Statut'] = dopValidated ? 'Validée' : 'En attente validation DR';
        } else if (log.modification === 'Validation DOP') {
          updateData['validation DOP'] = null;
          updateData['Statut'] = drValidated ? 'En attente validation DOP' : 'En attente validation DR';
        } else if (log.modification === 'Rejet') {
          updateData['Statut'] = dopValidated ? 'Validée' : drValidated ? 'En attente validation DOP' : 'En attente validation DR';
        } else {
          throw new Error("Cette action n'est pas annulable depuis les LOGs.");
        }

        const actor = buildLogActor(agent);
        entries.push({
          timestamp: new Date().toISOString(),
          nom: actor.nom,
          email: actor.email,
          modification: 'Annulation',
          explication: `Annulation de l'action: ${log.modification}.`,
        });
        updateData.updated_at = JSON.stringify(entries);

        const { error: updateError } = await supabase
          .from('FACTURES')
          .update(updateData)
          .eq('Numéro de facture', log.invoiceNumber);
        if (updateError) throw updateError;

        success('Action annulée avec succès.');
        await loadLogs();
        return;
      }

      throw new Error("Aucune annulation disponible pour cette ligne.");
    } catch (e) {
      error(`Annulation impossible: ${e instanceof Error ? e.message : 'Erreur inconnue'}`);
    } finally {
      setUndoingLogId(null);
    }
  };

  const emailOptions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.email).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const text = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return logs
      .filter((log) => {
        if (emailFilter && log.email !== emailFilter) return false;
        if (text) {
          const haystack = `${log.invoiceNumber || ''} ${log.nom} ${log.email} ${log.modification} ${log.explication}`.toLowerCase();
          if (!haystack.includes(text)) return false;
        }
        const ts = new Date(log.timestamp);
        if (from && ts < from) return false;
        if (to && ts > to) return false;
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [logs, search, emailFilter, dateFrom, dateTo]);

  if (!canAccess) {
    return <AccessDenied message="Vous n'avez pas accès aux LOGs." />;
  }

  const tabClass = (tab: LogTab) =>
    `px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
      activeTab === tab ? 'bg-white text-blue-700 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'
    }`;

  const getModificationBadgeClass = (modification: string) => {
    const text = (modification || '').toLowerCase();
    if (text.includes('validation')) return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    if (text.includes('rejet')) return 'bg-red-100 text-red-700 border border-red-200';
    if (text.includes('paiement')) return 'bg-blue-100 text-blue-700 border border-blue-200';
    if (text.includes('suppression')) return 'bg-rose-100 text-rose-700 border border-rose-200';
    if (text.includes('annulation')) return 'bg-amber-100 text-amber-700 border border-amber-200';
    if (text.includes('edition')) return 'bg-violet-100 text-violet-700 border border-violet-200';
    return 'bg-gray-100 text-gray-700 border border-gray-200';
  };

  return (
    <div className="bg-white min-h-screen">
      <div className="bg-gray-200 p-3 border-b">
        <h1 className="text-2xl font-bold text-gray-900">{menuTitle}</h1>
      </div>

      <div className="bg-gray-100 border-b px-3 pt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button className={tabClass('facture')} onClick={() => setActiveTab('facture')}>FACTURE</button>
          <button className={tabClass('facture-ffg')} onClick={() => setActiveTab('facture-ffg')}>FACTURE FFG</button>
          <button className={tabClass('paiement')} onClick={() => setActiveTab('paiement')}>PAIEMENT</button>
          <button className={tabClass('user')} onClick={() => setActiveTab('user')}>USER</button>
        </div>
      </div>

      <div className="p-3 border-b bg-white">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par facture, utilisateur, action, texte..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <select value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Tous les emails</option>
            {emailOptions.map((email) => (
              <option key={email} value={email}>{email}</option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <div className="flex items-center gap-2">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full" />
            <button
              onClick={() => {
                setSearch('');
                setEmailFilter('');
                setDateFrom('');
                setDateTo('');
              }}
              className="inline-flex items-center justify-center p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              title="Réinitialiser les filtres"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="text-sm text-gray-500 py-8 text-center">Chargement des logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-10 text-center">
            <img src={EMPTY_ANIMATION_SVG} alt="Aucune donnée" className="mx-auto w-40 h-auto animate-bounce" />
            <p className="mt-3 text-sm font-semibold text-gray-600">Aucune donnée trouvée pour cet onglet.</p>
            <p className="text-xs text-gray-500">Ajustez les filtres ou revenez après une nouvelle activité.</p>
          </div>
        ) : (
          <div className="overflow-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">Date et heure</th>
                  <th className="text-left px-3 py-2">Source</th>
                  <th className="text-left px-3 py-2">Facture</th>
                  <th className="text-left px-3 py-2">Nom</th>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">Modification</th>
                  <th className="text-left px-3 py-2">Explication</th>
                  <th className="text-left px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-t hover:bg-blue-50/40 hover:scale-[1.004] transition-transform duration-150 origin-center">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(log.timestamp)}</td>
                    <td className="px-3 py-2">{log.source}</td>
                    <td className="px-3 py-2">{log.invoiceNumber || '-'}</td>
                    <td className="px-3 py-2">{log.nom}</td>
                    <td className="px-3 py-2">{log.email}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-semibold ${getModificationBadgeClass(log.modification)}`}>
                        {log.modification}
                      </span>
                    </td>
                    <td className="px-3 py-2">{log.explication}</td>
                    <td className="px-3 py-2">
                      {canUndo && (log.source === 'PAIEMENT' || log.source === 'FACTURE' || log.source === 'FACTURE FFG') ? (
                        <button
                          onClick={() => handleUndo(log)}
                          disabled={undoingLogId === log.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <RotateCcw size={12} />
                          {undoingLogId === log.id ? 'Annulation...' : "Annuler l'action"}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default LogsPage;

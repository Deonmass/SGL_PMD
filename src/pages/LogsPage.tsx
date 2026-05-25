import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, RotateCcw, FileSpreadsheet } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import AccessDenied from '../components/AccessDenied';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { useDataRefresh, REFRESH_EVENTS } from '../hooks/useDataRefresh';
import {
  LOG_PERMISSION_KEY,
  LOG_TABS,
  isUndoableLogEntry,
  type LogTab,
} from '../constants/logsConfig';
import {
  exportLogsToCsv,
  fetchLogsForTab,
  filterUiLogs,
  undoLogEntry,
  type UiLog,
} from '../services/logsService';

interface LogsPageProps {
  menuTitle?: string;
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
  const { success, error: toastError } = useToast();
  const { agent } = useAuth();
  const [activeTab, setActiveTab] = useState<LogTab>('facture');
  const [logs, setLogs] = useState<UiLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [undoingLogId, setUndoingLogId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const canAccess = canView(LOG_PERMISSION_KEY);
  const canUndo = hasPermission(LOG_PERMISSION_KEY, 'annuler');
  const canExport = hasPermission(LOG_PERMISSION_KEY, 'exporter') || canAccess;

  const loadLogs = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const data = await fetchLogsForTab(activeTab);
      setLogs(data);
    } catch (e) {
      console.error(e);
      toastError('Impossible de charger les logs.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, canAccess, toastError]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useDataRefresh(REFRESH_EVENTS.LOGS, loadLogs);
  useDataRefresh(REFRESH_EVENTS.ALL, loadLogs);

  const handleUndo = async (log: UiLog) => {
    if (!canUndo) return;
    setUndoingLogId(log.id);
    try {
      await undoLogEntry(log, agent);
      success('Action annulée avec succès.');
      await loadLogs();
    } catch (e) {
      toastError(`Annulation impossible : ${e instanceof Error ? e.message : 'Erreur inconnue'}`);
    } finally {
      setUndoingLogId(null);
    }
  };

  const emailOptions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.email).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [logs],
  );

  const filteredLogs = useMemo(
    () => filterUiLogs(logs, { search, emailFilter, dateFrom, dateTo }),
    [logs, search, emailFilter, dateFrom, dateTo],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<LogTab, number> = {
      facture: 0,
      'facture-ffg': 0,
      paiement: 0,
      user: 0,
    };
    for (const tab of LOG_TABS) {
      if (tab.id === activeTab) counts[tab.id] = filteredLogs.length;
    }
    return counts;
  }, [activeTab, filteredLogs.length]);

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
    if (text.includes('edition') || text.includes('ajout') || text.includes('création'))
      return 'bg-violet-100 text-violet-700 border border-violet-200';
    if (text.includes('connexion')) return 'bg-slate-100 text-slate-700 border border-slate-200';
    return 'bg-gray-100 text-gray-700 border border-gray-200';
  };

  const resetFilters = () => {
    setSearch('');
    setEmailFilter('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="bg-white min-h-screen flex flex-col">
      <div className="bg-gray-200 p-3 border-b flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{menuTitle}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-400 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
          {canExport && (
            <button
              type="button"
              onClick={() => exportLogsToCsv(filteredLogs)}
              disabled={loading || filteredLogs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-emerald-300 rounded-md bg-white text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
            >
              <FileSpreadsheet size={16} />
              Exporter CSV
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-100 border-b px-3 pt-2">
        <div className="flex items-center gap-2 flex-wrap">
          {LOG_TABS.map((tab) => (
            <button key={tab.id} type="button" className={tabClass(tab.id)} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
              {activeTab === tab.id && (
                <span className="ml-1.5 text-xs font-normal text-gray-500">({tabCounts[tab.id]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 border-b bg-white">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° facture, n° dossier, fournisseur, client, action, texte…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <select
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Tous les emails</option>
            {emailOptions.map((email) => (
              <option key={email} value={email}>
                {email}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            title="Date du"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full"
              title="Date au"
            />
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center justify-center p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              title="Réinitialiser les filtres"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3" />
              <p className="text-sm text-gray-600">Chargement des logs…</p>
            </div>
          </div>
        )}

        {!loading && filteredLogs.length === 0 ? (
          <div className="py-10 text-center">
            <img src={EMPTY_ANIMATION_SVG} alt="Aucune donnée" className="mx-auto w-40 h-auto animate-bounce" />
            <p className="mt-3 text-sm font-semibold text-gray-600">Aucune donnée trouvée pour cet onglet.</p>
            <p className="text-xs text-gray-500">Ajustez les filtres ou revenez après une nouvelle activité.</p>
          </div>
        ) : (
          <div className="overflow-auto border rounded-lg max-h-[calc(100vh-14rem)]">
            <table className={`w-full text-xs ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-900">Date et heure</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-900">Source</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-900 max-w-[8rem] whitespace-normal">
                    N° facture
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-900">Nom</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-900">Email</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-900">Modification</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-900 min-w-[12rem]">Explication</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-900 w-[7rem]">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-t hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(log.timestamp)}</td>
                    <td className="px-3 py-2">{log.source}</td>
                    <td className="px-3 py-2 whitespace-normal break-all text-blue-700 font-medium">
                      {log.invoiceNumber || '—'}
                    </td>
                    <td className="px-3 py-2">{log.nom}</td>
                    <td className="px-3 py-2">{log.email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full font-semibold ${getModificationBadgeClass(log.modification)}`}
                      >
                        {log.modification}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-normal break-words">{log.explication}</td>
                    <td className="px-3 py-2">
                      {isUndoableLogEntry(log, canUndo) ? (
                        <button
                          type="button"
                          onClick={() => handleUndo(log)}
                          disabled={undoingLogId === log.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <RotateCcw size={12} />
                          {undoingLogId === log.id ? '…' : 'Annuler'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
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

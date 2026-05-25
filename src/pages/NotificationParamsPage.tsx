import { useCallback, useEffect, useState } from 'react';
import { Bell, RefreshCw, Save } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import AccessDenied from '../components/AccessDenied';
import { useToast } from '../hooks/useToast';
import {
  NOTIFICATION_PARAMS_MODULE,
  NOTIFICATION_RECIPIENT_GROUPS,
  NOTIFICATION_RECIPIENT_KEYS,
  NOTIFICATION_TRIGGERS,
  buildDefaultNotificationMatrix,
  buildEmptyNotificationMatrix,
} from '../constants/notificationConfig';
import {
  fetchNotificationParams,
  saveNotificationParams,
  type NotificationParamsMatrix,
} from '../services/notificationParamsService';

interface NotificationParamsPageProps {
  menuTitle?: string;
}

const flatColumns = NOTIFICATION_RECIPIENT_GROUPS.flatMap((g) => g.columns);

function NotificationParamsPage({ menuTitle = 'Notifications' }: NotificationParamsPageProps) {
  const { canView, canEdit } = usePermission();
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState<number | null>(null);
  const [matrix, setMatrix] = useState<NotificationParamsMatrix>(() => buildEmptyNotificationMatrix());

  const canAccessNotifications = canView('notifications') || canView('utilisateurs');
  const canEditNotifications =
    canEdit('notifications') || (canEdit('utilisateurs') && canView('utilisateurs'));
  const canAccess = canAccessNotifications;
  const canSave = canEditNotifications;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rowId: id, data } = await fetchNotificationParams(NOTIFICATION_PARAMS_MODULE);
      setRowId(id);
      setMatrix(data.matrix);
    } catch (err) {
      console.error(err);
      toastError('Impossible de charger les paramètres de notification.');
      setMatrix(buildEmptyNotificationMatrix());
      setRowId(null);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    if (canAccess) load();
  }, [canAccess, load]);

  const isEnabled = (triggerId: string, roleKey: string): boolean => {
    const row = matrix[triggerId];
    if (!row || !(roleKey in row)) return false;
    return row[roleKey] === true;
  };

  const toggleCell = (triggerId: string, roleKey: string) => {
    if (!canSave || loading) return;
    setMatrix((prev) => {
      const row = { ...(prev[triggerId] || {}) };
      row[roleKey] = !isEnabled(triggerId, roleKey);
      return { ...prev, [triggerId]: row };
    });
  };

  const setRowAll = (triggerId: string, enabled: boolean) => {
    if (!canSave || loading) return;
    setMatrix((prev) => {
      const row = { ...(prev[triggerId] || {}) };
      for (const rk of NOTIFICATION_RECIPIENT_KEYS) row[rk] = enabled;
      return { ...prev, [triggerId]: row };
    });
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveNotificationParams(matrix, rowId, NOTIFICATION_PARAMS_MODULE);
      toastSuccess('Paramètres de notification enregistrés.');
      await load();
    } catch (err) {
      console.error(err);
      toastError('Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (!canSave || loading) return;
    if (!window.confirm('Activer tous les destinataires pour chaque déclencheur ?')) return;
    setMatrix(buildDefaultNotificationMatrix());
  };

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <div className="bg-white min-h-screen flex flex-col">
      <div className="bg-gray-200 p-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell size={24} className="text-blue-700" />
          {menuTitle}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading || saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-400 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
          {canSave && (
            <>
              <button
                type="button"
                onClick={handleResetDefaults}
                disabled={loading || saving}
                className="px-3 py-1.5 text-sm border border-gray-400 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Tout activer
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4 relative">
        {loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3" />
              <p className="text-sm text-gray-600">Chargement des paramètres…</p>
            </div>
          </div>
        )}

        <div className="border border-gray-300 rounded-lg shadow-sm h-full max-h-[calc(100vh-8rem)] overflow-auto">
          <table className="w-full text-sm border-collapse table-auto">
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-700 text-white text-xs uppercase tracking-wide shadow-sm">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-40 bg-slate-700 text-left px-4 py-3 align-bottom border-r border-slate-500 min-w-[260px]"
                >
                  Déclencheur
                </th>
                {NOTIFICATION_RECIPIENT_GROUPS.map((group) => (
                  <th
                    key={group.id}
                    colSpan={group.columns.length}
                    className="sticky top-0 bg-slate-700 px-3 py-2 text-center border-l border-slate-500 font-semibold normal-case tracking-normal text-[13px]"
                  >
                    {group.label}
                  </th>
                ))}
                {canSave && (
                  <th
                    rowSpan={2}
                    className="sticky top-0 z-40 bg-slate-700 px-3 py-3 text-center align-bottom border-l border-slate-500 min-w-[100px]"
                  >
                    Actions
                  </th>
                )}
              </tr>
              <tr className="bg-slate-800 text-white shadow-sm">
                {flatColumns.map((col) => (
                  <th
                    key={col.key}
                    className="bg-slate-800 px-3 py-2.5 text-center border-l border-slate-600 min-w-[130px] whitespace-normal"
                  >
                    <span className="text-[13px] font-semibold leading-snug">{col.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-40 pointer-events-none' : ''}>
              {NOTIFICATION_TRIGGERS.map((trigger, idx) => (
                <tr key={trigger.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="sticky left-0 z-20 bg-inherit border-r border-gray-200 px-4 py-3 align-top">
                    <div className="font-semibold text-gray-900 text-[15px] leading-snug">
                      {trigger.label}
                    </div>
                    <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                      {trigger.description}
                    </div>
                  </td>
                  {flatColumns.map((col) => {
                    const on = isEnabled(trigger.id, col.key);
                    return (
                      <td
                        key={col.key}
                        className="text-center border-l border-gray-200 px-2 py-3 align-middle"
                      >
                        <button
                          type="button"
                          disabled={!canSave || loading}
                          onClick={() => toggleCell(trigger.id, col.key)}
                          className={`w-11 h-6 rounded-full transition-colors relative mx-auto block ${
                            on ? 'bg-emerald-500' : 'bg-gray-300'
                          } ${!canSave || loading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:opacity-90'}`}
                          title={`${on ? 'Désactiver' : 'Activer'} : ${col.label}`}
                          aria-pressed={on}
                          aria-label={`${col.label} — ${trigger.label}`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                              on ? 'left-[22px]' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </td>
                    );
                  })}
                  {canSave && (
                    <td className="border-l border-gray-200 px-2 py-2 text-center whitespace-nowrap align-middle">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setRowAll(trigger.id, true)}
                        className="text-xs text-blue-700 hover:underline mr-2 disabled:opacity-50"
                      >
                        Tout
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setRowAll(trigger.id, false)}
                        className="text-xs text-gray-600 hover:underline disabled:opacity-50"
                      >
                        Aucun
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!canSave && !loading && (
          <p className="text-sm text-amber-700 mt-3">
            Accès en lecture seule. La modification nécessite la permission « modifier » sur
            Notifications (ou Utilisateurs).
          </p>
        )}
      </div>
    </div>
  );
}

export default NotificationParamsPage;

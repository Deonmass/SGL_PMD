import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Wallet,
  ArrowDownLeft,
  FileText,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import AccessDenied from '../components/AccessDenied';
import StatCard from '../components/StatCard';
import ViewInvoiceModal from '../components/ViewInvoiceModal';
import ChargeProvisionApproModal from '../components/modals/ChargeProvisionApproModal';
import { usePermission } from '../hooks/usePermission';
import { formatMoney as formatMoneyUsd } from '../utils/formatters';
import { Invoice as GlobalInvoice } from '../types';
import {
  chargeProvisionService,
  fetchInvoiceForView,
  getApproReference,
  type ChargeProvisionRow,
  type ChargeProvisionSummary,
} from '../services/chargeProvisionService';

interface ChargeProvisionPageProps {
  menuTitle?: string;
}

const formatUsd = (value: number) => formatMoneyUsd(value, 'USD', 'en-US');

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
}

function ChargeProvisionPage({ menuTitle = 'Charges provisionnées' }: ChargeProvisionPageProps) {
  const { canView, canCreate } = usePermission();
  const [summaries, setSummaries] = useState<ChargeProvisionSummary[]>([]);
  const [movements, setMovements] = useState<ChargeProvisionRow[]>([]);
  const [selectedCharge, setSelectedCharge] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showApproModal, setShowApproModal] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<GlobalInvoice | null>(null);
  const [openingInvoice, setOpeningInvoice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await chargeProvisionService.getSummaries();
      setSummaries(list);
      setSelectedCharge((prev) => {
        if (list.length === 0) return null;
        if (prev && list.some((s) => s.charge === prev)) return prev;
        return list[0].charge;
      });
    } catch (err) {
      console.error(err);
      setError('Erreur lors du chargement des provisions.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMovements = useCallback(async (charge: string) => {
    try {
      const rows = await chargeProvisionService.getMovementsByCharge(charge);
      setMovements(rows);
    } catch (err) {
      console.error(err);
      setError('Erreur lors du chargement des mouvements.');
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedCharge) {
      void loadMovements(selectedCharge);
    } else {
      setMovements([]);
    }
  }, [selectedCharge, loadMovements]);

  const selectedSummary = useMemo(
    () => summaries.find((s) => s.charge === selectedCharge) ?? null,
    [summaries, selectedCharge],
  );

  const sorties = useMemo(
    () => movements.filter((m) => m.Type_operation === 'out'),
    [movements],
  );

  const appros = useMemo(
    () => movements.filter((m) => m.Type_operation === 'in'),
    [movements],
  );

  const totals = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const m of movements) {
      if (m.Type_operation === 'in') totalIn += m.Montant;
      else totalOut += m.Montant;
    }
    return { totalIn, totalOut, solde: totalIn - totalOut };
  }, [movements]);

  const soldeByMovementId = useMemo(() => {
    const chronological = [...movements].sort((a, b) => {
      const dateA = new Date(a.Date_operation).getTime();
      const dateB = new Date(b.Date_operation).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.ID - b.ID;
    });
    const map = new Map<number, number>();
    let running = 0;
    for (const m of chronological) {
      if (m.Type_operation === 'in') running += m.Montant;
      else running -= m.Montant;
      map.set(m.ID, running);
    }
    return map;
  }, [movements]);

  const displayTotalIn = movements.length > 0 ? totals.totalIn : (selectedSummary?.totalIn ?? 0);
  const displayTotalOut = movements.length > 0 ? totals.totalOut : (selectedSummary?.totalOut ?? 0);
  const currentSolde = displayTotalIn - displayTotalOut;

  const handleViewInvoice = async (invoiceNumber: string | null) => {
    if (!invoiceNumber?.trim()) return;
    setOpeningInvoice(invoiceNumber);
    setError('');
    try {
      const inv = await fetchInvoiceForView(invoiceNumber);
      if (!inv) {
        setError(`Facture introuvable : ${invoiceNumber}`);
        return;
      }
      setViewInvoice(inv);
    } catch (err) {
      console.error(err);
      setError('Impossible d\'ouvrir la facture.');
    } finally {
      setOpeningInvoice(null);
    }
  };

  if (!canView('charges')) {
    return <AccessDenied message="Vous n'avez pas accès aux charges provisionnées." />;
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50/80">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 p-6 pb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{menuTitle}</h1>
            <p className="mt-1 text-sm text-gray-600">
              Suivi des approvisionnements et sorties liées aux charges en abonnement
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-3 py-2 text-sm font-medium text-white shadow-md transition hover:from-green-600 hover:to-green-700"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Actualiser
            </button>
            {canCreate('charges') && selectedCharge && (
              <button
                type="button"
                onClick={() => setShowApproModal(true)}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:from-blue-600 hover:to-blue-700"
              >
                <Plus size={16} />
                Nouvel appro
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-6 pt-4">
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-md">
          <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Charges abonnement</p>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {loading && summaries.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-gray-500">Chargement…</p>
            ) : summaries.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-gray-500">
                Aucune charge avec abonnement OUI. Configurez-les dans Types de charges.
              </p>
            ) : (
              summaries.map((item) => {
                const selected = selectedCharge === item.charge;
                return (
                  <button
                    key={item.charge}
                    type="button"
                    onClick={() => setSelectedCharge(item.charge)}
                    className={`group w-full rounded-2xl border p-3 text-left transition-all duration-300 ${
                      selected
                        ? 'border-indigo-500 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg scale-[1.02]'
                        : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-gradient-to-br hover:from-indigo-400 hover:to-purple-500 hover:text-white hover:shadow-lg hover:scale-[1.02]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Wallet
                        size={18}
                        className={selected ? 'text-white/90' : 'text-gray-500 group-hover:text-white/90'}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.charge}</p>
                        <p className={`mt-1 text-xs ${selected ? 'text-white/85' : 'text-gray-600 group-hover:text-white/85'}`}>
                          Solde :{' '}
                          <span className="font-bold tabular-nums">
                            {formatUsd(item.solde)}
                          </span>
                        </p>
                        <p className={`mt-0.5 text-[11px] ${selected ? 'text-white/70' : 'text-gray-500 group-hover:text-white/70'}`}>
                          {item.movementCount} mouvement{item.movementCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-md">
          {!selectedCharge ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
              Sélectionnez une charge pour afficher ses mouvements.
            </div>
          ) : (
            <>
              <div className="border-b border-gray-100 px-6 py-5">
                <p className="mb-4 text-lg font-bold text-gray-900">{selectedCharge}</p>
                <div className="grid w-full grid-cols-3 gap-4">
                  <StatCard
                    label="Solde actuel"
                    value={currentSolde}
                    currency="USD"
                    bgColor={
                      currentSolde < 0
                        ? 'bg-gradient-to-br from-red-600 to-red-700'
                        : 'bg-gradient-to-br from-indigo-500 to-indigo-600'
                    }
                    textColor="text-white"
                    variant="compact"
                    icon="trending"
                    compactAmountSize="reduced"
                  />
                  <StatCard
                    label="Total appros"
                    value={displayTotalIn}
                    currency="USD"
                    bgColor="bg-gradient-to-br from-emerald-500 to-green-600"
                    textColor="text-white"
                    variant="compact"
                    icon="trending"
                    compactAmountSize="reduced"
                  />
                  <StatCard
                    label="Total sorties"
                    value={displayTotalOut}
                    currency="USD"
                    bgColor="bg-gradient-to-br from-amber-500 to-orange-600"
                    textColor="text-white"
                    variant="compact"
                    icon="alert"
                    compactAmountSize="reduced"
                  />
                </div>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-hidden p-4">
                <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/90 to-white shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3">
                    <div className="flex items-center gap-2 text-white">
                      <TrendingUp size={18} />
                      <h3 className="text-sm font-bold">Sorties (factures)</h3>
                    </div>
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white">
                      {sorties.length}
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-amber-50/95 backdrop-blur-sm">
                        <tr className="border-b border-amber-100">
                          <th className="px-3 py-2.5 text-left font-semibold text-amber-950">Date</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-amber-950">N° facture</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-amber-950">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorties.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-10 text-center text-gray-500">
                              <FileText className="mx-auto mb-2 text-amber-300" size={28} />
                              Aucune sortie
                            </td>
                          </tr>
                        ) : (
                          sorties.map((row) => {
                            const invoiceNum = row.Numero_facture?.trim() || '';
                            return (
                              <tr
                                key={row.ID}
                                className="border-b border-amber-100/80 transition hover:bg-amber-100/50"
                              >
                                <td className="px-3 py-2.5 text-gray-800">{formatDate(row.Date_operation)}</td>
                                <td className="px-3 py-2.5">
                                  {invoiceNum ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleViewInvoice(invoiceNum)}
                                      disabled={openingInvoice === invoiceNum}
                                      className="text-left font-semibold text-amber-900 underline decoration-amber-400/80 hover:text-orange-800 disabled:opacity-50"
                                    >
                                      {invoiceNum}
                                    </button>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-amber-900">
                                  −{formatUsd(row.Montant)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-emerald-200/60 bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-3">
                    <div className="flex items-center gap-2 text-white">
                      <TrendingDown size={18} />
                      <h3 className="text-sm font-bold">Approvisionnements</h3>
                    </div>
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white">
                      {appros.length}
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-emerald-50/95 backdrop-blur-sm">
                        <tr className="border-b border-emerald-100">
                          <th className="px-3 py-2.5 text-left font-semibold text-emerald-950">Date</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-emerald-950">Référence</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-emerald-950">Montant</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-emerald-950">Solde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appros.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                              <ArrowDownLeft className="mx-auto mb-2 text-emerald-300" size={28} />
                              Aucun approvisionnement
                            </td>
                          </tr>
                        ) : (
                          appros.map((row) => (
                            <tr
                              key={row.ID}
                              className="border-b border-emerald-100/80 transition hover:bg-emerald-100/40"
                            >
                              <td className="px-3 py-2.5 text-gray-800">{formatDate(row.Date_operation)}</td>
                              <td className="px-3 py-2.5">
                                <span className="inline-flex rounded-md bg-emerald-100/90 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/80">
                                  {getApproReference(row)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold tabular-nums text-emerald-800">
                                +{formatUsd(row.Montant)}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-800">
                                {formatUsd(soldeByMovementId.get(row.ID) ?? 0)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </>
          )}
        </main>
      </div>

      {selectedCharge && (
        <ChargeProvisionApproModal
          isOpen={showApproModal}
          charge={selectedCharge}
          onClose={() => setShowApproModal(false)}
          onSaved={() => {
            void loadData();
            void loadMovements(selectedCharge);
          }}
        />
      )}

      {viewInvoice && (
        <ViewInvoiceModal invoice={viewInvoice} onClose={() => setViewInvoice(null)} />
      )}
    </div>
  );
}

export default ChargeProvisionPage;

import { X, Maximize2, FileText, RefreshCw } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatCurrency } from '../utils/formatters';
import { dashboardService, type Invoice } from '../services/tableService';
import ViewInvoiceModal from './ViewInvoiceModal';
import PaiementModal from './PaiementModal';
import { useAuth } from '../contexts/AuthContext';
import { Invoice as AppInvoice } from '../types';

interface Top10SuppliersModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Array<{
    fournisseur: string;
    nombreFactures: number;
    montantNonPaye: number;
  }>;
  loading?: boolean;
  year?: string;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Capture du modal → PDF une page (A4 paysage), retourne le Blob. */
async function buildModalPdfBlob(el: HTMLElement): Promise<Blob> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const canvas = await html2canvas(el, {
    scale: 1.35,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    ignoreElements: (node) =>
      node instanceof Element && node.closest('[data-modal-chrome]') !== null,
  });
  const pdf = await PDFDocument.create();
  const pngBytes = dataUrlToUint8Array(canvas.toDataURL('image/png', 1.0));
  const png = await pdf.embedPng(pngBytes);
  const pageW = 841.89;
  const pageH = 595.28;
  const page = pdf.addPage([pageW, pageH]);
  const scale = Math.min(pageW / png.width, pageH / png.height) * 0.98;
  const dw = png.width * scale;
  const dh = png.height * scale;
  const x = (pageW - dw) / 2;
  const y = (pageH - dh) / 2;
  page.drawImage(png, { x, y, width: dw, height: dh });
  const bytes = await pdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

/** Capture du conteneur → une seule page PDF téléchargée. */
async function exportElementToSinglePagePdf(el: HTMLElement, downloadFileName: string): Promise<void> {
  const blob = await buildModalPdfBlob(el);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadFileName.endsWith('.pdf') ? downloadFileName : `${downloadFileName}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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

function Top10SuppliersModal({
  isOpen,
  onClose,
  suppliers,
  loading = false,
  year = '2026',
}: Top10SuppliersModalProps) {
  const { agent } = useAuth();
  
  // Initialiser activeRegion basé sur la région de l'agent
  const getInitialRegion = (): 'all' | 'OUEST' | 'EST' | 'SUD' => {
    if (agent?.REGION && agent.REGION !== 'TOUT') {
      return agent.REGION as 'all' | 'OUEST' | 'EST' | 'SUD';
    }
    return 'all';
  };

  const [activeRegion, setActiveRegion] = useState<'all' | 'OUEST' | 'EST' | 'SUD'>(getInitialRegion());
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [suppliersData, setSuppliersData] = useState<typeof suppliers>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Invoice[]>([]);
  const [showSupplierInvoicesInChart, setShowSupplierInvoicesInChart] = useState(false);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<AppInvoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<AppInvoice | null>(null);
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [exportPdfBusy, setExportPdfBusy] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const months = [
    { value: 'all', label: 'Tous les mois' },
    { value: '01', label: 'Janvier' },
    { value: '02', label: 'Février' },
    { value: '03', label: 'Mars' },
    { value: '04', label: 'Avril' },
    { value: '05', label: 'Mai' },
    { value: '06', label: 'Juin' },
    { value: '07', label: 'Juillet' },
    { value: '08', label: 'Août' },
    { value: '09', label: 'Septembre' },
    { value: '10', label: 'Octobre' },
    { value: '11', label: 'Novembre' },
    { value: '12', label: 'Décembre' }
  ];

  const regions: Array<'all' | 'OUEST' | 'EST' | 'SUD'> = ['all', 'OUEST', 'EST', 'SUD'];
  const regionLabels: Record<'all' | 'OUEST' | 'EST' | 'SUD', string> = {
    all: 'Toutes',
    OUEST: 'Ouest',
    EST: 'Est',
    SUD: 'Sud'
  };

  useEffect(() => {
    if (isOpen && year) {
      setSelectedYear(year);
    }
  }, [isOpen, year]);

  // Force region to agent's region if they don't have TOUT access
  useEffect(() => {
    if (agent?.REGION && agent.REGION !== 'TOUT') {
      setActiveRegion(agent.REGION as 'all' | 'OUEST' | 'EST' | 'SUD');
    }
  }, [agent?.REGION]);

  useEffect(() => {
    if (isOpen) {
      loadAllSuppliers();
    }
  }, [isOpen, activeRegion, selectedYear, selectedMonth]);

  const loadAllSuppliers = async () => {
    setDataLoading(true);
    try {
      const region = activeRegion === 'all' ? undefined : activeRegion;
      const data = await dashboardService.getTop10SuppliersWithUnpaidInvoices(selectedYear, region, selectedMonth);
      
      // Trier par montant décroissant
      const sorted = [...(data || [])].sort((a, b) => b.montantNonPaye - a.montantNonPaye);
      setSuppliersData(sorted);
    } catch (err) {
      console.error('Erreur lors du chargement des fournisseurs:', err);
      setSuppliersData([]);
    } finally {
      setDataLoading(false);
    }
  };

  const handleSupplierClick = async (supplier: string) => {
    setSupplierLoading(true);
    try {
      // Get all invoices for this supplier from all statuses
      const region = activeRegion === 'all' ? undefined : activeRegion;
      const [nonPayee, bonAPayer, payee, partiellementPayee, echue, rejetee] = await Promise.all([
        dashboardService.getNonPayeeInvoices(selectedYear, region),
        dashboardService.getBonAPayerInvoices(selectedYear, region),
        dashboardService.getPayeeInvoices(selectedYear, region),
        dashboardService.getPartiellementPayeeInvoices(selectedYear, region),
        dashboardService.getOverdueInvoices(selectedYear, region),
        dashboardService.getRejeteesInvoices(selectedYear, region),
      ]);
      
      let invoices = [...nonPayee, ...bonAPayer, ...payee, ...partiellementPayee, ...echue, ...rejetee] as Invoice[];
      
      // Filter by supplier
      let filtered = invoices.filter(inv => inv.Fournisseur === supplier);
      
      // Filter by region if selected
      if (activeRegion !== 'all') {
        filtered = filtered.filter(inv => inv['Région'] === activeRegion);
      }
      
      // Filter by selected month if needed
      if (selectedMonth !== 'all') {
        filtered = filtered.filter((inv: any) => {
          const dateValue = inv['Date de réception'];
          if (!dateValue) return false;
          const month = String(new Date(dateValue).getMonth() + 1).padStart(2, '0');
          return month === selectedMonth;
        });
      }

      // Remove duplicates
      const seen = new Set();
      filtered = filtered.filter((inv) => {
        const key = inv['Numéro de facture'];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      
      setSelectedSupplier(supplier);
      setSelectedInvoices(filtered);
      setShowSupplierInvoicesInChart(true);
    } catch (err) {
      console.error('Erreur lors du chargement des factures:', err);
    } finally {
      setSupplierLoading(false);
    }
  };

  const handleInvoiceClick = (invoiceNumber: string) => {
    const normalized = String(invoiceNumber || '').trim();
    if (!normalized) return;

    const matched = selectedInvoices.find((inv: any) => {
      const currentNumber = String(inv['Numéro de facture'] || inv.invoiceNumber || '').trim();
      return currentNumber === normalized;
    });

    if (!matched) return;

    const statut = String((matched as any)['Statut'] || '').toLowerCase();
    const isPaid = statut.includes('pay');

    const invoiceForModal: AppInvoice = {
      id: Number((matched as any).ID || 0),
      invoiceNumber: String((matched as any)['Numéro de facture'] || ''),
      supplier: String((matched as any).Fournisseur || ''),
      receptionDate: String((matched as any)['Date de réception'] || ''),
      amount: Number((matched as any).Montant || 0),
      currency: ((matched as any).Devise || 'USD') as 'USD' | 'CDF' | 'EUR',
      chargeCategory: String((matched as any)['Catégorie de charge'] || ''),
      urgencyLevel: (String((matched as any)['Niveau urgence'] || 'Normal').toLowerCase().includes('urgent')
        ? 'Haute'
        : String((matched as any)['Niveau urgence'] || '').toLowerCase().includes('prior')
        ? 'Moyenne'
        : 'Basse') as 'Basse' | 'Moyenne' | 'Haute',
      status: (isPaid ? 'paid' : 'pending') as 'pending' | 'validated' | 'paid' | 'rejected' | 'overdue' | 'bon-a-payer',
      region: ((matched as any)['Région'] || 'OUEST') as 'OUEST' | 'SUD' | 'EST' | 'NORD',
      dueDate: String((matched as any)['Échéance'] || ''),
      paymentMode: String((matched as any)['Mode de paiement requis'] || ''),
      attachedInvoiceUrl: String((matched as any)['Facture attachée'] || ''),
      fileNumber: String((matched as any)['Numéro de dossier'] || ''),
      motif: String((matched as any)['Motif / Description'] || ''),
      comments: String((matched as any)['Commentaires'] || ''),
    };

    if (isPaid) {
      setPaymentInvoice(invoiceForModal);
    } else {
      setViewInvoice(invoiceForModal);
    }
  };

  const handleExportPdf = async () => {
    if (!modalRef.current) return;
    setExportPdfBusy(true);
    try {
      const regionPart = String(regionLabels[activeRegion] || 'region')
        .replace(/[^\w.-]+/g, '_')
        .slice(0, 24);
      const fname = `Top10_Fournisseurs_${selectedYear}_${regionPart}_${new Date().toISOString().slice(0, 10)}.pdf`;
      await exportElementToSinglePagePdf(modalRef.current, fname);
    } catch (err) {
      console.error('Export PDF Top 10:', err);
      alert(`Export PDF impossible : ${err instanceof Error ? err.message : 'erreur inconnue'}`);
    } finally {
      setExportPdfBusy(false);
    }
  };

  const getFilteredSuppliers = (data: typeof suppliers) => {
    return [...data].sort((a, b) => b.montantNonPaye - a.montantNonPaye).slice(0, 10);
  };

  const currentSuppliers = getFilteredSuppliers(suppliersData);
  const currentLoading = dataLoading;

  const topSuppliersChartData = currentSuppliers.map((s, idx) => ({
    /** Clé unique pour Recharts (évite collisions si noms tronqués identiques). */
    name: `sup-${idx}`,
    tickLabel:
      s.fournisseur.length > 16 ? `${s.fournisseur.slice(0, 15)}…` : s.fournisseur,
    fullName: s.fournisseur,
    nombreFactures: s.nombreFactures,
    montant: Math.round(s.montantNonPaye * 100) / 100,
  }));

  const receptionTimeMs = (invoice: Record<string, unknown>): number => {
    const raw = String(invoice['Date de réception'] ?? invoice.receptionDate ?? '');
    const t = new Date(raw);
    return Number.isNaN(t.getTime()) ? Number.POSITIVE_INFINITY : t.getTime();
  };

  const supplierInvoicesChartData = [...selectedInvoices]
    .sort((a, b) => receptionTimeMs(a as Record<string, unknown>) - receptionTimeMs(b as Record<string, unknown>))
    .map((invoice: Record<string, unknown>, idx: number) => {
      const invoiceNumber = String(invoice['Numéro de facture'] || invoice.invoiceNumber || '').trim();
      const receptionDate = String(invoice['Date de réception'] || invoice.receptionDate || '');
      const amount = Number(invoice.Montant ?? invoice.amount ?? 0) || 0;
      return {
        name: `inv-${idx}-${invoiceNumber || 'x'}`,
        tickLabel: invoiceNumber || '—',
        fullName: invoiceNumber || 'Facture',
        nombreFactures: 1,
        montant: Math.round(amount * 100) / 100,
        receptionDate,
      };
    });

  const displayedChartData = showSupplierInvoicesInChart && selectedSupplier
    ? supplierInvoicesChartData
    : topSuppliersChartData;

  const calculateTopSuppliersPercentage = () => {
    if (currentSuppliers.length === 0) return 0;
    const topThreeAmount = currentSuppliers.slice(0, 3).reduce((sum, s) => sum + s.montantNonPaye, 0);
    const totalAmount = currentSuppliers.reduce((sum, s) => sum + s.montantNonPaye, 0);
    return totalAmount > 0 ? Math.round((topThreeAmount / totalAmount) * 100) : 0;
  };

  return (
    <>
      {isOpen && (
        <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 print:bg-transparent print:p-0 ${isFullScreen ? 'fixed inset-0' : ''}`}>
          <div 
            ref={modalRef}
            className={`bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col print:rounded-none print:shadow-none print:max-w-none print:max-h-none ${
              isFullScreen 
                ? 'fixed inset-4 max-w-none' 
                : 'max-w-6xl w-full mx-4 h-[85vh]'
            }`}
          >
            {/* Header */}
            <div className="bg-gray-200 border-b p-3 shadow-md flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">
                Top 10 Fournisseurs
              </h2>
              <div className="flex items-center gap-1.5" data-modal-chrome>
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  disabled={exportPdfBusy}
                  className="inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-gray-600 transition hover:bg-red-50 hover:text-red-800 disabled:pointer-events-none disabled:opacity-40"
                  title="Exporter le contenu du modal en PDF (une page)"
                  aria-label="Exporter en PDF"
                >
                  {exportPdfBusy ? (
                    <RefreshCw size={18} className="animate-spin text-red-600" />
                  ) : (
                    <span className="inline-flex items-center gap-0.5 rounded-md border border-red-700/30 bg-red-50 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-red-800">
                      <FileText size={14} strokeWidth={2.25} className="shrink-0 text-red-700" aria-hidden />
                      PDF
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-2 text-gray-600 hover:text-white hover:bg-red-500 rounded-full transition-all duration-200"
                  title="Plein écran"
                >
                  <Maximize2 size={18} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-gray-600 hover:text-white hover:bg-red-500 rounded-full transition-all duration-200"
                  title="Fermer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Tabs - Regions */}
            <div className="flex bg-gray-100 border-b items-center px-4">
              <div className="flex gap-1">
                {(() => {
                  // Si l'utilisateur a TOUT, afficher tous les onglets
                  if (agent?.REGION === 'TOUT') {
                    return regions.map((region) => (
                      <button
                        key={region}
                        onClick={() => setActiveRegion(region)}
                        className={`px-4 py-2 text-xs font-medium transition-all duration-150 ease-out ${
                          activeRegion === region
                            ? 'bg-white text-gray-900 border-b-2 border-red-500'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {regionLabels[region]}
                      </button>
                    ));
                  } else {
                    // Sinon, afficher uniquement l'onglet de la région de l'utilisateur
                    const userRegion = agent?.REGION as 'OUEST' | 'EST' | 'SUD';
                    return (
                      <button
                        key={userRegion}
                        onClick={() => setActiveRegion(userRegion)}
                        className={`px-4 py-2 text-xs font-medium transition-all duration-150 ease-out ${
                          activeRegion === userRegion
                            ? 'bg-white text-gray-900 border-b-2 border-red-500'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {regionLabels[userRegion]}
                      </button>
                    );
                  }
                })()}
              </div>
              <div className="ml-auto flex items-center gap-4">
                {currentLoading && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <div className="h-3.5 w-3.5 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin"></div>
                    <span>Mise à jour...</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-700">Année:</label>
                  <select 
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="2024">2024</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-700">Mois:</label>
                  <select 
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {months.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden p-6 flex gap-6 min-h-0 relative">
              {currentSuppliers.length === 0 ? (
                <div className="flex items-center justify-center w-full">
                  <div className="py-10 text-center">
                    <img src={EMPTY_ANIMATION_SVG} alt="Aucune donnée" className="mx-auto w-40 h-auto animate-bounce" />
                    <p className="mt-3 text-sm font-semibold text-gray-600">Aucun fournisseur disponible.</p>
                    <p className="text-xs text-gray-500">Ajustez les filtres (année, mois, région) ou revenez plus tard.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Left side - List (30%) */}
                  <div className={`w-3/10 flex flex-col min-h-0 flex-shrink-0 transition-all duration-400 ${currentLoading ? 'opacity-80 scale-[0.995]' : 'opacity-100 scale-100'}`}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-4">
                      Liste des Fournisseurs
                    </h3>
                    <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
                      {currentSuppliers.map((supplier, index) => (
                        <div
                          key={supplier.fournisseur}
                          onClick={() => handleSupplierClick(supplier.fournisseur)}
                          className={`cursor-pointer border rounded-lg p-2 transition-colors ${
                            selectedSupplier === supplier.fournisseur && showSupplierInvoicesInChart
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-200 hover:bg-red-50 hover:border-red-300'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900 text-xs">
                                {index + 1}. {supplier.fournisseur}
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                <span className="font-medium">
                                  {supplier.nombreFactures}
                                </span>{' '}
                                factures
                              </div>
                              <div className={`text-xs font-semibold mt-1 text-red-600`}>
                                USD {formatCurrency(supplier.montantNonPaye)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right side - Chart (70%) */}
                  <div className={`flex-1 flex flex-col min-h-0 transition-all duration-400 ${currentLoading ? 'opacity-85 scale-[0.995]' : 'opacity-100 scale-100'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-semibold text-gray-800 mb-0">
                        {showSupplierInvoicesInChart && selectedSupplier ? `Graphique - Factures de ${selectedSupplier}` : 'Graphique'}
                      </h3>
                      {showSupplierInvoicesInChart && selectedSupplier && (
                        <div className="flex items-center gap-2">
                          {supplierLoading && (
                            <div className="h-3.5 w-3.5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setShowSupplierInvoicesInChart(false);
                              setSelectedSupplier(null);
                              setSelectedInvoices([]);
                            }}
                            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Retour Top fournisseurs
                          </button>
                        </div>
                      )}
                    </div>
                    {displayedChartData.length > 0 ? (
                      <>
                        <div className="flex-1 min-h-[360px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={displayedChartData}
                              margin={{
                                top: 20,
                                right: 30,
                                left: 30,
                                bottom: showSupplierInvoicesInChart ? 112 : 80,
                              }}
                              onClick={(state: { activeTooltipIndex?: number }) => {
                                const idx = state?.activeTooltipIndex;
                                if (typeof idx !== 'number' || idx < 0 || idx >= displayedChartData.length) return;
                                const row = displayedChartData[idx];
                                if (!row?.fullName) return;
                                if (showSupplierInvoicesInChart) {
                                  handleInvoiceClick(row.fullName);
                                } else {
                                  handleSupplierClick(row.fullName);
                                }
                              }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                dataKey="name"
                                angle={showSupplierInvoicesInChart ? -42 : 0}
                                textAnchor={showSupplierInvoicesInChart ? 'end' : 'middle'}
                                height={showSupplierInvoicesInChart ? 100 : 88}
                                interval={0}
                                tick={{ fontSize: showSupplierInvoicesInChart ? 8 : 9, fontWeight: 'bold', fill: '#000000' }}
                                tickFormatter={(_v, i) => {
                                  const row = displayedChartData[i];
                                  return row && 'tickLabel' in row && row.tickLabel ? row.tickLabel : String(row?.fullName ?? '');
                                }}
                              />
                              <YAxis
                                label={{ value: 'Montant (USD)', angle: -90, position: 'insideLeft', fontSize: 10, fontWeight: 'bold', fill: '#000000' }}
                                tick={{ fontSize: 10, fontWeight: 'bold', fill: '#000000' }}
                                domain={[0, 'dataMax']}
                              />
                              <Tooltip
                                shared={false}
                                cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null;
                                  const barEntry = payload.find((p) => p.dataKey === 'montant' && p.payload) ?? payload[0];
                                  const data = barEntry?.payload as {
                                    fullName?: string;
                                    montant?: number;
                                    receptionDate?: string;
                                    tickLabel?: string;
                                  };
                                  if (!data) return null;
                                  const rec = data.receptionDate
                                    ? new Date(data.receptionDate)
                                    : null;
                                  const recStr =
                                    rec && !Number.isNaN(rec.getTime())
                                      ? rec.toLocaleDateString('fr-FR')
                                      : null;
                                  return (
                                    <div className="bg-white p-2 border border-gray-300 rounded shadow-lg max-w-[280px]">
                                      <p className="font-semibold text-xs break-words">{data.fullName}</p>
                                      {recStr && (
                                        <p className="text-[11px] text-gray-600 mt-0.5">Réception : {recStr}</p>
                                      )}
                                      <p className="text-xs font-semibold text-blue-600 mt-1">
                                        Montant : ${formatCurrency(Number(data.montant ?? 0))}
                                      </p>
                                    </div>
                                  );
                                }}
                              />
                              <Bar
                                dataKey="montant"
                                name="Montant (USD)"
                                radius={[8, 8, 0, 0]}
                                label={{ 
                                  position: 'top',
                                  formatter: (value: any) => `$${formatCurrency(value)}`,
                                  fill: '#000000',
                                  fontSize: 10,
                                  fontWeight: 'bold'
                                }}
                                onClick={(data: any) => {
                                  if (showSupplierInvoicesInChart) {
                                    handleInvoiceClick(String(data.fullName || data.name || ''));
                                  } else {
                                    handleSupplierClick(data.fullName);
                                  }
                                }}
                              >
                                {displayedChartData.map((entry, index) => {
                                  const maxMontant = Math.max(...displayedChartData.map(d => d.montant), 1);
                                  const ratio = entry.montant / maxMontant;
                                  const grayValue = Math.round(130 + ratio * 90);
                                  const color = `#${grayValue.toString(16)}${grayValue.toString(16)}${grayValue.toString(16)}`;
                                  return <Cell key={`cell-${index}`} fill={color} />;
                                })}
                              </Bar>
                              <Line
                                type="monotone"
                                dataKey="montant"
                                stroke="#ef4444"
                                strokeWidth={3}
                                dot={{ fill: '#dc2626', r: 5 }}
                                onClick={(data: any) => {
                                  if (!showSupplierInvoicesInChart) return;
                                  handleInvoiceClick(String(data?.payload?.fullName || data?.payload?.name || ''));
                                }}
                                isAnimationActive={true}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-96">
                        <p className="text-gray-500">
                          {showSupplierInvoicesInChart ? 'Aucune facture disponible pour ce fournisseur.' : 'Aucune donnée disponible'}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer avec commentaire */}
            <div className="bg-gray-100 p-4">
              <p className="text-xs italic text-center text-gray-600">
                {currentSuppliers.length > 0 && (
                  `Région sélectionnée: ${regionLabels[activeRegion]} | Les 3 premiers fournisseurs concentrent ${calculateTopSuppliersPercentage()}% du montant total. Priorité à optimiser les délais et négociations avec ces partenaires clés.`
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {viewInvoice && (
        <ViewInvoiceModal
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
        />
      )}

      {paymentInvoice && (
        <PaiementModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          readOnly
        />
      )}
    </>
  );
}

export default Top10SuppliersModal;

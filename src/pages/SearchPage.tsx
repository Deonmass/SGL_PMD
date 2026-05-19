import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw, Download, ClipboardList, X, FileText, FileDown, FileSpreadsheet, RotateCcw, ChevronDown } from 'lucide-react';
import { supabase } from '../services/supabase';
import * as XLSX from 'xlsx';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../contexts/AuthContext';
import AccessDenied from '../components/AccessDenied';
import ViewInvoiceModal from '../components/ViewInvoiceModal';
import PaiementModal from '../components/PaiementModal';
import { Invoice as GlobalInvoice } from '../types';
import { useDataRefresh, REFRESH_EVENTS } from '../hooks/useDataRefresh';
import { isInvoiceEffectivelyRejected } from '../utils/factureRejetHistory';
import { downloadReleveSoaPdf, downloadSearchDetailStatusPdf, type SearchPdfInvoiceRow } from '../utils/searchPageExportPdf';
import { formatTransportCompact } from '../constants/transportTitles';

type LeftSearchTab = 'supplier' | 'dossier' | 'gestionnaire' | 'client' | 'transport';

interface SearchCriteriaListItem {
  key: string;
  label: string;
  count: number;
  restAPayer: number;
}

function SearchCriteriaCard({
  label,
  count,
  restAPayer,
  isSelected,
  onClick,
}: {
  label: string;
  count: number;
  restAPayer: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`p-3 rounded-lg cursor-pointer transition-all duration-200 overflow-hidden ${
        isSelected ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 hover:bg-gray-100 text-gray-900'
      }`}
    >
      <div className="font-semibold text-sm break-words">{label}</div>
      <div className={`text-xs mt-1 ${isSelected ? 'text-blue-100' : 'text-gray-600'}`}>
        <span>
          Solde à payer:{' '}
          <span className="font-bold">
            ${restAPayer.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </span>
      </div>
      <div className="mt-2">
        <span
          className={`inline-flex max-w-full items-center rounded-full px-3 py-1 text-[11px] font-semibold leading-tight ${
            isSelected
              ? 'bg-white/20 text-white ring-1 ring-white/50'
              : 'bg-blue-100 text-blue-900 ring-1 ring-blue-200/80'
          }`}
        >
          {count} facture{count > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

function getInvoiceTransportKey(transportTitle: string, transportNumero: string): string {
  const compact = formatTransportCompact(transportTitle, transportNumero);
  if (compact) return compact;
  const title = (transportTitle || '').trim();
  const num = (transportNumero || '').trim();
  if (title && num) return `${title} — ${num}`;
  if (title) return title;
  if (num) return num;
  return 'Non renseigné';
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Horodatage type 11/05/2026 11:00 (export relevé) */
function formatReleveExportTimestamp(): string {
  return new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatReleveDueDate(d: string | null): string {
  if (!d) return '-';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '-';
  return t.toLocaleDateString('fr-FR');
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Écart en mois calendaires + jours (from ≤ to). */
function diffCalendarMonthsDays(from: Date, to: Date): { months: number; days: number } {
  let months = to.getMonth() - from.getMonth() + 12 * (to.getFullYear() - from.getFullYear());
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
  }
  return { months, days };
}

/** Libellé court pour l’écart entre aujourd’hui et la date d’échéance (export / tableaux). */
function formatTempsRestantEcheance(dueDateStr: string | null, ref: Date = new Date()): string {
  if (!dueDateStr) return '—';
  const due = new Date(dueDateStr);
  if (Number.isNaN(due.getTime())) return '—';
  const today = startOfLocalDay(ref);
  const dueDay = startOfLocalDay(due);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays > 0) {
    const { months, days } = diffCalendarMonthsDays(today, dueDay);
    if (months === 0) return `${diffDays} jrs`;
    if (days === 0) return `${months} mois`;
    return `${months} mois et ${days} jrs`;
  }
  const late = -diffDays;
  const { months, days } = diffCalendarMonthsDays(dueDay, today);
  if (months === 0) return `${late} jrs de retard`;
  if (days === 0) return `${months} mois de retard`;
  return `${months} mois et ${days} jrs de retard`;
}

function isReleveInvoiceEchue(inv: Invoice): boolean {
  return inv.status === 'ÉCHUE';
}

function isReleveInvoiceFullyPaid(inv: Invoice): boolean {
  return inv.status === 'PAYÉE';
}

interface SearchPageProps {
  activeMenu?: string;
  menuTitle?: string;
  invoiceTypeScope?: 'operationnel' | 'frais-generaux';
}

type SearchPeriodPreset = '1m' | '3m' | '6m' | '1y' | '2y';

const DEFAULT_SEARCH_YEAR = '2026';

function toInputDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatSoaMonthYearEn(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function getSoaPeriodCoveredLabel(yearStr: string, dateStart: string, dateEnd: string): string {
  if (dateStart && dateEnd) {
    const a = new Date(dateStart);
    const b = new Date(dateEnd);
    if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime())) {
      return `${formatSoaMonthYearEn(a)} – ${formatSoaMonthYearEn(b)}`;
    }
  }
  const y = parseInt(yearStr, 10);
  if (!Number.isNaN(y)) {
    return `${formatSoaMonthYearEn(new Date(y, 0, 1))} – ${formatSoaMonthYearEn(new Date(y, 11, 1))}`;
  }
  return '-';
}

function supplierToSoaAccountNumber(supplier: string): string {
  const compact = (supplier || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const core = compact.slice(0, 10) || 'CLIENT';
  return `ACC-${core}-001`;
}

function normalizeInvoiceType(value?: string | null) {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (normalized === 'frais generaux' || normalized === 'frais-generaux') return 'frais-generaux';
  if (normalized === 'operationnel' || normalized === 'operationel') return 'operationnel';
  return normalized;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  numeroDossier: string;
  supplier: string;
  manager: string;
  client: string;
  transportTitle: string;
  transportNumero: string;
  costCenter: string;
  date: string;
  amount: number;
  status: string;
  currency: string;
  region: string;
  totalPaid: number;
  restAPayer: number;
  dueDate: string | null;
  isRejected: boolean;
}

function invoiceToSearchPdfRow(inv: Invoice): SearchPdfInvoiceRow {
  return {
    invoiceNumber: inv.invoiceNumber,
    supplier: inv.supplier,
    date: inv.date,
    dueDate: inv.dueDate,
    amount: inv.amount,
    totalPaid: inv.totalPaid,
    restAPayer: inv.restAPayer,
    status: inv.status,
  };
}

function SearchPage({ menuTitle = 'Recherche avancée', invoiceTypeScope = 'operationnel' }: SearchPageProps) {
  const { canView, hasPermission } = usePermission();
  const { agent } = useAuth();
  const regions = ['OUEST', 'EST', 'SUD'];
  const years = ['2030', '2029', '2028', '2027', '2026', '2025'];

  // Main state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<GlobalInvoice | null>(null);
  const [showViewInvoiceModal, setShowViewInvoiceModal] = useState(false);
  const [showPaiementModal, setShowPaiementModal] = useState(false);

  /** Carte statut sélectionnée → détail tableau en dessous */
  const [detailStatusKey, setDetailStatusKey] = useState<'unpaid' | 'overdue' | 'rejected' | 'paid' | null>(null);

  const [showReleveModal, setShowReleveModal] = useState(false);
  const [releveSupplier, setReleveSupplier] = useState<string>('');
  const [releveYear, setReleveYear] = useState<string>(DEFAULT_SEARCH_YEAR);
  const [releveDateStart, setReleveDateStart] = useState<string>('');
  const [releveDateEnd, setReleveDateEnd] = useState<string>('');
  const [relevePeriodPreset, setRelevePeriodPreset] = useState<SearchPeriodPreset | null>(null);
  const [relevePdfBusy, setRelevePdfBusy] = useState(false);
  const [detailPdfBusy, setDetailPdfBusy] = useState(false);
  const [releveSupplierInput, setReleveSupplierInput] = useState('');
  const [releveSupplierSuggestionsOpen, setReleveSupplierSuggestionsOpen] = useState(false);

  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  
  // Tab state for left column
  const [activeLeftTab, setActiveLeftTab] = useState<LeftSearchTab>('supplier');
  
  // Selected dossier state
  const [selectedDossier, setSelectedDossier] = useState<string | null>(null);
  const [selectedGestionnaire, setSelectedGestionnaire] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedTransport, setSelectedTransport] = useState<string | null>(null);

  const hasLeftSelection = !!(
    selectedSupplier ||
    selectedDossier ||
    selectedGestionnaire ||
    selectedClient ||
    selectedTransport
  );

  const [expandedLeftTab, setExpandedLeftTab] = useState<LeftSearchTab | null>('supplier');

  const toggleLeftAccordion = useCallback((tab: LeftSearchTab) => {
    setExpandedLeftTab((prev) => {
      const next = prev === tab ? null : tab;
      if (next) setActiveLeftTab(next);
      return next;
    });
  }, []);

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{label: string, value: string, type: string, supplier?: string, amount?: number, date?: string, invoiceNumber?: string}>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // If agent has TOUT, show all regions. Otherwise, show only their region
  const [selectedRegion, setSelectedRegion] = useState<string>(agent?.REGION && agent.REGION !== 'TOUT' ? agent.REGION : '');
  const [selectedYear, setSelectedYear] = useState<string>(DEFAULT_SEARCH_YEAR);
  const canViewOperational = hasPermission('recherche', 'voir_operationnel') || canView('recherche');
  const canViewFfg = hasPermission('recherche', 'voir_frais_generaux');
  const [selectedInvoiceType, setSelectedInvoiceType] = useState<'operationnel' | 'frais-generaux'>(
    invoiceTypeScope === 'frais-generaux' ? 'frais-generaux' : 'operationnel'
  );

  const leftSearchTabs = useMemo((): { id: LeftSearchTab; label: string }[] => {
    const tabs: { id: LeftSearchTab; label: string }[] = [{ id: 'supplier', label: 'Fournisseur' }];
    if (selectedInvoiceType !== 'frais-generaux') {
      tabs.push({ id: 'dossier', label: 'Numéro de dossier' });
    }
    tabs.push(
      { id: 'gestionnaire', label: 'Gestionnaire' },
      { id: 'client', label: 'Client' },
      { id: 'transport', label: 'Titre de transport' },
    );
    return tabs;
  }, [selectedInvoiceType]);

  // Filtres année + plage (visibles seulement après choix fournisseur ou dossier) — par défaut : année seule
  const [filterDateStart, setFilterDateStart] = useState<string>('');
  const [filterDateEnd, setFilterDateEnd] = useState<string>('');
  const [searchPeriodPreset, setSearchPeriodPreset] = useState<SearchPeriodPreset | null>(null);

  const detailFiltersUnlocked = hasLeftSelection;

  const resetSearchBarFilters = useCallback(() => {
    setSelectedYear(DEFAULT_SEARCH_YEAR);
    setFilterDateStart('');
    setFilterDateEnd('');
    setSearchPeriodPreset(null);
  }, []);

  const applySearchPeriodPreset = useCallback((preset: SearchPeriodPreset) => {
    const today = new Date();
    const start = new Date(today);
    if (preset === '1m') start.setMonth(start.getMonth() - 1);
    else if (preset === '3m') start.setMonth(start.getMonth() - 3);
    else if (preset === '6m') start.setMonth(start.getMonth() - 6);
    else if (preset === '1y') start.setFullYear(start.getFullYear() - 1);
    else if (preset === '2y') start.setFullYear(start.getFullYear() - 2);
    setFilterDateStart(toInputDateString(start));
    setFilterDateEnd(toInputDateString(today));
    setSearchPeriodPreset(preset);
  }, []);

  const resetReleveFilters = useCallback(() => {
    setReleveYear(DEFAULT_SEARCH_YEAR);
    setReleveDateStart('');
    setReleveDateEnd('');
    setRelevePeriodPreset(null);
  }, []);

  const applyRelevePeriodPreset = useCallback((preset: SearchPeriodPreset) => {
    const today = new Date();
    const start = new Date(today);
    if (preset === '1m') start.setMonth(start.getMonth() - 1);
    else if (preset === '3m') start.setMonth(start.getMonth() - 3);
    else if (preset === '6m') start.setMonth(start.getMonth() - 6);
    else if (preset === '1y') start.setFullYear(start.getFullYear() - 1);
    else if (preset === '2y') start.setFullYear(start.getFullYear() - 2);
    setReleveDateStart(toInputDateString(start));
    setReleveDateEnd(toInputDateString(today));
    setRelevePeriodPreset(preset);
  }, []);

  const passesYearAndReceptionRange = useCallback(
    (inv: Invoice) => {
      if (!detailFiltersUnlocked) return true;
      if (selectedYear && new Date(inv.date).getFullYear().toString() !== selectedYear) {
        return false;
      }
      if (filterDateStart && filterDateEnd) {
        const invDate = new Date(inv.date);
        const start = new Date(filterDateStart);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filterDateEnd);
        end.setHours(23, 59, 59, 999);
        if (invDate < start || invDate > end) return false;
      }
      return true;
    },
    [detailFiltersUnlocked, selectedYear, filterDateStart, filterDateEnd]
  );

  if (!canView('recherche')) {
    return <AccessDenied message="Vous n'avez pas accès à la recherche." />;
  }

  const loadSearchData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", "Numéro de dossier", Fournisseur, "Gestionnaire", Client, "Titre de transport", numero, "Centre de coût", "Date de réception", Montant, Statut, Devise, "Région", "Échéance", "Catégorie fournisseur", Rejet');

      query = query.eq('Type de facture', selectedInvoiceType);

      if (agent?.REGION && agent.REGION !== 'TOUT') {
        query = query.eq('Région', agent.REGION);
      }

      const { data: factures, error } = await query;
      if (error) {
        console.error('Erreur lors de la récupération des factures:', error);
        return;
      }

      const { data: paiements } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');

      const paidMap = new Map<string, number>();
      paiements?.forEach((p: any) => {
        const invoiceNum = String(p.NumeroFacture || '').trim();
        const montant = parseFloat(String(p.montantPaye || 0));
        paidMap.set(invoiceNum, (paidMap.get(invoiceNum) || 0) + montant);
      });

      const processedInvoices: Invoice[] = factures?.map((f: Record<string, unknown>) => {
        const invoiceNum = String(f['Numéro de facture'] || '').trim();
        const dossierNum = String(f['Numéro de dossier'] || '').trim();
        const amount = parseFloat(String(f.Montant)) || 0;
        const totalPaid = paidMap.get(invoiceNum) || 0;
        const restAPayer = Math.max(0, amount - totalPaid);
        const dueDate = f['Échéance'] ? String(f['Échéance']) : null;
        const isRejected = isInvoiceEffectivelyRejected(f.Statut, f.Rejet);

        return {
          id: String(f.ID),
          invoiceNumber: invoiceNum,
          numeroDossier: dossierNum,
          supplier: String(f.Fournisseur || '').trim(),
          manager: String(f.Gestionnaire || '').trim(),
          client: String(f.Client || '').trim(),
          transportTitle: String(f['Titre de transport'] || '').trim(),
          transportNumero: String(f.numero || '').trim(),
          costCenter: String(f['Centre de coût'] || '').trim(),
          date: String(f['Date de réception'] || ''),
          amount,
          status: isRejected ? 'REJETÉE' : totalPaid > 0 && restAPayer > 0 ? 'PARTIELLEMENT PAYÉE' : totalPaid > 0 ? 'PAYÉE' : dueDate && new Date(dueDate) < new Date() ? 'ÉCHUE' : 'NON PAYÉE',
          currency: String(f.Devise || 'USD'),
          region: String(f.Région || 'OUEST'),
          totalPaid,
          restAPayer,
          dueDate,
          isRejected
        };
      }) || [];

      setInvoices(processedInvoices);
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  }, [agent?.REGION, selectedInvoiceType]);

  useEffect(() => {
    const normalizedScope = normalizeInvoiceType(invoiceTypeScope) as 'operationnel' | 'frais-generaux';
    if (normalizedScope === 'frais-generaux') {
      setSelectedInvoiceType('frais-generaux');
      return;
    }
    if (selectedInvoiceType === 'frais-generaux' && !canViewFfg) {
      setSelectedInvoiceType(canViewOperational ? 'operationnel' : 'frais-generaux');
    }
  }, [invoiceTypeScope, canViewOperational, canViewFfg, selectedInvoiceType]);

  useEffect(() => {
    if (selectedInvoiceType === 'frais-generaux' && activeLeftTab === 'dossier') {
      setActiveLeftTab('supplier');
      setExpandedLeftTab('supplier');
      setSelectedDossier(null);
    }
  }, [selectedInvoiceType, activeLeftTab]);

  useEffect(() => {
    loadSearchData();
  }, [loadSearchData]);

  useEffect(() => {
    setDetailStatusKey(null);
  }, [selectedSupplier, selectedDossier, selectedGestionnaire, selectedClient, selectedTransport]);

  useDataRefresh(REFRESH_EVENTS.ALL, () => {
    loadSearchData();
  });

  // Get unique suppliers with unpaid/overdue invoices
  const getUnpaidSuppliers = () => {
    // Apply all filters first
    let filteredInvoices = invoices.filter(inv => inv.restAPayer > 0);
    
    // Apply region filter
    if (selectedRegion) {
      filteredInvoices = filteredInvoices.filter(inv => inv.region === selectedRegion);
    }
    
    filteredInvoices = filteredInvoices.filter(passesYearAndReceptionRange);

    // Apply search filter for supplier list (left 30% panel)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filteredInvoices = filteredInvoices.filter(inv =>
        inv.supplier.toLowerCase().includes(term)
      );
    }
    
    const supplierMap = new Map<string, { supplier: string; count: number; totalAmount: number; totalPaid: number; restAPayer: number }>();
    
    filteredInvoices.forEach(inv => {
      const existing = supplierMap.get(inv.supplier);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += inv.amount;
        existing.totalPaid += inv.totalPaid;
        existing.restAPayer += inv.restAPayer;
      } else {
        supplierMap.set(inv.supplier, {
          supplier: inv.supplier,
          count: 1,
          totalAmount: inv.amount,
          totalPaid: inv.totalPaid,
          restAPayer: inv.restAPayer
        });
      }
    });
    
    return Array.from(supplierMap.values()).sort((a, b) => b.restAPayer - a.restAPayer);
  };

  // Get unique dossier numbers from unpaid/overdue invoices
  const getUnpaidDossiers = () => {
    // Apply all filters first
    let filteredInvoices = invoices.filter(inv => inv.restAPayer > 0);
    
    // Apply region filter
    if (selectedRegion) {
      filteredInvoices = filteredInvoices.filter(inv => inv.region === selectedRegion);
    }
    
    filteredInvoices = filteredInvoices.filter(passesYearAndReceptionRange);

    // Apply search filter for dossier list (left 30% panel)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filteredInvoices = filteredInvoices.filter(inv => {
        let dossierNumber = inv.numeroDossier && inv.numeroDossier.trim() !== ''
          ? inv.numeroDossier
          : inv.invoiceNumber;

        if (!inv.numeroDossier || inv.numeroDossier.trim() === '') {
          if (inv.invoiceNumber.includes('/')) {
            dossierNumber = inv.invoiceNumber.split('/')[0];
          } else if (inv.invoiceNumber.includes('-')) {
            dossierNumber = inv.invoiceNumber.split('-')[0];
          }
        }

        return dossierNumber.toLowerCase().includes(term);
      });
    }
    
    const dossierMap = new Map<string, { dossier: string; count: number; totalAmount: number; totalPaid: number; restAPayer: number }>();
    
    filteredInvoices.forEach(inv => {
      // Use the dedicated dossier number field if available, otherwise extract from invoice number
      let dossierNumber = inv.numeroDossier && inv.numeroDossier.trim() !== '' 
        ? inv.numeroDossier 
        : inv.invoiceNumber;
      
      // If invoice number contains / or -, extract the part before it (only if no dedicated dossier number)
      if (!inv.numeroDossier || inv.numeroDossier.trim() === '') {
        if (inv.invoiceNumber.includes('/')) {
          dossierNumber = inv.invoiceNumber.split('/')[0];
        } else if (inv.invoiceNumber.includes('-')) {
          dossierNumber = inv.invoiceNumber.split('-')[0];
        }
      }
      
      const existing = dossierMap.get(dossierNumber);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += inv.amount;
        existing.totalPaid += inv.totalPaid;
        existing.restAPayer += inv.restAPayer;
      } else {
        dossierMap.set(dossierNumber, {
          dossier: dossierNumber,
          count: 1,
          totalAmount: inv.amount,
          totalPaid: inv.totalPaid,
          restAPayer: inv.restAPayer
        });
      }
    });
    
    return Array.from(dossierMap.values()).sort((a, b) => b.restAPayer - a.restAPayer);
  };

  const getUnpaidManagers = () => {
    let filteredInvoices = invoices.filter((inv) => inv.restAPayer > 0);

    if (selectedRegion) {
      filteredInvoices = filteredInvoices.filter((inv) => inv.region === selectedRegion);
    }

    filteredInvoices = filteredInvoices.filter(passesYearAndReceptionRange);

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filteredInvoices = filteredInvoices.filter((inv) => {
        const mgr = (inv.manager || '').trim() || 'Non renseigné';
        return (
          mgr.toLowerCase().includes(term) ||
          inv.invoiceNumber.toLowerCase().includes(term) ||
          inv.supplier.toLowerCase().includes(term)
        );
      });
    }

    const managerMap = new Map<
      string,
      { gestionnaire: string; count: number; totalAmount: number; totalPaid: number; restAPayer: number }
    >();

    filteredInvoices.forEach((inv) => {
      const key = inv.manager.trim() || 'Non renseigné';
      const existing = managerMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += inv.amount;
        existing.totalPaid += inv.totalPaid;
        existing.restAPayer += inv.restAPayer;
      } else {
        managerMap.set(key, {
          gestionnaire: key,
          count: 1,
          totalAmount: inv.amount,
          totalPaid: inv.totalPaid,
          restAPayer: inv.restAPayer,
        });
      }
    });

    return Array.from(managerMap.values()).sort((a, b) => b.restAPayer - a.restAPayer);
  };

  const getUnpaidClients = () => {
    let filteredInvoices = invoices.filter((inv) => inv.restAPayer > 0);

    if (selectedRegion) {
      filteredInvoices = filteredInvoices.filter((inv) => inv.region === selectedRegion);
    }

    filteredInvoices = filteredInvoices.filter(passesYearAndReceptionRange);

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filteredInvoices = filteredInvoices.filter((inv) => {
        const clientName = inv.client.trim() || 'Non renseigné';
        return (
          clientName.toLowerCase().includes(term) ||
          inv.invoiceNumber.toLowerCase().includes(term) ||
          inv.supplier.toLowerCase().includes(term)
        );
      });
    }

    const clientMap = new Map<
      string,
      { client: string; count: number; totalAmount: number; totalPaid: number; restAPayer: number }
    >();

    filteredInvoices.forEach((inv) => {
      const key = inv.client.trim() || 'Non renseigné';
      const existing = clientMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += inv.amount;
        existing.totalPaid += inv.totalPaid;
        existing.restAPayer += inv.restAPayer;
      } else {
        clientMap.set(key, {
          client: key,
          count: 1,
          totalAmount: inv.amount,
          totalPaid: inv.totalPaid,
          restAPayer: inv.restAPayer,
        });
      }
    });

    return Array.from(clientMap.values()).sort((a, b) => b.restAPayer - a.restAPayer);
  };

  const getUnpaidTransports = () => {
    let filteredInvoices = invoices.filter((inv) => inv.restAPayer > 0);

    if (selectedRegion) {
      filteredInvoices = filteredInvoices.filter((inv) => inv.region === selectedRegion);
    }

    filteredInvoices = filteredInvoices.filter(passesYearAndReceptionRange);

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filteredInvoices = filteredInvoices.filter((inv) => {
        const transportKey = getInvoiceTransportKey(inv.transportTitle, inv.transportNumero);
        return (
          transportKey.toLowerCase().includes(term) ||
          inv.invoiceNumber.toLowerCase().includes(term) ||
          inv.supplier.toLowerCase().includes(term)
        );
      });
    }

    const transportMap = new Map<
      string,
      { transport: string; count: number; totalAmount: number; totalPaid: number; restAPayer: number }
    >();

    filteredInvoices.forEach((inv) => {
      const key = getInvoiceTransportKey(inv.transportTitle, inv.transportNumero);
      const existing = transportMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += inv.amount;
        existing.totalPaid += inv.totalPaid;
        existing.restAPayer += inv.restAPayer;
      } else {
        transportMap.set(key, {
          transport: key,
          count: 1,
          totalAmount: inv.amount,
          totalPaid: inv.totalPaid,
          restAPayer: inv.restAPayer,
        });
      }
    });

    return Array.from(transportMap.values()).sort((a, b) => b.restAPayer - a.restAPayer);
  };

  // Filter invoices based on all criteria
  const getFilteredInvoices = () => {
    let filtered = [...invoices];

    // Search term - recherche selon l'onglet actif
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(inv => {
        if (activeLeftTab === 'supplier') {
          // Rechercher dans les champs de fournisseur
          return inv.supplier.toLowerCase().includes(term) ||
                 inv.invoiceNumber.toLowerCase().includes(term) ||
                 inv.costCenter.toLowerCase().includes(term);
        } else if (activeLeftTab === 'dossier') {
          // Rechercher dans les champs de dossier
          return inv.numeroDossier.toLowerCase().includes(term) ||
                 inv.invoiceNumber.toLowerCase().includes(term);
        } else if (activeLeftTab === 'gestionnaire') {
          return (
            inv.manager.toLowerCase().includes(term) ||
            inv.invoiceNumber.toLowerCase().includes(term) ||
            inv.supplier.toLowerCase().includes(term)
          );
        } else if (activeLeftTab === 'client') {
          const clientName = inv.client.trim() || 'non renseigné';
          return (
            clientName.includes(term) ||
            inv.invoiceNumber.toLowerCase().includes(term) ||
            inv.supplier.toLowerCase().includes(term)
          );
        } else if (activeLeftTab === 'transport') {
          const transportKey = getInvoiceTransportKey(inv.transportTitle, inv.transportNumero).toLowerCase();
          return (
            transportKey.includes(term) ||
            inv.invoiceNumber.toLowerCase().includes(term) ||
            inv.supplier.toLowerCase().includes(term)
          );
        }
        return false;
      });
    }

    // Region
    if (selectedRegion) {
      filtered = filtered.filter(inv => inv.region === selectedRegion);
    }

    // Supplier filter - only show invoices for selected supplier
    if (selectedSupplier) {
      filtered = filtered.filter(inv => inv.supplier === selectedSupplier);
    }

    // Dossier filter - only show invoices for selected dossier
    if (selectedDossier) {
      filtered = filtered.filter(inv => {
        // Use the dedicated dossier number field if available
        let dossierNumber = inv.numeroDossier && inv.numeroDossier.trim() !== '' 
          ? inv.numeroDossier 
          : inv.invoiceNumber;
        
        // If invoice number contains / or -, extract the part before it (only if no dedicated dossier number)
        if (!inv.numeroDossier || inv.numeroDossier.trim() === '') {
          if (inv.invoiceNumber.includes('/')) {
            dossierNumber = inv.invoiceNumber.split('/')[0];
          } else if (inv.invoiceNumber.includes('-')) {
            dossierNumber = inv.invoiceNumber.split('-')[0];
          }
        }
        
        return dossierNumber === selectedDossier;
      });
    }

    if (selectedGestionnaire) {
      filtered = filtered.filter((inv) => {
        const m = inv.manager.trim() || 'Non renseigné';
        return m === selectedGestionnaire;
      });
    }

    if (selectedClient) {
      filtered = filtered.filter((inv) => {
        const c = inv.client.trim() || 'Non renseigné';
        return c === selectedClient;
      });
    }

    if (selectedTransport) {
      filtered = filtered.filter(
        (inv) =>
          getInvoiceTransportKey(inv.transportTitle, inv.transportNumero) === selectedTransport
      );
    }

    filtered = filtered.filter(passesYearAndReceptionRange);

    return filtered;
  };

  // Générer les suggestions de recherche
  const generateSearchSuggestions = (term: string) => {
    if (term.length < 1) {
      setSearchSuggestions([]);
      return;
    }

    const lowerTerm = term.toLowerCase();
    const suggestions = new Map<string, typeof searchSuggestions[0]>();

    invoices.forEach(inv => {
      // Numéro de facture
      if (inv.invoiceNumber.toLowerCase().includes(lowerTerm)) {
        const key = `facture-${inv.invoiceNumber}`;
        if (!suggestions.has(key)) {
          suggestions.set(key, { 
            label: `Facture: ${inv.invoiceNumber}`, 
            value: inv.invoiceNumber, 
            type: 'facture',
            supplier: inv.supplier,
            amount: inv.amount,
            date: inv.date,
            invoiceNumber: inv.invoiceNumber
          });
        }
      }

      // Fournisseur
      if (inv.supplier.toLowerCase().includes(lowerTerm)) {
        const key = `supplier-${inv.supplier}`;
        if (!suggestions.has(key)) {
          suggestions.set(key, { 
            label: `Fournisseur: ${inv.supplier}`, 
            value: inv.supplier, 
            type: 'supplier',
            supplier: inv.supplier
          });
        }
      }

      // Centre de coût
      if (inv.costCenter.toLowerCase().includes(lowerTerm)) {
        const key = `cost-${inv.costCenter}`;
        if (!suggestions.has(key)) {
          suggestions.set(key, { 
            label: `Centre de coût: ${inv.costCenter}`, 
            value: inv.costCenter, 
            type: 'costcenter'
          });
        }
      }
    });

    setSearchSuggestions(Array.from(suggestions.values()).slice(0, 8));
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    generateSearchSuggestions(value);
    setShowSuggestions(true);
  };

  const handleSuggestionClick = (suggestion: typeof searchSuggestions[0]) => {
    setSearchTerm(suggestion.value);
    setSearchSuggestions([]);
    setShowSuggestions(false);
  };

  // Generate filter description subtitle
  const getFilterDescription = (): string => {
    const parts: string[] = [];

    if (selectedRegion) {
      parts.push(`Région: ${selectedRegion}`);
    }

    if (detailFiltersUnlocked) {
      if (selectedYear && selectedYear !== DEFAULT_SEARCH_YEAR) {
        parts.push(`Année: ${selectedYear}`);
      }
      if (filterDateStart && filterDateEnd) {
        const startDate = new Date(filterDateStart).toLocaleDateString('fr-FR');
        const endDate = new Date(filterDateEnd).toLocaleDateString('fr-FR');
        parts.push(`Période: du ${startDate} au ${endDate}`);
      }
    }

    if (searchTerm.trim()) {
      parts.push(`Recherche: "${searchTerm}"`);
    }

    return parts.length > 0 ? `Filtres appliqués: ${parts.join(' • ')}` : 'Aucun filtre appliqué';
  };

  const allFiltered = getFilteredInvoices();

  // Categorize invoices
  // Factures non payées: inclut NON PAYÉE (amount complet) + PARTIELLEMENT PAYÉE (restAPayer)
  const unpaidInvoices = allFiltered.filter(inv => 
    (inv.status === 'NON PAYÉE' && !inv.isRejected) || 
    (inv.status === 'PARTIELLEMENT PAYÉE')
  );
  const overdueInvoices = allFiltered.filter(inv => inv.status === 'ÉCHUE');
  const rejectedInvoices = allFiltered.filter(inv => inv.isRejected);
  const paidInvoices = allFiltered.filter(inv => inv.status === 'PAYÉE');

  // Calculate totals
  // Pour les factures non payées: amount pour NON PAYÉE, restAPayer pour PARTIELLEMENT PAYÉE
  const unpaidTotal = unpaidInvoices.reduce((sum, inv) => {
    if (inv.status === 'NON PAYÉE') return sum + inv.amount;
    if (inv.status === 'PARTIELLEMENT PAYÉE') return sum + inv.restAPayer;
    return sum;
  }, 0);
  const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + inv.restAPayer, 0);
  const rejectedTotal = rejectedInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const paidTotal = paidInvoices.reduce((sum, inv) => sum + inv.totalPaid, 0);

  // Handlers for export and refresh
  const handleRefresh = async () => {
    await loadSearchData();
  };

  const handleExportToExcel = () => {
    if (allFiltered.length === 0) {
      alert('Aucune facture à exporter');
      return;
    }

    const exportData = allFiltered.map(inv => ({
      'Numéro de facture': inv.invoiceNumber,
      'Fournisseur': inv.supplier,
      'Montant': inv.amount,
      'Devise': inv.currency,
      'Date': inv.date,
      'Statut': inv.status,
      'Région': inv.region,
      'Gestionnaire': inv.manager
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recherche');
    const fileName = `Recherche_factures_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const openReleveModal = () => {
    setReleveYear(selectedYear);
    setReleveDateStart(filterDateStart);
    setReleveDateEnd(filterDateEnd);
    setRelevePeriodPreset(searchPeriodPreset);
    const sup = selectedSupplier ?? '';
    setReleveSupplier(sup);
    setReleveSupplierInput(sup);
    setReleveSupplierSuggestionsOpen(false);
    setShowReleveModal(true);
  };

  const getReleveFilteredInvoices = (): Invoice[] => {
    let list = [...invoices];

    const supplierQuery = releveSupplierInput.trim().toLowerCase();
    if (releveSupplier) {
      list = list.filter((inv) => inv.supplier === releveSupplier);
    } else if (supplierQuery) {
      list = list.filter((inv) => inv.supplier.toLowerCase().includes(supplierQuery));
    }

    if (releveYear) {
      list = list.filter((inv) => new Date(inv.date).getFullYear().toString() === releveYear);
    }

    if (releveDateStart && releveDateEnd) {
      const start = new Date(releveDateStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(releveDateEnd);
      end.setHours(23, 59, 59, 999);
      list = list.filter((inv) => {
        const d = new Date(inv.date);
        return d >= start && d <= end;
      });
    }

    return list;
  };

  const releveRows = getReleveFilteredInvoices();
  const releveTotals = releveRows.reduce(
    (acc, inv) => ({
      montant: acc.montant + inv.amount,
      paiement: acc.paiement + inv.totalPaid,
      solde: acc.solde + inv.restAPayer
    }),
    { montant: 0, paiement: 0, solde: 0 }
  );

  const uniqueSuppliersForReleve = useMemo(
    () =>
      Array.from(new Set(invoices.map((i) => i.supplier).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr')),
    [invoices]
  );

  const releveSupplierPickList = useMemo(() => {
    const q = releveSupplierInput.trim().toLowerCase();
    if (!q) return uniqueSuppliersForReleve.slice(0, 40);
    return uniqueSuppliersForReleve.filter((s) => s.toLowerCase().includes(q)).slice(0, 40);
  }, [uniqueSuppliersForReleve, releveSupplierInput]);

  const handleInvoiceClick = async (invoice: Invoice) => {
    try {
      const globalInvoice: GlobalInvoice = {
        id: parseInt(invoice.id),
        invoiceNumber: invoice.invoiceNumber,
        supplier: invoice.supplier,
        receptionDate: invoice.date,
        amount: invoice.amount,
        currency: (invoice.currency === 'USD' || invoice.currency === 'CDF' || invoice.currency === 'EUR') ? invoice.currency : 'USD',
        chargeCategory: '',
        urgencyLevel: 'Basse',
        status: invoice.status === 'PAYÉE' ? 'paid' : 'pending',
        region: (invoice.region as 'OUEST' | 'SUD' | 'EST' | 'NORD') || 'OUEST',
        validations: 0,
        emissionDate: invoice.date,
      };

      setSelectedInvoiceForModal(globalInvoice);
      // Si totalPaid > 0, afficher PaiementModal en lecture; sinon ViewInvoiceModal
      if (invoice.totalPaid > 0) {
        setShowPaiementModal(true);
      } else {
        setShowViewInvoiceModal(true);
      }
    } catch (err) {
      console.error('Erreur:', err);
      setShowViewInvoiceModal(true);
    }
  };

  const mapDbStatutToModalStatus = (raw: string): GlobalInvoice['status'] => {
    const u = String(raw || '').toUpperCase();
    if (u.includes('PAY') && !u.includes('PARTIEL')) return 'paid';
    if (u.includes('REJET')) return 'rejected';
    if (u.includes('ÉCHU') || u.includes('ECHU')) return 'overdue';
    if (u.includes('BON') && u.includes('PAYER')) return 'bon-a-payer';
    if (u.includes('VALID')) return 'validated';
    return 'pending';
  };

  useEffect(() => {
    const pending = sessionStorage.getItem('pmd_open_invoice_number');
    if (!pending) return;
    sessionStorage.removeItem('pmd_open_invoice_number');
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('FACTURES')
          .select(
            'ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Région", Devise, "Catégorie de charge", "Niveau urgence"',
          )
          .eq('Numéro de facture', pending)
          .maybeSingle();
        if (error || !data) return;
        const row = data as Record<string, unknown>;
        const idRaw = row.ID;
        const idNum = typeof idRaw === 'number' ? idRaw : parseInt(String(idRaw || '0'), 10);
        const devise = String(row.Devise || 'USD');
        const currency: GlobalInvoice['currency'] =
          devise === 'USD' || devise === 'CDF' || devise === 'EUR' ? devise : 'USD';
        const reg = String(row['Région'] || 'OUEST').toUpperCase();
        const region: GlobalInvoice['region'] =
          reg === 'SUD' || reg === 'EST' || reg === 'NORD' ? (reg as GlobalInvoice['region']) : 'OUEST';
        const urg = String(row['Niveau urgence'] || 'Basse');
        const urgencyLevel: GlobalInvoice['urgencyLevel'] =
          urg === 'Moyenne' || urg === 'Haute' ? (urg as GlobalInvoice['urgencyLevel']) : 'Basse';
        const globalInvoice: GlobalInvoice = {
          id: idNum,
          invoiceNumber: String(row['Numéro de facture'] ?? pending),
          supplier: String(row.Fournisseur || ''),
          receptionDate: String(row['Date de réception'] || ''),
          amount: parseFloat(String(row.Montant ?? 0)) || 0,
          currency,
          chargeCategory: String(row['Catégorie de charge'] || ''),
          urgencyLevel,
          status: mapDbStatutToModalStatus(String(row.Statut || '')),
          region,
          validations: 0,
          emissionDate: String(row['Date de réception'] || ''),
        };
        setSelectedInvoiceForModal(globalInvoice);
        setShowPaiementModal(false);
        setShowViewInvoiceModal(true);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const formatMoney = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleReleveExportPdf = async () => {
    const rows = getReleveFilteredInvoices();
    if (rows.length === 0) {
      alert('Aucune facture à exporter pour ces filtres.');
      return;
    }
    setRelevePdfBusy(true);
    try {
      await downloadReleveSoaPdf({
        rows: rows.map(invoiceToSearchPdfRow),
        totals: releveTotals,
        agentNom: agent?.Nom ?? null,
        releveSupplier,
        releveYear,
        releveDateStart,
        releveDateEnd,
        formatMoney,
        fileName: `Releve_${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch (e) {
      console.error(e);
      alert(`Erreur export PDF : ${e instanceof Error ? e.message : 'inconnue'}`);
    } finally {
      setRelevePdfBusy(false);
    }
  };

  const handleReleveExportExcel = () => {
    const rows = getReleveFilteredInvoices();
    if (rows.length === 0) {
      alert('Aucune facture à exporter pour ces filtres.');
      return;
    }
    const exportData = rows.map((inv, idx) => ({
      'N°': idx + 1,
      'N° facture': inv.invoiceNumber,
      Fournisseur: inv.supplier,
      'Date réception': formatReleveDueDate(inv.date),
      'Échéance': formatReleveDueDate(inv.dueDate),
      'Temps restant': formatTempsRestantEcheance(inv.dueDate),
      Montant: inv.amount,
      Paiement: inv.totalPaid,
      Solde: inv.restAPayer,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Releve');
    const fileName = `Releve_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const statusCardConfigs = [
    {
      key: 'unpaid' as const,
      label: 'Non payées',
      count: unpaidInvoices.length,
      amount: unpaidTotal,
      className:
        'bg-blue-700 text-white border border-blue-800/80 shadow-md hover:bg-blue-800 hover:shadow-lg',
      selectedClass: 'ring-2 ring-white/95 shadow-xl'
    },
    {
      key: 'overdue' as const,
      label: 'Échues',
      count: overdueInvoices.length,
      amount: overdueTotal,
      className:
        'bg-amber-600 text-white border border-amber-700/80 shadow-md hover:bg-amber-700 hover:shadow-lg',
      selectedClass: 'ring-2 ring-white/95 shadow-xl'
    },
    {
      key: 'rejected' as const,
      label: 'Rejetées',
      count: rejectedInvoices.length,
      amount: rejectedTotal,
      className:
        'bg-red-700 text-white border border-red-800/80 shadow-md hover:bg-red-800 hover:shadow-lg',
      selectedClass: 'ring-2 ring-white/95 shadow-xl'
    },
    {
      key: 'paid' as const,
      label: 'Payées',
      count: paidInvoices.length,
      amount: paidTotal,
      className:
        'bg-emerald-700 text-white border border-emerald-800/80 shadow-md hover:bg-emerald-800 hover:shadow-lg',
      selectedClass: 'ring-2 ring-white/95 shadow-xl'
    }
  ];

  const detailInvoicesForCard = (): Invoice[] => {
    switch (detailStatusKey) {
      case 'unpaid':
        return unpaidInvoices;
      case 'overdue':
        return overdueInvoices;
      case 'rejected':
        return rejectedInvoices;
      case 'paid':
        return paidInvoices;
      default:
        return [];
    }
  };

  const handleDetailStatusExportPdf = async () => {
    if (!detailStatusKey) return;
    const rows = detailInvoicesForCard();
    if (rows.length === 0) {
      alert('Aucune facture à exporter.');
      return;
    }
    setDetailPdfBusy(true);
    try {
      const statusLabel = statusCardConfigs.find((c) => c.key === detailStatusKey)?.label ?? detailStatusKey;
      const filterLabel = selectedSupplier
        ? `Fournisseur : ${selectedSupplier}`
        : selectedDossier
          ? `Dossier : ${selectedDossier}`
          : selectedGestionnaire
            ? `Gestionnaire : ${selectedGestionnaire}`
            : selectedClient
              ? `Client : ${selectedClient}`
              : `Titre de transport : ${selectedTransport ?? ''}`;
      const yearPart = detailFiltersUnlocked ? `Année : ${selectedYear}` : '';
      const regionPart = selectedRegion ? `Région : ${selectedRegion}` : 'Région : Toutes';
      const typePart =
        selectedInvoiceType === 'frais-generaux' ? 'Frais généraux' : 'Opérationnel';
      const metaLine = `Statut : ${statusLabel} | ${yearPart} | ${regionPart} | Type : ${typePart}`;
      const totals = rows.reduce(
        (acc, inv) => ({
          montant: acc.montant + inv.amount,
          paiement: acc.paiement + inv.totalPaid,
          solde: acc.solde + inv.restAPayer,
        }),
        { montant: 0, paiement: 0, solde: 0 },
      );
      const safeKey = String(detailStatusKey).replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadSearchDetailStatusPdf({
        rows: rows.map(invoiceToSearchPdfRow),
        totals,
        statusLabel,
        filterLabel,
        metaLine,
        formatMoney,
        fileName: `Detail_${safeKey}_${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch (e) {
      console.error(e);
      alert(`Erreur export PDF : ${e instanceof Error ? e.message : 'inconnue'}`);
    } finally {
      setDetailPdfBusy(false);
    }
  };

  const renderCriteriaListSection = (
    searchPlaceholder: string,
    emptyMessage: string,
    items: SearchCriteriaListItem[],
    selectedKey: string | null,
    onPick: (key: string | null) => void,
  ) => (
    <>
      <div className="mb-3 relative">
        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() => setActiveLeftTab(expandedLeftTab ?? activeLeftTab)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="space-y-2 max-h-[min(40vh,16rem)] overflow-y-auto pr-0.5">
        {items.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm">{emptyMessage}</div>
        ) : (
          items.map((item) => (
            <SearchCriteriaCard
              key={item.key}
              label={item.label}
              count={item.count}
              restAPayer={item.restAPayer}
              isSelected={selectedKey === item.key}
              onClick={() => onPick(selectedKey === item.key ? null : item.key)}
            />
          ))
        )}
      </div>
    </>
  );

  const renderLeftAccordionPanel = (tabId: LeftSearchTab) => {
    switch (tabId) {
      case 'supplier':
        return renderCriteriaListSection(
          'Rechercher un fournisseur...',
          'Aucun fournisseur avec factures non payées',
          getUnpaidSuppliers().map((s) => ({
            key: s.supplier,
            label: s.supplier,
            count: s.count,
            restAPayer: s.restAPayer,
          })),
          selectedSupplier,
          (key) => {
            setSelectedSupplier(key);
            setSelectedDossier(null);
            setSelectedGestionnaire(null);
            setSelectedClient(null);
            setSelectedTransport(null);
          },
        );
      case 'dossier':
        return renderCriteriaListSection(
          'Rechercher un numéro de dossier...',
          'Aucun dossier avec factures non payées',
          getUnpaidDossiers().map((d) => ({
            key: d.dossier,
            label: d.dossier,
            count: d.count,
            restAPayer: d.restAPayer,
          })),
          selectedDossier,
          (key) => {
            setSelectedDossier(key);
            setSelectedSupplier(null);
            setSelectedGestionnaire(null);
            setSelectedClient(null);
            setSelectedTransport(null);
          },
        );
      case 'gestionnaire':
        return renderCriteriaListSection(
          'Rechercher un gestionnaire...',
          'Aucun gestionnaire avec factures non payées',
          getUnpaidManagers().map((m) => ({
            key: m.gestionnaire,
            label: m.gestionnaire,
            count: m.count,
            restAPayer: m.restAPayer,
          })),
          selectedGestionnaire,
          (key) => {
            setSelectedGestionnaire(key);
            setSelectedSupplier(null);
            setSelectedDossier(null);
            setSelectedClient(null);
            setSelectedTransport(null);
          },
        );
      case 'client':
        return renderCriteriaListSection(
          'Rechercher un client...',
          'Aucun client avec factures non payées',
          getUnpaidClients().map((c) => ({
            key: c.client,
            label: c.client,
            count: c.count,
            restAPayer: c.restAPayer,
          })),
          selectedClient,
          (key) => {
            setSelectedClient(key);
            setSelectedSupplier(null);
            setSelectedDossier(null);
            setSelectedGestionnaire(null);
            setSelectedTransport(null);
          },
        );
      case 'transport':
        return renderCriteriaListSection(
          'Rechercher un titre de transport...',
          'Aucun titre de transport avec factures non payées',
          getUnpaidTransports().map((t) => ({
            key: t.transport,
            label: t.transport,
            count: t.count,
            restAPayer: t.restAPayer,
          })),
          selectedTransport,
          (key) => {
            setSelectedTransport(key);
            setSelectedSupplier(null);
            setSelectedDossier(null);
            setSelectedGestionnaire(null);
            setSelectedClient(null);
          },
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white h-screen overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gray-100 p-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{menuTitle}</h1>

        {/* Onglets et Contrôles */}
        <div className="flex items-center justify-between mb-[-20px]">
          {/* Region Tabs */}
          <div className="flex gap-1 flex-wrap">
            {/* If agent has TOUT, show all region tabs */}
            {agent?.REGION === 'TOUT' ? (
              <>
                <button
                  onClick={() => setSelectedRegion('')}
                  className={`px-4 py-0 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                    selectedRegion === '' ? 'font-bold text-black bg-white' : 'text-gray-600'
                  }`}
                >
                  Toutes les régions
                </button>
                <button
                  onClick={() => setSelectedRegion('OUEST')}
                  className={`px-4 py-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                    selectedRegion === 'OUEST' ? 'font-bold text-black bg-white' : 'text-gray-600'
                  }`}
                >
                  OUEST
                </button>
                <button
                  onClick={() => setSelectedRegion('EST')}
                  className={`px-4 py-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                    selectedRegion === 'EST' ? 'font-bold text-black bg-white' : 'text-gray-600'
                  }`}
                >
                  EST
                </button>
                <button
                  onClick={() => setSelectedRegion('SUD')}
                  className={`px-4 py-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                    selectedRegion === 'SUD' ? 'font-bold text-black bg-white' : 'text-gray-600'
                  }`}
                >
                  SUD
                </button>
              </>
            ) : (
              /* Otherwise show only their region */
              <button
                disabled
                className="px-4 py-2 text-sm rounded-t-lg font-bold text-black bg-white"
              >
                {agent?.REGION || 'Région inconnue'}
              </button>
            )}
          </div>

          {/* Boutons Refresh et Export */}
          <div className="flex items-center gap-2">
            {(canViewOperational || canViewFfg) && (
              <select
                value={selectedInvoiceType}
                onChange={(e) => setSelectedInvoiceType(e.target.value as 'operationnel' | 'frais-generaux')}
                className="px-2 py-1 text-sm border border-gray-300 rounded bg-white"
              >
                {canViewOperational && <option value="operationnel">Opérationnel</option>}
                {canViewFfg && <option value="frais-generaux">Frais généraux</option>}
              </select>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-all disabled:opacity-50"
              title="Actualiser les données"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
            <button
              onClick={handleExportToExcel}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-all"
              title="Exporter en Excel"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              type="button"
              onClick={openReleveModal}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-all"
              title="Relevé des factures avec filtres"
            >
              <ClipboardList size={14} />
              <span className="hidden sm:inline">Relevé</span>
            </button>
          </div>
        </div>
      </div>

        {/* Filtres année + période (uniquement après choix fournisseur ou dossier) */}
        {detailFiltersUnlocked && (
        <div className="bg-white p-4 rounded-lg mt-[-20px] flex w-full justify-center overflow-x-auto [scrollbar-width:thin]">
          <div className="inline-flex max-w-full flex-nowrap items-center justify-center gap-4 px-1 py-1 min-h-[3rem]">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              title="Année (date de réception)"
              className="shrink-0 min-w-[5rem] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            {(
              [
                { key: '1m' as const, label: '1 mois' },
                { key: '3m' as const, label: '3 mois' },
                { key: '6m' as const, label: '6 mois' },
                { key: '1y' as const, label: '1 année' },
                { key: '2y' as const, label: '2 ans' }
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => applySearchPeriodPreset(key)}
                className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  searchPeriodPreset === key
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
            <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-gray-600">
              <span className="font-medium text-gray-700">Du</span>
              <input
                type="date"
                value={filterDateStart}
                onChange={(e) => {
                  setFilterDateStart(e.target.value);
                  setSearchPeriodPreset(null);
                }}
                className="min-w-[10.5rem] shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-gray-600">
              <span className="font-medium text-gray-700">Au</span>
              <input
                type="date"
                value={filterDateEnd}
                onChange={(e) => {
                  setFilterDateEnd(e.target.value);
                  setSearchPeriodPreset(null);
                }}
                className="min-w-[10.5rem] shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <button
              type="button"
              onClick={resetSearchBarFilters}
              title="Réinitialiser année et plage de dates"
              aria-label="Réinitialiser les filtres de dates"
              className="shrink-0 rounded-lg border border-gray-400 bg-white p-2.5 text-gray-700 transition hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
        )}

      {/* Content - Two Column Layout */}
      {loading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <p className="text-gray-500 text-lg">Chargement des données...</p>
        </div>
      ) : (
        <div className="px-4 pb-4 overflow-hidden flex-1 min-h-0">
          <div className={`flex h-[calc(100%-0.5rem)] min-h-0 gap-0 transition-all duration-300 ease-out ${
            hasLeftSelection ? 'lg:gap-4' : ''
          }`}>
            {/* Colonne gauche ~20 % — listes */}
            <div className={`flex-shrink-0 transition-all duration-300 ease-out ${
              hasLeftSelection
                ? 'w-full lg:basis-[24%] lg:max-w-[24%] lg:min-w-[15rem] lg:shrink-0 lg:grow-0 lg:border-r-4 lg:border-blue-200 lg:pr-4'
                : 'w-full lg:w-80 lg:min-w-[15rem]'
            } border border-gray-200 rounded-lg bg-white overflow-hidden h-full min-h-0 flex flex-col pb-2`}>
              
              {/* Accordéon critères — contenu sous chaque onglet */}
              <div
                className="flex-1 min-h-0 overflow-y-auto"
                role="region"
                aria-label="Critères de recherche"
              >
                {leftSearchTabs.map((tab) => {
                  const isExpanded = expandedLeftTab === tab.id;
                  const panelId = `search-accordion-panel-${tab.id}`;
                  return (
                    <section key={tab.id} className="border-b border-gray-200 last:border-b-0">
                      <button
                        type="button"
                        id={`search-accordion-trigger-${tab.id}`}
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        onClick={() => toggleLeftAccordion(tab.id)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                          isExpanded
                            ? 'border-l-4 border-l-blue-600 bg-white text-gray-900'
                            : 'border-l-4 border-l-transparent bg-gray-50 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <ChevronDown
                          size={16}
                          className={`shrink-0 text-gray-500 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          aria-hidden
                        />
                      </button>
                      {isExpanded && (
                        <div
                          id={panelId}
                          role="region"
                          aria-labelledby={`search-accordion-trigger-${tab.id}`}
                          className="border-t border-gray-100 bg-white px-3 py-3"
                        >
                          {renderLeftAccordionPanel(tab.id)}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>

            {/* Right column ~80 % — détail factures */}
            {hasLeftSelection && (
              <div className="w-full lg:min-w-0 lg:flex-1 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-lg transition-all duration-300 ease-out animate-fadeIn h-full min-h-0 flex flex-col pb-2">
                <div className="flex h-full min-h-0 flex-col overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
                  <p className="text-sm font-semibold text-blue-900">
                    Factures pour:{' '}
                    <span className="text-blue-700">
                      {selectedSupplier ??
                        selectedDossier ??
                        selectedGestionnaire ??
                        selectedClient ??
                        selectedTransport}
                    </span>
                    {selectedDossier && (
                      <span className="text-xs text-blue-600 ml-2">(Numéro de dossier)</span>
                    )}
                    {selectedGestionnaire && (
                      <span className="text-xs text-blue-600 ml-2">(Gestionnaire)</span>
                    )}
                    {selectedClient && (
                      <span className="text-xs text-blue-600 ml-2">(Client)</span>
                    )}
                    {selectedTransport && (
                      <span className="text-xs text-blue-600 ml-2">(Titre de transport)</span>
                    )}
                  </p>
                </div>
                <div className="overflow-hidden flex-1 min-h-0 flex flex-col">
                  <div className="h-full overflow-y-auto flex flex-col">
                    <div className="grid grid-cols-2 gap-3 p-4 shrink-0">
                      {statusCardConfigs.map((card) => {
                        const selected = detailStatusKey === card.key;
                        return (
                          <button
                            key={card.key}
                            type="button"
                            onClick={() =>
                              setDetailStatusKey((prev) => (prev === card.key ? null : card.key))
                            }
                            className={[
                              'text-left rounded-xl pl-3 pr-3 py-3 transition-all duration-200',
                              card.className,
                              selected ? card.selectedClass : ''
                            ].join(' ')}
                          >
                            <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">
                              {card.label}
                            </p>
                            <p className="text-sm text-white/95 mt-2">
                              <span className="font-semibold text-white tabular-nums">{card.count}</span>{' '}
                              facture{card.count !== 1 ? 's' : ''}
                            </p>
                            <p className="text-sm font-semibold text-white mt-1 tabular-nums">
                              {card.key === 'paid' ? 'Montant payé : ' : 'Montant : '}
                              {formatMoney(card.amount)}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    {detailStatusKey && (
                      <div className="border-t border-gray-200 bg-gray-50/90 px-3 pb-4 flex-1 min-h-0 flex flex-col">
                        <div className="flex items-center justify-between gap-2 py-2 shrink-0">
                          <p className="text-xs font-semibold text-gray-700">
                            Détail —{' '}
                            {statusCardConfigs.find((c) => c.key === detailStatusKey)?.label ?? ''}
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleDetailStatusExportPdf()}
                            disabled={detailPdfBusy || detailInvoicesForCard().length === 0}
                            className="inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-500 transition hover:bg-white hover:text-slate-800 hover:shadow-sm active:scale-95 disabled:pointer-events-none disabled:opacity-35"
                            title={
                              detailInvoicesForCard().length === 0
                                ? 'Aucune ligne à exporter'
                                : 'Exporter ce tableau en PDF'
                            }
                            aria-label="Exporter le détail en PDF"
                          >
                            {detailPdfBusy ? (
                              <RefreshCw size={18} className="animate-spin text-slate-700" />
                            ) : (
                              <FileDown size={18} strokeWidth={2} />
                            )}
                          </button>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white flex-1 min-h-0">
                          <table className="w-full text-xs min-w-[1160px]">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-900">N° Facture</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-900">Fournisseur</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-900">Client</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-900">Date réception</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-900">Date d&apos;échéance</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-900">Temps restant</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-900">Montant facture</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-900">Montant payé</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-900">Solde à payer</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailInvoicesForCard().length === 0 ? (
                                <tr>
                                  <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                                    Aucune facture
                                  </td>
                                </tr>
                              ) : (
                                detailInvoicesForCard().map((inv) => {
                                  const temps = formatTempsRestantEcheance(inv.dueDate);
                                  const tempsClass =
                                    temps.includes('retard') || isReleveInvoiceEchue(inv)
                                      ? 'text-red-700 font-semibold'
                                      : temps === "Aujourd'hui"
                                        ? 'text-amber-700 font-semibold'
                                        : 'text-gray-700';
                                  return (
                                  <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="px-3 py-2">
                                      <button
                                        type="button"
                                        onClick={() => handleInvoiceClick(inv)}
                                        className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                      >
                                        {inv.invoiceNumber}
                                      </button>
                                    </td>
                                    <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={inv.supplier}>
                                      {inv.supplier}
                                    </td>
                                    <td
                                      className="px-3 py-2 text-gray-700 max-w-[140px] truncate"
                                      title={inv.client.trim() || undefined}
                                    >
                                      {inv.client.trim() || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-gray-700">
                                      {new Date(inv.date).toLocaleDateString('fr-FR')}
                                    </td>
                                    <td
                                      className={`px-3 py-2 text-right tabular-nums ${
                                        isReleveInvoiceEchue(inv) ? 'font-semibold text-red-800' : 'text-gray-700'
                                      }`}
                                    >
                                      {formatReleveDueDate(inv.dueDate)}
                                    </td>
                                    <td className={`px-3 py-2 text-right ${tempsClass}`}>{temps}</td>
                                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                                      {formatMoney(inv.amount)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                                      {formatMoney(inv.totalPaid)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                      <span className="inline-block bg-red-500 text-white px-2 py-0.5 rounded text-[11px]">
                                        {formatMoney(inv.restAPayer)}
                                      </span>
                                    </td>
                                  </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showViewInvoiceModal && selectedInvoiceForModal && (
        <ViewInvoiceModal
          invoice={selectedInvoiceForModal}
          onClose={() => setShowViewInvoiceModal(false)}
        />
      )}
      {showPaiementModal && selectedInvoiceForModal && (
        <PaiementModal
          invoice={selectedInvoiceForModal}
          onClose={() => setShowPaiementModal(false)}
          readOnly={true}
        />
      )}

      {showReleveModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="releve-modal-title"
        >
          <div className="flex w-full max-w-6xl flex-col rounded-xl border border-gray-200/80 bg-white shadow-xl h-[min(900px,96vh)] max-h-[96vh]">
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 shrink-0" data-print-exclude>
              <h2 id="releve-modal-title" className="text-xl font-semibold text-gray-900 truncate">
                Relevé
              </h2>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleReleveExportPdf()}
                  disabled={relevePdfBusy || releveRows.length === 0}
                  className="inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-red-900 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
                  title={
                    releveRows.length === 0
                      ? 'Aucune ligne à exporter'
                      : 'Exporter le relevé en PDF'
                  }
                  aria-label="Exporter le relevé en PDF"
                >
                  {relevePdfBusy ? (
                    <RefreshCw size={20} className="animate-spin text-slate-700" />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-red-700/35 bg-red-50 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-red-800 shadow-sm">
                      <FileText size={17} strokeWidth={2.25} className="shrink-0 text-red-700" aria-hidden />
                      <span>PDF</span>
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleReleveExportExcel}
                  disabled={releveRows.length === 0}
                  className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-emerald-600 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
                  title={
                    releveRows.length === 0
                      ? 'Aucune ligne à exporter'
                      : 'Exporter le relevé au format Excel (.xlsx)'
                  }
                  aria-label="Exporter le relevé en Excel"
                >
                  <FileSpreadsheet size={20} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowReleveModal(false)}
                  className="p-2 rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 active:scale-95"
                  title="Fermer le relevé"
                  aria-label="Fermer le relevé"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3 space-y-3" data-print-exclude>
                <div className="flex w-full flex-wrap items-end justify-between gap-x-4 gap-y-2">
                  <div className="relative z-[100] min-w-0 max-w-md flex-1">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Fournisseur
                    </label>
                    <input
                      type="text"
                      value={releveSupplierInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        setReleveSupplierInput(v);
                        setReleveSupplier('');
                        setReleveSupplierSuggestionsOpen(true);
                      }}
                      onFocus={() => setReleveSupplierSuggestionsOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => setReleveSupplierSuggestionsOpen(false), 200);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setReleveSupplierSuggestionsOpen(false);
                      }}
                      placeholder="Tapez pour filtrer ou choisir un fournisseur…"
                      autoComplete="off"
                      className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                  {releveSupplierSuggestionsOpen && (
                    <ul
                      className="absolute left-0 right-0 top-full z-[200] mt-1 max-h-52 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-xl"
                      role="listbox"
                    >
                      <li>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-gray-600 hover:bg-indigo-50"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setReleveSupplier('');
                            setReleveSupplierInput('');
                            setReleveSupplierSuggestionsOpen(false);
                          }}
                        >
                          Tous les fournisseurs
                        </button>
                      </li>
                      {releveSupplierPickList.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-gray-500">Aucun fournisseur correspondant.</li>
                      ) : (
                        releveSupplierPickList.map((s) => (
                          <li key={s}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-gray-900 hover:bg-indigo-50"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setReleveSupplier(s);
                                setReleveSupplierInput(s);
                                setReleveSupplierSuggestionsOpen(false);
                              }}
                            >
                              {s}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                  </div>
                  {releveRows.length > 0 && (
                    <span className="inline-flex shrink-0 items-center self-end rounded-full border border-slate-300/90 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 tabular-nums shadow-sm">
                      {releveRows.length} facture{releveRows.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex w-full justify-center overflow-x-auto [scrollbar-width:thin]">
                  <div className="inline-flex max-w-full flex-nowrap items-center justify-center gap-4 px-1 py-1 min-h-[3rem]">
                    <select
                      value={releveYear}
                      onChange={(e) => setReleveYear(e.target.value)}
                      title="Année (date de réception)"
                      className="shrink-0 min-w-[5rem] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    {(
                      [
                        { key: '1m' as const, label: '1 mois' },
                        { key: '3m' as const, label: '3 mois' },
                        { key: '6m' as const, label: '6 mois' },
                        { key: '1y' as const, label: '1 année' },
                        { key: '2y' as const, label: '2 ans' }
                      ] as const
                    ).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyRelevePeriodPreset(key)}
                        className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          relevePeriodPreset === key
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-gray-600">
                      <span className="font-medium text-gray-700">Du</span>
                      <input
                        type="date"
                        value={releveDateStart}
                        onChange={(e) => {
                          setReleveDateStart(e.target.value);
                          setRelevePeriodPreset(null);
                        }}
                        className="min-w-[10.5rem] shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                    <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-gray-600">
                      <span className="font-medium text-gray-700">Au</span>
                      <input
                        type="date"
                        value={releveDateEnd}
                        onChange={(e) => {
                          setReleveDateEnd(e.target.value);
                          setRelevePeriodPreset(null);
                        }}
                        className="min-w-[10.5rem] shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={resetReleveFilters}
                      title="Réinitialiser année et plage de dates"
                      aria-label="Réinitialiser les filtres de dates"
                      className="shrink-0 rounded-lg border border-gray-400 bg-white p-2.5 text-gray-700 transition hover:bg-gray-50"
                    >
                      <RotateCcw className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 flex flex-col">
                <div className="flex h-full min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-auto p-0.5">
                    <table className="w-full min-w-[980px] text-sm leading-snug border-collapse">
                      <thead className="sticky top-0 z-20 border-b border-gray-200 bg-gray-100 shadow-sm">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-800">N°</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-800">N° facture</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-800">Fournisseur</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-800">Date réception</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-800">Échéance</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-800">Montant</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-800">Paiement</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-800">Solde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {releveRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                              Aucune facture pour ces filtres.
                            </td>
                          </tr>
                        ) : (
                          releveRows.map((inv, idx) => (
                            <tr
                              key={inv.id}
                              className={`border-b border-gray-100 transform transition duration-200 ease-out hover:z-[1] hover:scale-[1.003] hover:shadow-md motion-reduce:hover:scale-100 ${
                                isReleveInvoiceEchue(inv)
                                  ? 'bg-red-50/90 hover:bg-red-50'
                                  : 'hover:bg-gray-50/80'
                              }`}
                            >
                              <td
                                className={`relative px-3 py-2 text-gray-600 tabular-nums align-middle ${
                                  isReleveInvoiceEchue(inv)
                                    ? "pl-4 before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-red-600 before:content-['']"
                                    : ''
                                }`}
                              >
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2 align-middle">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowReleveModal(false);
                                    handleInvoiceClick(inv);
                                  }}
                                  className="text-left text-sm font-medium text-indigo-600 hover:underline"
                                >
                                  {inv.invoiceNumber}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-left text-gray-800 align-middle max-w-[14rem] truncate" title={inv.supplier}>
                                {inv.supplier}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-800 align-middle">
                                {formatReleveDueDate(inv.date)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right tabular-nums align-middle ${
                                  isReleveInvoiceEchue(inv) ? 'font-medium text-red-800' : 'text-gray-800'
                                }`}
                              >
                                {formatReleveDueDate(inv.dueDate)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-800 align-middle font-bold">
                                {formatMoney(inv.amount)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-800 align-middle font-bold">
                                {formatMoney(inv.totalPaid)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums align-middle font-bold">
                                {isReleveInvoiceFullyPaid(inv) ? (
                                  <span className="inline-flex items-center justify-end text-lg leading-none text-emerald-600" title="Payée">
                                    −
                                  </span>
                                ) : (
                                  <span className="text-red-700">{formatMoney(inv.restAPayer)}</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {releveRows.length > 0 && (
                    <footer className="shrink-0 z-30 border-t-2 border-slate-300 bg-slate-100 px-4 py-2 shadow-[0_-6px_16px_rgba(0,0,0,0.06)]">
                      <table className="ml-auto w-auto border-collapse text-sm text-gray-900 tabular-nums">
                        <tbody>
                          <tr>
                            <td className="py-0.5 pr-3 text-right font-semibold text-gray-800 whitespace-nowrap align-baseline">
                              Montant Total :
                            </td>
                            <td className="w-[9.25rem] py-0.5 text-right font-bold align-baseline">
                              {formatMoney(releveTotals.montant)}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-0.5 pr-3 text-right font-semibold text-gray-800 whitespace-nowrap align-baseline">
                              Montant payé :
                            </td>
                            <td className="py-0.5 text-right font-bold align-baseline">{formatMoney(releveTotals.paiement)}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 pr-3 text-right font-semibold text-gray-800 whitespace-nowrap align-baseline">
                              Solde à payer :
                            </td>
                            <td className="py-0.5 text-right font-bold text-red-800 align-baseline">
                              {formatMoney(releveTotals.solde)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </footer>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchPage;

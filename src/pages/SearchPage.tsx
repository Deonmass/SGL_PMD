import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw, Download, ClipboardList, X, FileDown, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { supabase } from '../services/supabase';
import * as XLSX from 'xlsx';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import logo2Url from '../images/logo2.png';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../contexts/AuthContext';
import AccessDenied from '../components/AccessDenied';
import ViewInvoiceModal from '../components/ViewInvoiceModal';
import PaiementModal from '../components/PaiementModal';
import { Invoice as GlobalInvoice } from '../types';
import { useDataRefresh, REFRESH_EVENTS } from '../hooks/useDataRefresh';
import { isInvoiceEffectivelyRejected } from '../utils/factureRejetHistory';

function stripDiacriticsForPdf(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\xFF]/g, '?');
}

function formatReleveDueDate(d: string | null): string {
  if (!d) return '-';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '-';
  return t.toLocaleDateString('fr-FR');
}

function isReleveInvoiceEchue(inv: Invoice): boolean {
  return inv.status === 'ÉCHUE';
}

function isReleveInvoiceFullyPaid(inv: Invoice): boolean {
  return inv.status === 'PAYÉE';
}

async function embedSearchPagePdfFontsAndLogo(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  let font = await pdf.embedFont(StandardFonts.Helvetica);
  let fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  try {
    const base = `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '')}/`;
    const calibri = await fetch(`${base}fonts/Calibri.ttf`);
    if (calibri.ok) {
      const regBuf = await calibri.arrayBuffer();
      const calBold = await fetch(`${base}fonts/Calibri-Bold.ttf`);
      const boldBuf = calBold.ok ? await calBold.arrayBuffer() : regBuf;
      // subset:false évite un bug fréquent (caractères espacés / illisibles) avec TTF + fontkit
      font = await pdf.embedFont(regBuf, { subset: false });
      fontBold = await pdf.embedFont(boldBuf, { subset: false });
    } else {
      const regBuf = await fetch(`${base}fonts/Carlito-Regular.ttf`).then((r) => r.arrayBuffer());
      const boldBuf = await fetch(`${base}fonts/Carlito-Bold.ttf`).then((r) => r.arrayBuffer());
      font = await pdf.embedFont(regBuf, { subset: false });
      fontBold = await pdf.embedFont(boldBuf, { subset: false });
    }
  } catch (fontErr) {
    console.warn('PDF: polices Calibri/Carlito non chargees, Helvetica utilisee.', fontErr);
  }

  let logoImage: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  try {
    const logoBuf = await fetch(logo2Url).then((r) => r.arrayBuffer());
    try {
      logoImage = await pdf.embedPng(logoBuf);
    } catch {
      logoImage = await pdf.embedJpg(logoBuf);
    }
  } catch (logoErr) {
    console.warn('PDF: logo non charge.', logoErr);
  }

  return { font, fontBold, logoImage };
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
  const [relevePdfExporting, setRelevePdfExporting] = useState(false);
  const [detailPdfExporting, setDetailPdfExporting] = useState(false);
  const [releveSupplierInput, setReleveSupplierInput] = useState('');
  const [releveSupplierSuggestionsOpen, setReleveSupplierSuggestionsOpen] = useState(false);

  // Selected supplier state
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  
  // Tab state for left column
  const [activeLeftTab, setActiveLeftTab] = useState<'supplier' | 'dossier'>('supplier');
  
  // Selected dossier state
  const [selectedDossier, setSelectedDossier] = useState<string | null>(null);

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

  // Filtres année + plage (visibles seulement après choix fournisseur ou dossier) — par défaut : année seule
  const [filterDateStart, setFilterDateStart] = useState<string>('');
  const [filterDateEnd, setFilterDateEnd] = useState<string>('');
  const [searchPeriodPreset, setSearchPeriodPreset] = useState<SearchPeriodPreset | null>(null);

  const detailFiltersUnlocked = !!(selectedSupplier || selectedDossier);

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
        .select('ID, "Numéro de facture", "Numéro de dossier", Fournisseur, "Gestionnaire", "Centre de coût", "Date de réception", Montant, Statut, Devise, "Région", "Échéance", "Catégorie fournisseur", Rejet');

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
      setSelectedDossier(null);
    }
  }, [selectedInvoiceType, activeLeftTab]);

  useEffect(() => {
    loadSearchData();
  }, [loadSearchData]);

  useEffect(() => {
    setDetailStatusKey(null);
  }, [selectedSupplier, selectedDossier]);

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

  const formatMoney = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleReleveExportPdf = async () => {
    const rows = getReleveFilteredInvoices();
    if (rows.length === 0) {
      alert('Aucune facture à exporter pour ces filtres.');
      return;
    }
    setRelevePdfExporting(true);
    try {
      const pdf = await PDFDocument.create();
      const { font, fontBold, logoImage } = await embedSearchPagePdfFontsAndLogo(pdf);

      const pageWidth = 595;
      const pageHeight = 842;
      const margin = 40;
      const contentW = pageWidth - margin * 2;

      const C = {
        gray900: rgb(0.067, 0.094, 0.153),
        gray800: rgb(0.122, 0.161, 0.216),
        gray700: rgb(0.22, 0.255, 0.318),
        gray600: rgb(0.294, 0.333, 0.388),
        gray100: rgb(0.953, 0.957, 0.965),
        gray50: rgb(0.976, 0.98, 0.984),
        gray200: rgb(0.898, 0.906, 0.922),
        indigo600: rgb(0.31, 0.275, 0.898),
        indigo50: rgb(0.933, 0.949, 1),
        indigo100: rgb(0.78, 0.82, 1),
        red700: rgb(0.725, 0.11, 0.11),
        red800: rgb(0.6, 0.094, 0.094),
        slate100: rgb(0.945, 0.961, 0.976),
        slate300: rgb(0.796, 0.835, 0.882),
        rowEchueBg: rgb(1, 0.96, 0.96),
        emerald600: rgb(0.02, 0.59, 0.41)
      };

      const colGap = 4;
      const colAmt = 62;
      const colDue = 56;
      const colRecv = 54;
      const xSoldeL = pageWidth - margin - colAmt;
      const xPaiementL = xSoldeL - colGap - colAmt;
      const xMontantL = xPaiementL - colGap - colAmt;
      const xEcheanceL = xMontantL - colGap - colDue;
      const xRecvL = xEcheanceL - colGap - colRecv;
      const xFacture = margin + 30;
      const maxFactureW = Math.max(56, xRecvL - colGap - xFacture - 4);

      const titleSize = 18;
      const metaSize = 10;
      const headSize = 10;
      const bodySize = 10;
      const rowBodyH = 16;
      const rowHeadH = 20;
      const rowFootH = 62;

      let page = pdf.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;

      const drawLogoTopRightSmall = () => {
        if (!logoImage) return;
        const targetW = 56;
        const scale = targetW / logoImage.width;
        const w = targetW;
        const h = logoImage.height * scale;
        const x = pageWidth - margin - w;
        const yImg = pageHeight - margin - h;
        page.drawImage(logoImage, { x, y: yImg, width: w, height: h });
      };

      const totals = rows.reduce(
        (acc, inv) => ({
          montant: acc.montant + inv.amount,
          paiement: acc.paiement + inv.totalPaid,
          solde: acc.solde + inv.restAPayer
        }),
        { montant: 0, paiement: 0, solde: 0 }
      );

      const newPageIfNeeded = (needed: number) => {
        if (y < margin + needed) {
          page = pdf.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
      };

      const drawTextRight = (
        text: string,
        xRight: number,
        baselineY: number,
        size: number,
        f: typeof font,
        color = C.gray800
      ) => {
        const safe = stripDiacriticsForPdf(text);
        const w = f.widthOfTextAtSize(safe, size);
        page.drawText(safe, { x: xRight - w, y: baselineY, size, font: f, color });
      };

      const truncateToWidth = (raw: string, maxW: number, f: typeof font, size: number) => {
        let s = stripDiacriticsForPdf(raw);
        if (f.widthOfTextAtSize(s, size) <= maxW) return s;
        const ell = '...';
        while (s.length > 1 && f.widthOfTextAtSize(s.slice(0, -1) + ell, size) > maxW) s = s.slice(0, -1);
        return s.slice(0, -1) + ell;
      };

      newPageIfNeeded(260);

      const topY = pageHeight - margin;
      if (logoImage) {
        const logoTargetW = 112;
        const logoScale = logoTargetW / logoImage.width;
        const logoW = logoTargetW;
        const logoH = logoImage.height * logoScale;
        const logoX = (pageWidth - logoW) / 2;
        page.drawImage(logoImage, {
          x: logoX,
          y: topY - logoH,
          width: logoW,
          height: logoH
        });
        y = topY - logoH - 14;
      }

      const soaTitle = 'STATEMENT OF ACCOUNT (SOA)';
      const titleSizePdf = 13;
      const titleSafe = stripDiacriticsForPdf(soaTitle);
      const titleW = fontBold.widthOfTextAtSize(titleSafe, titleSizePdf);
      const titleX = (pageWidth - titleW) / 2;
      const titleBaselineY = y - titleSizePdf * 0.25;
      page.drawText(titleSafe, {
        x: titleX,
        y: titleBaselineY,
        size: titleSizePdf,
        font: fontBold,
        color: C.gray900
      });
      const underlineY = titleBaselineY - 4;
      page.drawLine({
        start: { x: titleX, y: underlineY },
        end: { x: titleX + titleW, y: underlineY },
        thickness: 0.9,
        color: C.gray900
      });
      y = underlineY - 18;

      const gutter = 14;
      const half = (contentW - gutter) / 2;
      const leftColX = margin;
      const rightColMaxW = half - 2;
      const lineGap = 11;
      const bodyPdf = 9;
      const headPdf = 10;

      const periodCoveredEn = getSoaPeriodCoveredLabel(releveYear, releveDateStart, releveDateEnd);
      const soaDateEn = new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      type SoaRow = { text: string; bold?: boolean; size?: number };
      const leftSoa: SoaRow[] = [
        { text: 'RELEVÉ DE COMPTE', bold: true, size: headPdf },
        { text: 'Companie : SHIPPING GL SARL', size: bodyPdf },
        { text: 'Addresse : 157 Avenu du livre, Kinshasa/Gombe', size: bodyPdf },
        { text: 'RCCM : CD/KNG/RCCM/24-B-02901', size: bodyPdf },
        { text: 'NIF : A1519206T', size: bodyPdf },
        { text: 'Contact : accounting@shippinggreatlakes.com', size: bodyPdf },
        { text: `Prepared By : ${agent?.Nom || '-'}`, size: bodyPdf },
        { text: `Date : ${soaDateEn}`, size: bodyPdf },
        { text: 'Currency : USD', size: bodyPdf }
      ];
      const rightSoa: SoaRow[] = [
        { text: 'ACCOUNT INFORMATION', bold: true, size: headPdf },
        { text: `Supplier / Client : ${releveSupplier || '-'}`, size: bodyPdf },
        {
          text: `Account Number : ${releveSupplier ? supplierToSoaAccountNumber(releveSupplier) : '—'}`,
          size: bodyPdf
        },
        { text: 'Payment Terms : TBA', size: bodyPdf },
        { text: `Period Covered : ${periodCoveredEn}`, size: bodyPdf }
      ];

      const drawSoaColumn = (startX: number, startY: number, colW: number, rows: SoaRow[]) => {
        let curY = startY;
        for (const row of rows) {
          const sz = row.size ?? metaSize;
          const f = row.bold ? fontBold : font;
          const display = truncateToWidth(stripDiacriticsForPdf(row.text), colW, f, sz);
          page.drawText(display, { x: startX, y: curY - sz * 0.25, size: sz, font: f, color: C.gray800 });
          curY -= lineGap;
        }
        return curY;
      };

      const drawSoaColumnRight = (xRightAlign: number, startY: number, colW: number, rows: SoaRow[]) => {
        let curY = startY;
        for (const row of rows) {
          const sz = row.size ?? metaSize;
          const f = row.bold ? fontBold : font;
          const display = truncateToWidth(stripDiacriticsForPdf(row.text), colW, f, sz);
          const tw = f.widthOfTextAtSize(display, sz);
          page.drawText(display, {
            x: xRightAlign - tw,
            y: curY - sz * 0.25,
            size: sz,
            font: f,
            color: C.gray800
          });
          curY -= lineGap;
        }
        return curY;
      };

      const blockTop = y;
      const yLeftEnd = drawSoaColumn(leftColX, blockTop, half - 2, leftSoa);
      const yRightEnd = drawSoaColumnRight(pageWidth - margin, blockTop, rightColMaxW, rightSoa);
      y = Math.min(yLeftEnd, yRightEnd) - 16;
      page.drawLine({
        start: { x: margin, y: y + 8 },
        end: { x: pageWidth - margin, y: y + 8 },
        thickness: 0.5,
        color: C.gray200
      });
      y -= 4;

      const paintTableHeader = () => {
        page.drawRectangle({
          x: margin,
          y: y - rowHeadH + 4,
          width: contentW,
          height: rowHeadH,
          color: C.gray100,
          borderColor: C.gray200,
          borderWidth: 0.5
        });
        const b = y - 14;
        page.drawText('N°', { x: margin + 10, y: b, size: headSize, font: fontBold, color: C.gray800 });
        page.drawText(stripDiacriticsForPdf('N° facture'), {
          x: xFacture,
          y: b,
          size: headSize,
          font: fontBold,
          color: C.gray800
        });
        drawTextRight(stripDiacriticsForPdf('Date reception'), xRecvL + colRecv - 4, b, headSize, fontBold, C.gray800);
        drawTextRight("Date d'echeance", xEcheanceL + colDue - 4, b, headSize, fontBold, C.gray800);
        drawTextRight('Montant', xMontantL + colAmt - 4, b, headSize, fontBold, C.gray800);
        drawTextRight('Paiement', xPaiementL + colAmt - 4, b, headSize, fontBold, C.gray800);
        drawTextRight('Solde', xSoldeL + colAmt - 4, b, headSize, fontBold, C.gray800);
        y -= rowHeadH + 2;
      };

      const advancePageWithTableHeader = () => {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        drawLogoTopRightSmall();
        paintTableHeader();
      };

      const drawBodyRow = (idx: number, inv: (typeof rows)[0], zebra: boolean) => {
        if (y < margin + rowBodyH + 4) {
          advancePageWithTableHeader();
        }
        const rowTop = y - rowBodyH + 3;
        if (isReleveInvoiceEchue(inv)) {
          page.drawRectangle({
            x: margin,
            y: rowTop,
            width: contentW,
            height: rowBodyH,
            color: C.rowEchueBg
          });
          page.drawRectangle({
            x: margin,
            y: rowTop,
            width: 3,
            height: rowBodyH,
            color: C.red700
          });
        } else if (zebra) {
          page.drawRectangle({
            x: margin,
            y: rowTop,
            width: contentW,
            height: rowBodyH,
            color: C.gray50
          });
        }
        const b = y - 12;
        page.drawText(String(idx + 1), {
          x: margin + 10,
          y: b,
          size: bodySize,
          font: font,
          color: C.gray600
        });
        const invNo = truncateToWidth(inv.invoiceNumber, maxFactureW, font, bodySize);
        page.drawText(invNo, {
          x: xFacture,
          y: b,
          size: bodySize,
          font: fontBold,
          color: C.indigo600
        });
        drawTextRight(
          formatReleveDueDate(inv.date),
          xRecvL + colRecv - 4,
          b,
          bodySize,
          font,
          C.gray800
        );
        const echeanceColor = isReleveInvoiceEchue(inv) ? C.red700 : C.gray800;
        drawTextRight(
          formatReleveDueDate(inv.dueDate),
          xEcheanceL + colDue - 4,
          b,
          bodySize,
          font,
          echeanceColor
        );
        drawTextRight(formatMoney(inv.amount), xMontantL + colAmt - 4, b, bodySize, fontBold, C.gray800);
        drawTextRight(formatMoney(inv.totalPaid), xPaiementL + colAmt - 4, b, bodySize, fontBold, C.gray800);
        if (isReleveInvoiceFullyPaid(inv)) {
          drawTextRight('-', xSoldeL + colAmt - 4, b, bodySize, fontBold, C.emerald600);
        } else {
          drawTextRight(formatMoney(inv.restAPayer), xSoldeL + colAmt - 4, b, bodySize, fontBold, C.red700);
        }
        page.drawLine({
          start: { x: margin, y: y - rowBodyH + 2 },
          end: { x: pageWidth - margin, y: y - rowBodyH + 2 },
          thickness: 0.35,
          color: C.gray200
        });
        y -= rowBodyH;
      };

      const drawFooterRow = () => {
        if (y < margin + rowFootH + 8) {
          advancePageWithTableHeader();
        }
        page.drawRectangle({
          x: margin,
          y: y - rowFootH + 4,
          width: contentW,
          height: rowFootH,
          color: C.slate100,
          borderColor: C.slate300,
          borderWidth: 1
        });
        const totLabel = stripDiacriticsForPdf(
          `Totaux (${rows.length} facture${rows.length > 1 ? 's' : ''})`
        );
        page.drawText(totLabel, {
          x: margin + 10,
          y: y - 26,
          size: bodySize,
          font: fontBold,
          color: C.gray900
        });
        const xRight = pageWidth - margin - 10;
        const lineGapF = 15;
        let ty = y - 18;
        drawTextRight(
          stripDiacriticsForPdf(`Montant Total : ${formatMoney(totals.montant)}`),
          xRight,
          ty,
          bodySize,
          fontBold,
          C.gray900
        );
        ty -= lineGapF;
        drawTextRight(
          stripDiacriticsForPdf(`Montant paye : ${formatMoney(totals.paiement)}`),
          xRight,
          ty,
          bodySize,
          fontBold,
          C.gray900
        );
        ty -= lineGapF;
        drawTextRight(
          stripDiacriticsForPdf(`Solde a payer : ${formatMoney(totals.solde)}`),
          xRight,
          ty,
          bodySize,
          fontBold,
          C.red800
        );
        y -= rowFootH;
      };

      newPageIfNeeded(rowHeadH + 12);
      paintTableHeader();
      rows.forEach((inv, idx) => drawBodyRow(idx, inv, idx % 2 === 1));
      drawFooterRow();

      const bytes = await pdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Releve_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(`Erreur export PDF : ${e instanceof Error ? e.message : 'inconnue'}`);
    } finally {
      setRelevePdfExporting(false);
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
      'Date réception': formatReleveDueDate(inv.date),
      'Échéance': formatReleveDueDate(inv.dueDate),
      Montant: inv.amount,
      Paiement: inv.totalPaid,
      Solde: inv.restAPayer,
      Fournisseur: inv.supplier
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
    const statusLabel = statusCardConfigs.find((c) => c.key === detailStatusKey)?.label ?? detailStatusKey;
    const filterLabel = selectedSupplier
      ? `Fournisseur : ${selectedSupplier}`
      : `Dossier : ${selectedDossier ?? ''}`;

    setDetailPdfExporting(true);
    try {
      const pdf = await PDFDocument.create();
      const { font, fontBold, logoImage } = await embedSearchPagePdfFontsAndLogo(pdf);
      const pageWidth = 595;
      const pageHeight = 842;
      const margin = 40;
      const contentW = pageWidth - margin * 2;

      const C = {
        gray900: rgb(0.067, 0.094, 0.153),
        gray800: rgb(0.122, 0.161, 0.216),
        gray700: rgb(0.22, 0.255, 0.318),
        gray600: rgb(0.294, 0.333, 0.388),
        gray100: rgb(0.953, 0.957, 0.965),
        gray50: rgb(0.976, 0.98, 0.984),
        gray200: rgb(0.898, 0.906, 0.922),
        indigo600: rgb(0.31, 0.275, 0.898),
        indigo50: rgb(0.933, 0.949, 1),
        indigo100: rgb(0.78, 0.82, 1),
        red700: rgb(0.725, 0.11, 0.11),
        red800: rgb(0.6, 0.094, 0.094),
        slate100: rgb(0.945, 0.961, 0.976),
        slate300: rgb(0.796, 0.835, 0.882)
      };

      const colGap = 4;
      const colAmt = 66;
      const xSoldeL = pageWidth - margin - colAmt;
      const xPaiementL = xSoldeL - colGap - colAmt;
      const xMontantL = xPaiementL - colGap - colAmt;
      const colDate = 70;
      const xDateL = xMontantL - colGap - colDate;
      const xFacture = margin + 10;
      const maxFactureW = Math.max(88, xDateL - colGap - xFacture - 4);

      const titleSize = 16;
      const metaSize = 10;
      const headSize = 9;
      const bodySize = 9;
      const rowBodyH = 15;
      const rowHeadH = 18;
      const rowFootH = 20;

      let page = pdf.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;

      const drawLogoTopRight = () => {
        if (!logoImage) return;
        const targetW = 52;
        const w = targetW;
        const h = logoImage.height * (targetW / logoImage.width);
        page.drawImage(logoImage, {
          x: pageWidth - margin - w,
          y: pageHeight - margin - h,
          width: w,
          height: h
        });
      };
      drawLogoTopRight();

      const totals = rows.reduce(
        (acc, inv) => ({
          montant: acc.montant + inv.amount,
          paiement: acc.paiement + inv.totalPaid,
          solde: acc.solde + inv.restAPayer
        }),
        { montant: 0, paiement: 0, solde: 0 }
      );

      const newPageIfNeeded = (needed: number) => {
        if (y < margin + needed) {
          page = pdf.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
      };

      const drawTextRight = (
        text: string,
        xRight: number,
        baselineY: number,
        size: number,
        f: typeof font,
        color = C.gray800
      ) => {
        const safe = stripDiacriticsForPdf(text);
        const w = f.widthOfTextAtSize(safe, size);
        page.drawText(safe, { x: xRight - w, y: baselineY, size, font: f, color });
      };

      const truncateToWidth = (raw: string, maxW: number, f: typeof font, size: number) => {
        let s = stripDiacriticsForPdf(raw);
        if (f.widthOfTextAtSize(s, size) <= maxW) return s;
        const ell = '...';
        while (s.length > 1 && f.widthOfTextAtSize(s.slice(0, -1) + ell, size) > maxW) s = s.slice(0, -1);
        return s.slice(0, -1) + ell;
      };

      const formatRowDate = (d: string) => {
        const t = new Date(d);
        return Number.isNaN(t.getTime()) ? '-' : t.toLocaleDateString('fr-FR');
      };

      newPageIfNeeded(72);
      page.drawText(stripDiacriticsForPdf(`Detail — ${statusLabel}`), {
        x: margin,
        y: y - titleSize * 0.2,
        size: titleSize,
        font: fontBold,
        color: C.gray900
      });
      y -= 24;

      const metaBoxH = 36;
      newPageIfNeeded(metaBoxH + 6);
      page.drawRectangle({
        x: margin,
        y: y - metaBoxH + 2,
        width: contentW,
        height: metaBoxH,
        color: C.indigo50,
        borderColor: C.indigo100,
        borderWidth: 0.75
      });
      const metaBase = y - 11;
      page.drawText(stripDiacriticsForPdf(filterLabel), {
        x: margin + 10,
        y: metaBase,
        size: metaSize,
        font: fontBold,
        color: C.gray800
      });
      page.drawText(stripDiacriticsForPdf(`Statut : ${statusLabel}`), {
        x: margin + 10,
        y: metaBase - 13,
        size: metaSize,
        font: font,
        color: C.gray700
      });
      y -= metaBoxH + 12;

      const paintTableHeader = () => {
        page.drawRectangle({
          x: margin,
          y: y - rowHeadH + 3,
          width: contentW,
          height: rowHeadH,
          color: C.gray100,
          borderColor: C.gray200,
          borderWidth: 0.5
        });
        const b = y - 12;
        page.drawText(stripDiacriticsForPdf('N° facture'), {
          x: xFacture,
          y: b,
          size: headSize,
          font: fontBold,
          color: C.gray800
        });
        page.drawText(stripDiacriticsForPdf('Date reception'), {
          x: xDateL,
          y: b,
          size: headSize,
          font: fontBold,
          color: C.gray800
        });
        drawTextRight(stripDiacriticsForPdf('Montant fact.'), xMontantL + colAmt - 4, b, headSize, fontBold, C.gray800);
        drawTextRight(stripDiacriticsForPdf('Montant paye'), xPaiementL + colAmt - 4, b, headSize, fontBold, C.gray800);
        drawTextRight(stripDiacriticsForPdf('Solde'), xSoldeL + colAmt - 4, b, headSize, fontBold, C.gray800);
        y -= rowHeadH + 2;
      };

      const advancePageWithTableHeader = () => {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        drawLogoTopRight();
        paintTableHeader();
      };

      const drawBodyRow = (inv: Invoice, zebra: boolean) => {
        if (y < margin + rowBodyH + 4) advancePageWithTableHeader();
        if (zebra) {
          page.drawRectangle({
            x: margin,
            y: y - rowBodyH + 2,
            width: contentW,
            height: rowBodyH,
            color: C.gray50
          });
        }
        const b = y - 11;
        const invNo = truncateToWidth(inv.invoiceNumber, maxFactureW, font, bodySize);
        page.drawText(invNo, {
          x: xFacture,
          y: b,
          size: bodySize,
          font: fontBold,
          color: C.indigo600
        });
        page.drawText(stripDiacriticsForPdf(formatRowDate(inv.date)), {
          x: xDateL,
          y: b,
          size: bodySize,
          font: font,
          color: C.gray800
        });
        drawTextRight(formatMoney(inv.amount), xMontantL + colAmt - 4, b, bodySize, fontBold, C.gray800);
        drawTextRight(formatMoney(inv.totalPaid), xPaiementL + colAmt - 4, b, bodySize, font, C.gray800);
        drawTextRight(formatMoney(inv.restAPayer), xSoldeL + colAmt - 4, b, bodySize, fontBold, C.red700);
        page.drawLine({
          start: { x: margin, y: y - rowBodyH + 1 },
          end: { x: pageWidth - margin, y: y - rowBodyH + 1 },
          thickness: 0.35,
          color: C.gray200
        });
        y -= rowBodyH;
      };

      const drawFooterRow = () => {
        if (y < margin + rowFootH + 6) advancePageWithTableHeader();
        page.drawRectangle({
          x: margin,
          y: y - rowFootH + 3,
          width: contentW,
          height: rowFootH,
          color: C.slate100,
          borderColor: C.slate300,
          borderWidth: 1
        });
        const b = y - 12;
        const label = stripDiacriticsForPdf(
          `Totaux (${rows.length} facture${rows.length > 1 ? 's' : ''})`
        );
        page.drawText(label, { x: margin + 10, y: b, size: bodySize, font: fontBold, color: C.gray900 });
        drawTextRight(formatMoney(totals.montant), xMontantL + colAmt - 4, b, bodySize, fontBold, C.gray900);
        drawTextRight(formatMoney(totals.paiement), xPaiementL + colAmt - 4, b, bodySize, fontBold, C.gray900);
        drawTextRight(formatMoney(totals.solde), xSoldeL + colAmt - 4, b, bodySize, fontBold, C.red800);
        y -= rowFootH;
      };

      newPageIfNeeded(rowHeadH + 10);
      paintTableHeader();
      rows.forEach((inv, idx) => drawBodyRow(inv, idx % 2 === 1));
      drawFooterRow();

      const bytes = await pdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeKey = stripDiacriticsForPdf(detailStatusKey).replace(/[^a-zA-Z0-9_-]/g, '_');
      a.href = url;
      a.download = `Detail_${safeKey}_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(`Erreur export PDF : ${e instanceof Error ? e.message : 'inconnue'}`);
    } finally {
      setDetailPdfExporting(false);
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
          <div className={`flex h-[calc(100%-0.5rem)] min-h-0 gap-0 transition-all duration-300 ease-out ${selectedSupplier ? 'lg:gap-4' : ''}`}>
            {/* Left Column - 30% - List with Tabs */}
            <div className={`flex-shrink-0 transition-all duration-300 ease-out ${
              (selectedSupplier || selectedDossier) 
                ? 'w-full lg:w-1/3 lg:border-r-4 lg:border-blue-200 lg:pr-4' 
                : 'w-full lg:w-80'
            } border border-gray-200 rounded-lg bg-white overflow-hidden h-full min-h-0 flex flex-col pb-2`}>
              
              {/* Tabs */}
              <div className="flex bg-gray-100 border-b">
                <button
                  onClick={() => {
                    setActiveLeftTab('supplier');
                    setSelectedDossier(null);
                  }}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-all duration-150 ease-out ${
                    activeLeftTab === 'supplier'
                      ? 'bg-white text-gray-900 border-b-2 border-blue-500'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Fournisseur
                </button>
                {selectedInvoiceType !== 'frais-generaux' && (
                  <button
                    onClick={() => {
                      setActiveLeftTab('dossier');
                      setSelectedSupplier(null);
                    }}
                    className={`flex-1 px-3 py-2 text-xs font-medium transition-all duration-150 ease-out ${
                      activeLeftTab === 'dossier'
                        ? 'bg-white text-gray-900 border-b-2 border-blue-500'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Numéro de dossier
                  </button>
                )}
              </div>

              {/* Content */}
              <div className="p-4 flex-1 min-h-0 flex flex-col">
                {activeLeftTab === 'supplier' ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Fournisseurs avec solde à payer</h2>
                    
                    {/* Search bar for suppliers */}
                    <div className="mb-4 relative">
                      <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Rechercher un fournisseur..."
                        value={searchTerm}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
                      {getUnpaidSuppliers().length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                          Aucun fournisseur avec factures non payées
                        </div>
                      ) : (
                        getUnpaidSuppliers().map((item) => (
                          <div
                            key={item.supplier}
                            onClick={() => {
                              setSelectedSupplier(selectedSupplier === item.supplier ? null : item.supplier);
                              setSelectedDossier(null);
                            }}
                            className={`p-3 rounded-lg cursor-pointer transition-all duration-200 overflow-hidden ${
                              selectedSupplier === item.supplier
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-gray-50 hover:bg-gray-100 text-gray-900'
                            }`}
                          >
                            <div className="font-semibold text-sm break-words">{item.supplier}</div>
                            <div className={`text-xs mt-1 ${
                              selectedSupplier === item.supplier ? 'text-blue-100' : 'text-gray-600'
                            }`}>
                              <span>Solde à payer: <span className="font-bold">${item.restAPayer.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                            </div>
                            <div className={`text-xs mt-1 ${
                              selectedSupplier === item.supplier ? 'text-blue-100' : 'text-gray-600'
                            }`}>
                              <span>{item.count} facture{item.count > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 flex-col">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Numéros de dossier</h2>
                    
                    {/* Search bar for dossiers */}
                    <div className="mb-4 relative">
                      <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Rechercher un numéro de dossier..."
                        value={searchTerm}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
                      {getUnpaidDossiers().length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                          Aucun dossier avec factures non payées
                        </div>
                      ) : (
                        getUnpaidDossiers().map((item) => (
                          <div
                            key={item.dossier}
                            onClick={() => {
                              setSelectedDossier(selectedDossier === item.dossier ? null : item.dossier);
                              setSelectedSupplier(null);
                            }}
                            className={`p-3 rounded-lg cursor-pointer transition-all duration-200 overflow-hidden ${
                              selectedDossier === item.dossier
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-gray-50 hover:bg-gray-100 text-gray-900'
                            }`}
                          >
                            <div className="font-semibold text-sm break-words">{item.dossier}</div>
                            <div className={`text-xs mt-1 ${
                              selectedDossier === item.dossier ? 'text-blue-100' : 'text-gray-600'
                            }`}>
                              <span>Solde à payer: <span className="font-bold">${item.restAPayer.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                            </div>
                            <div className={`text-xs mt-1 ${
                              selectedDossier === item.dossier ? 'text-blue-100' : 'text-gray-600'
                            }`}>
                              <span>{item.count} facture{item.count > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - 70% - Invoice Status Sections (Hidden by default, shown only when supplier or dossier selected) */}
            {(selectedSupplier || selectedDossier) && (
              <div className="w-full lg:w-2/3 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-lg transition-all duration-300 ease-out animate-fadeIn h-full min-h-0 flex flex-col pb-2">
                <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
                  <p className="text-sm font-semibold text-blue-900">
                    Factures pour: <span className="text-blue-700">
                      {selectedSupplier ? selectedSupplier : selectedDossier}
                    </span>
                    {selectedDossier && <span className="text-xs text-blue-600 ml-2">(Numéro de dossier)</span>}
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
                            disabled={detailPdfExporting || detailInvoicesForCard().length === 0}
                            className="inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-500 transition hover:bg-white hover:text-rose-600 hover:shadow-sm active:scale-95 disabled:pointer-events-none disabled:opacity-35"
                            title={
                              detailInvoicesForCard().length === 0
                                ? 'Aucune ligne à exporter'
                                : 'Exporter ce tableau en PDF'
                            }
                            aria-label="Exporter le détail en PDF"
                          >
                            {detailPdfExporting ? (
                              <RefreshCw size={18} className="animate-spin text-rose-600" />
                            ) : (
                              <FileDown size={18} strokeWidth={2} />
                            )}
                          </button>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white flex-1 min-h-0">
                          <table className="w-full text-xs min-w-[640px]">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-900">N° Facture</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-900">Date réception</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-900">Montant facture</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-900">Montant payé</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-900">Solde à payer</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailInvoicesForCard().length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                                    Aucune facture
                                  </td>
                                </tr>
                              ) : (
                                detailInvoicesForCard().map((inv) => (
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
                                    <td className="px-3 py-2 text-gray-700">
                                      {new Date(inv.date).toLocaleDateString('fr-FR')}
                                    </td>
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
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
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
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 shrink-0">
              <h2 id="releve-modal-title" className="text-xl font-semibold text-gray-900 truncate">
                Relevé
              </h2>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleReleveExportPdf()}
                  disabled={relevePdfExporting || releveRows.length === 0}
                  className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-rose-600 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
                  title={
                    releveRows.length === 0
                      ? 'Aucune ligne à exporter'
                      : 'Exporter le relevé au format PDF (filtres courants)'
                  }
                  aria-label="Exporter le relevé en PDF"
                >
                  {relevePdfExporting ? (
                    <RefreshCw size={20} className="animate-spin text-rose-600" />
                  ) : (
                    <FileDown size={20} strokeWidth={2} />
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
              <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3 space-y-3">
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
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
                    <div className="shrink-0 pb-0.5 text-right">
                      <p className="text-sm font-semibold text-gray-800 tabular-nums">
                        Totaux ({releveRows.length} facture{releveRows.length > 1 ? 's' : ''})
                      </p>
                    </div>
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

              <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
                <div className="flex h-full min-h-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-auto p-0.5">
                    <table className="w-full min-w-[860px] text-sm leading-snug border-collapse">
                      <thead className="sticky top-0 z-20 border-b border-gray-200 bg-gray-100 shadow-sm">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-800">N°</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-800">N° facture</th>
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
                            <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
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
                      <div className="flex w-full min-w-[860px] justify-end text-sm leading-tight text-gray-900">
                        <div className="space-y-0 leading-none text-right tabular-nums">
                          <div className="font-bold leading-tight">
                            <span className="font-semibold text-gray-800">Montant Total :</span>{' '}
                            {formatMoney(releveTotals.montant)}
                          </div>
                          <div className="font-bold leading-tight">
                            <span className="font-semibold text-gray-800">Montant payé :</span>{' '}
                            {formatMoney(releveTotals.paiement)}
                          </div>
                          <div className="font-bold leading-tight">
                            <span className="font-semibold text-gray-800">Solde à payer :</span>{' '}
                            <span className="text-red-800">{formatMoney(releveTotals.solde)}</span>
                          </div>
                        </div>
                      </div>
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

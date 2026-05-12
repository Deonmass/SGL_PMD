import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw, Download, ClipboardList, X, FileDown, FileSpreadsheet } from 'lucide-react';
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

type RelevePeriodeType = 'annee' | 'mois' | 'semestre' | 'trimestre' | 'personnalise';

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
      font = await pdf.embedFont(regBuf, { subset: true });
      fontBold = await pdf.embedFont(boldBuf, { subset: true });
    } else {
      const regBuf = await fetch(`${base}fonts/Carlito-Regular.ttf`).then((r) => r.arrayBuffer());
      const boldBuf = await fetch(`${base}fonts/Carlito-Bold.ttf`).then((r) => r.arrayBuffer());
      font = await pdf.embedFont(regBuf, { subset: true });
      fontBold = await pdf.embedFont(boldBuf, { subset: true });
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
  const [relevePeriodeType, setRelevePeriodeType] = useState<RelevePeriodeType>('annee');
  const [releveYear, setReleveYear] = useState<string>('2026');
  const [releveMonth, setReleveMonth] = useState<string>('1');
  const [releveTrimester, setReleveTrimester] = useState<string>('1');
  const [releveSemester, setReleveSemester] = useState<string>('1');
  const [releveDateStart, setReleveDateStart] = useState<string>('');
  const [releveDateEnd, setReleveDateEnd] = useState<string>('');
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
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const canViewOperational = hasPermission('recherche', 'voir_operationnel') || canView('recherche');
  const canViewFfg = hasPermission('recherche', 'voir_frais_generaux');
  const [selectedInvoiceType, setSelectedInvoiceType] = useState<'operationnel' | 'frais-generaux'>(
    invoiceTypeScope === 'frais-generaux' ? 'frais-generaux' : 'operationnel'
  );

  // Advanced filters
  const [filterDateType, setFilterDateType] = useState<string>('all');
  const [filterDateStart, setFilterDateStart] = useState<string>('');
  const [filterDateEnd, setFilterDateEnd] = useState<string>('');

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
    
    // Apply year filter
    if (selectedYear) {
      filteredInvoices = filteredInvoices.filter(inv => {
        const invYear = new Date(inv.date).getFullYear().toString();
        return invYear === selectedYear;
      });
    }
    
    // Apply date range filter
    if (filterDateType !== 'all' && filterDateStart && filterDateEnd) {
      const start = new Date(filterDateStart);
      const end = new Date(filterDateEnd);
      filteredInvoices = filteredInvoices.filter(inv => {
        const invDate = new Date(inv.date);
        return invDate >= start && invDate <= end;
      });
    } else if (filterDateType !== 'all' && filterDateType !== 'custom') {
      const today = new Date();
      
      filteredInvoices = filteredInvoices.filter(inv => {
        const iDate = new Date(inv.date);
        
        if (filterDateType === 'week') {
          const dayOfWeek = today.getDay();
          const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() + daysToMonday);
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          return iDate >= weekStart && iDate <= weekEnd;
        } else if (filterDateType === 'month') {
          return iDate.getMonth() === today.getMonth() && iDate.getFullYear() === today.getFullYear();
        } else if (filterDateType === 'trimester') {
          const currentTrimester = Math.floor(today.getMonth() / 3);
          const invoiceTrimester = Math.floor(iDate.getMonth() / 3);
          return invoiceTrimester === currentTrimester && iDate.getFullYear() === today.getFullYear();
        } else if (filterDateType === 'semester') {
          const currentSemester = today.getMonth() < 6 ? 0 : 1;
          const invoiceSemester = iDate.getMonth() < 6 ? 0 : 1;
          return invoiceSemester === currentSemester && iDate.getFullYear() === today.getFullYear();
        }
        
        return true;
      });
    }

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
    
    // Apply year filter
    if (selectedYear) {
      filteredInvoices = filteredInvoices.filter(inv => {
        const invYear = new Date(inv.date).getFullYear().toString();
        return invYear === selectedYear;
      });
    }
    
    // Apply date range filter
    if (filterDateType !== 'all' && filterDateStart && filterDateEnd) {
      const start = new Date(filterDateStart);
      const end = new Date(filterDateEnd);
      filteredInvoices = filteredInvoices.filter(inv => {
        const invDate = new Date(inv.date);
        return invDate >= start && invDate <= end;
      });
    } else if (filterDateType !== 'all' && filterDateType !== 'custom') {
      const today = new Date();
      
      filteredInvoices = filteredInvoices.filter(inv => {
        const iDate = new Date(inv.date);
        
        if (filterDateType === 'week') {
          const dayOfWeek = today.getDay();
          const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() + daysToMonday);
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          return iDate >= weekStart && iDate <= weekEnd;
        } else if (filterDateType === 'month') {
          return iDate.getMonth() === today.getMonth() && iDate.getFullYear() === today.getFullYear();
        } else if (filterDateType === 'trimester') {
          const currentTrimester = Math.floor(today.getMonth() / 3);
          const invoiceTrimester = Math.floor(iDate.getMonth() / 3);
          return invoiceTrimester === currentTrimester && iDate.getFullYear() === today.getFullYear();
        } else if (filterDateType === 'semester') {
          const currentSemester = today.getMonth() < 6 ? 0 : 1;
          const invoiceSemester = iDate.getMonth() < 6 ? 0 : 1;
          return invoiceSemester === currentSemester && iDate.getFullYear() === today.getFullYear();
        }
        
        return true;
      });
    }

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

    // Year
    if (selectedYear) {
      filtered = filtered.filter(inv => {
        const invYear = new Date(inv.date).getFullYear().toString();
        return invYear === selectedYear;
      });
    }

    // Date range
    if (filterDateType !== 'all' && filterDateStart && filterDateEnd) {
      const start = new Date(filterDateStart);
      const end = new Date(filterDateEnd);
      filtered = filtered.filter(inv => {
        const invDate = new Date(inv.date);
        return invDate >= start && invDate <= end;
      });
    } else if (filterDateType !== 'all' && filterDateType !== 'custom') {
      const today = new Date();
      
      filtered = filtered.filter(inv => {
        const iDate = new Date(inv.date);
        
        if (filterDateType === 'week') {
          // Semaine: lundi à dimanche
          const dayOfWeek = today.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
          const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() + daysToMonday);
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          return iDate >= weekStart && iDate <= weekEnd;
        } else if (filterDateType === 'month') {
          return iDate.getMonth() === today.getMonth() && iDate.getFullYear() === today.getFullYear();
        } else if (filterDateType === 'trimester') {
          const currentTrimester = Math.floor(today.getMonth() / 3);
          const invoiceTrimester = Math.floor(iDate.getMonth() / 3);
          return invoiceTrimester === currentTrimester && iDate.getFullYear() === today.getFullYear();
        } else if (filterDateType === 'semester') {
          const currentSemester = today.getMonth() < 6 ? 0 : 1;
          const invoiceSemester = iDate.getMonth() < 6 ? 0 : 1;
          return invoiceSemester === currentSemester && iDate.getFullYear() === today.getFullYear();
        }
        
        return true;
      });
    }

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

    if (selectedYear && selectedYear !== '2026') {
      parts.push(`Année: ${selectedYear}`);
    }

    if (filterDateType !== 'all') {
      const today = new Date();
      
      if (filterDateType === 'week') {
        // Semaine: lundi à dimanche
        const dayOfWeek = today.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() + daysToMonday);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const startStr = weekStart.toLocaleDateString('fr-FR');
        const endStr = weekEnd.toLocaleDateString('fr-FR');
        parts.push(`Filtre: Cette semaine (${startStr} au ${endStr})`);
      } else if (filterDateType === 'month') {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const startStr = monthStart.toLocaleDateString('fr-FR');
        const endStr = monthEnd.toLocaleDateString('fr-FR');
        parts.push(`Filtre: Ce mois (${startStr} au ${endStr})`);
      } else if (filterDateType === 'trimester') {
        const quarter = Math.floor(today.getMonth() / 3);
        const trimStart = new Date(today.getFullYear(), quarter * 3, 1);
        const trimEnd = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
        const startStr = trimStart.toLocaleDateString('fr-FR');
        const endStr = trimEnd.toLocaleDateString('fr-FR');
        parts.push(`Filtre: Ce trimestre (${startStr} au ${endStr})`);
      } else if (filterDateType === 'semester') {
        const semester = today.getMonth() < 6 ? 0 : 1;
        const semStart = new Date(today.getFullYear(), semester * 6, 1);
        const semEnd = new Date(today.getFullYear(), (semester + 1) * 6, 0);
        const startStr = semStart.toLocaleDateString('fr-FR');
        const endStr = semEnd.toLocaleDateString('fr-FR');
        parts.push(`Filtre: Ce semestre (${startStr} au ${endStr})`);
      } else if (filterDateType === 'custom' && filterDateStart && filterDateEnd) {
        const startDate = new Date(filterDateStart).toLocaleDateString('fr-FR');
        const endDate = new Date(filterDateEnd).toLocaleDateString('fr-FR');
        parts.push(`Filtre: Du ${startDate} au ${endDate}`);
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
    setReleveSupplierInput(releveSupplier);
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

    const y = parseInt(releveYear, 10);

    switch (relevePeriodeType) {
      case 'personnalise': {
        if (releveDateStart && releveDateEnd) {
          const start = new Date(releveDateStart);
          const end = new Date(releveDateEnd);
          end.setHours(23, 59, 59, 999);
          list = list.filter((inv) => {
            const d = new Date(inv.date);
            return d >= start && d <= end;
          });
        } else if (releveDateStart && !releveDateEnd) {
          const start = new Date(releveDateStart);
          start.setHours(0, 0, 0, 0);
          list = list.filter((inv) => new Date(inv.date) >= start);
        } else if (!releveDateStart && releveDateEnd) {
          const end = new Date(releveDateEnd);
          end.setHours(23, 59, 59, 999);
          list = list.filter((inv) => new Date(inv.date) <= end);
        }
        return list;
      }
      case 'annee': {
        if (!Number.isNaN(y) && releveYear) {
          list = list.filter((inv) => new Date(inv.date).getFullYear().toString() === releveYear);
        }
        return list;
      }
      case 'mois': {
        const m = parseInt(releveMonth, 10);
        if (!Number.isNaN(y) && releveYear) {
          list = list.filter((inv) => new Date(inv.date).getFullYear().toString() === releveYear);
        }
        if (!Number.isNaN(m) && m >= 1 && m <= 12) {
          list = list.filter((inv) => new Date(inv.date).getMonth() + 1 === m);
        }
        return list;
      }
      case 'trimestre': {
        const q = parseInt(releveTrimester, 10) - 1;
        if (!Number.isNaN(y) && releveYear) {
          list = list.filter((inv) => new Date(inv.date).getFullYear().toString() === releveYear);
        }
        if (!Number.isNaN(q) && q >= 0 && q <= 3) {
          list = list.filter((inv) => Math.floor(new Date(inv.date).getMonth() / 3) === q);
        }
        return list;
      }
      case 'semestre': {
        const s = parseInt(releveSemester, 10);
        if (!Number.isNaN(y) && releveYear) {
          list = list.filter((inv) => new Date(inv.date).getFullYear().toString() === releveYear);
        }
        if (s === 1 || s === 2) {
          list = list.filter((inv) => {
            const month = new Date(inv.date).getMonth();
            return s === 1 ? month < 6 : month >= 6;
          });
        }
        return list;
      }
      default:
        return list;
    }
  };

  const relevePeriodeLabel = useMemo(() => {
    const fmt = (d: Date) =>
      d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

    const y = parseInt(releveYear, 10);

    switch (relevePeriodeType) {
      case 'personnalise': {
        if (releveDateStart && releveDateEnd) {
          return `Du ${fmt(new Date(releveDateStart))} au ${fmt(new Date(releveDateEnd))}`;
        }
        if (releveDateStart && !releveDateEnd) {
          return `À partir du ${fmt(new Date(releveDateStart))}`;
        }
        if (!releveDateStart && releveDateEnd) {
          return `Jusqu'au ${fmt(new Date(releveDateEnd))}`;
        }
        return 'Choisissez une plage de dates';
      }
      case 'annee':
        return Number.isNaN(y) ? '—' : `Année complète ${y} — du ${fmt(new Date(y, 0, 1))} au ${fmt(new Date(y, 11, 31))}`;
      case 'mois': {
        const m = parseInt(releveMonth, 10);
        if (Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) return '—';
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0);
        return `Du ${fmt(start)} au ${fmt(end)}`;
      }
      case 'trimestre': {
        const q = parseInt(releveTrimester, 10) - 1;
        if (Number.isNaN(y) || Number.isNaN(q) || q < 0 || q > 3) return '—';
        const start = new Date(y, q * 3, 1);
        const end = new Date(y, q * 3 + 3, 0);
        return `Trimestre ${q + 1} ${y} — du ${fmt(start)} au ${fmt(end)}`;
      }
      case 'semestre': {
        const s = parseInt(releveSemester, 10);
        if (Number.isNaN(y)) return '—';
        if (s === 1) {
          const start = new Date(y, 0, 1);
          const end = new Date(y, 6, 0);
          return `1er semestre ${y} — du ${fmt(start)} au ${fmt(end)}`;
        }
        if (s === 2) {
          const start = new Date(y, 6, 1);
          const end = new Date(y, 12, 0);
          return `2e semestre ${y} — du ${fmt(start)} au ${fmt(end)}`;
        }
        return '—';
      }
      default:
        return '—';
    }
  }, [
    relevePeriodeType,
    releveDateStart,
    releveDateEnd,
    releveYear,
    releveMonth,
    releveTrimester,
    releveSemester
  ]);

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
        slate300: rgb(0.796, 0.835, 0.882)
      };

      const colGap = 4;
      const colAmt = 62;
      const colDue = 56;
      const xSoldeL = pageWidth - margin - colAmt;
      const xPaiementL = xSoldeL - colGap - colAmt;
      const xMontantL = xPaiementL - colGap - colAmt;
      const xEcheanceL = xMontantL - colGap - colDue;
      const xFacture = margin + 30;
      const maxFactureW = Math.max(72, xEcheanceL - colGap - xFacture - 4);

      const titleSize = 18;
      const metaSize = 10;
      const headSize = 10;
      const bodySize = 10;
      const rowBodyH = 16;
      const rowHeadH = 20;
      const rowFootH = 22;

      let page = pdf.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;

      const drawLogoTopRight = () => {
        if (!logoImage) return;
        const targetW = 56;
        const scale = targetW / logoImage.width;
        const w = targetW;
        const h = logoImage.height * scale;
        const x = pageWidth - margin - w;
        const yImg = pageHeight - margin - h;
        page.drawImage(logoImage, { x, y: yImg, width: w, height: h });
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

      newPageIfNeeded(80);
      page.drawText(stripDiacriticsForPdf('Releve'), {
        x: margin,
        y: y - titleSize * 0.25,
        size: titleSize,
        font: fontBold,
        color: C.gray900
      });
      y -= 26;

      const metaBoxH = 38;
      newPageIfNeeded(metaBoxH + 8);
      page.drawRectangle({
        x: margin,
        y: y - metaBoxH + 2,
        width: contentW,
        height: metaBoxH,
        color: C.indigo50,
        borderColor: C.indigo100,
        borderWidth: 0.75
      });
      const metaBase = y - 12;
      page.drawText(stripDiacriticsForPdf(`Periode : ${relevePeriodeLabel}`), {
        x: margin + 10,
        y: metaBase,
        size: metaSize,
        font: fontBold,
        color: C.gray800
      });
      page.drawText(stripDiacriticsForPdf(`Fournisseur : ${releveSupplier || 'Tous'}`), {
        x: margin + 10,
        y: metaBase - 14,
        size: metaSize,
        font: font,
        color: C.gray700
      });
      y -= metaBoxH + 14;

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
        drawTextRight("Date d'echeance", xEcheanceL + colDue - 4, b, headSize, fontBold, C.gray800);
        drawTextRight('Montant', xMontantL + colAmt - 4, b, headSize, fontBold, C.gray800);
        drawTextRight('Paiement', xPaiementL + colAmt - 4, b, headSize, fontBold, C.gray800);
        drawTextRight('Solde', xSoldeL + colAmt - 4, b, headSize, fontBold, C.gray800);
        y -= rowHeadH + 2;
      };

      const advancePageWithTableHeader = () => {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        drawLogoTopRight();
        paintTableHeader();
      };

      const drawBodyRow = (idx: number, inv: (typeof rows)[0], zebra: boolean) => {
        if (y < margin + rowBodyH + 4) {
          advancePageWithTableHeader();
        }
        if (zebra) {
          page.drawRectangle({
            x: margin,
            y: y - rowBodyH + 3,
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
          formatReleveDueDate(inv.dueDate),
          xEcheanceL + colDue - 4,
          b,
          bodySize,
          font,
          C.gray800
        );
        drawTextRight(formatMoney(inv.amount), xMontantL + colAmt - 4, b, bodySize, fontBold, C.gray800);
        drawTextRight(formatMoney(inv.totalPaid), xPaiementL + colAmt - 4, b, bodySize, font, C.gray800);
        drawTextRight(formatMoney(inv.restAPayer), xSoldeL + colAmt - 4, b, bodySize, fontBold, C.red700);
        page.drawLine({
          start: { x: margin, y: y - rowBodyH + 2 },
          end: { x: pageWidth - margin, y: y - rowBodyH + 2 },
          thickness: 0.35,
          color: C.gray200
        });
        y -= rowBodyH;
      };

      const drawFooterRow = () => {
        if (y < margin + rowFootH + 6) {
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
        const b = y - 14;
        const label = stripDiacriticsForPdf(
          `Totaux (${rows.length} facture${rows.length > 1 ? 's' : ''})`
        );
        page.drawText(label, { x: margin + 10, y: b, size: bodySize, font: fontBold, color: C.gray900 });
        drawTextRight(formatMoney(totals.montant), xMontantL + colAmt - 4, b, bodySize, fontBold, C.gray900);
        drawTextRight(formatMoney(totals.paiement), xPaiementL + colAmt - 4, b, bodySize, fontBold, C.gray900);
        drawTextRight(formatMoney(totals.solde), xSoldeL + colAmt - 4, b, bodySize, fontBold, C.red800);
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
      'Échéance': formatReleveDueDate(inv.dueDate),
      Montant: inv.amount,
      Paiement: inv.totalPaid,
      Solde: inv.restAPayer,
      Fournisseur: inv.supplier,
      'Date réception': inv.date
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
      bar: 'border-l-blue-600',
      hoverClass:
        'hover:bg-gradient-to-br hover:from-blue-50 hover:via-blue-100 hover:to-blue-200 hover:shadow-md hover:border-blue-200/80',
      selectedClass: 'ring-2 ring-blue-300 bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200/90'
    },
    {
      key: 'overdue' as const,
      label: 'Échues',
      count: overdueInvoices.length,
      amount: overdueTotal,
      bar: 'border-l-amber-500',
      hoverClass:
        'hover:bg-gradient-to-br hover:from-amber-50 hover:via-amber-100 hover:to-amber-200 hover:shadow-md hover:border-amber-200/80',
      selectedClass: 'ring-2 ring-amber-300 bg-gradient-to-br from-amber-50 via-amber-100 to-amber-200/90'
    },
    {
      key: 'rejected' as const,
      label: 'Rejetées',
      count: rejectedInvoices.length,
      amount: rejectedTotal,
      bar: 'border-l-red-600',
      hoverClass:
        'hover:bg-gradient-to-br hover:from-red-50 hover:via-red-100 hover:to-red-200 hover:shadow-md hover:border-red-200/80',
      selectedClass: 'ring-2 ring-red-300 bg-gradient-to-br from-red-50 via-red-100 to-red-200/90'
    },
    {
      key: 'paid' as const,
      label: 'Payées',
      count: paidInvoices.length,
      amount: paidTotal,
      bar: 'border-l-emerald-600',
      hoverClass:
        'hover:bg-gradient-to-br hover:from-emerald-50 hover:via-emerald-100 hover:to-emerald-200 hover:shadow-md hover:border-emerald-200/80',
      selectedClass: 'ring-2 ring-emerald-300 bg-gradient-to-br from-emerald-50 via-emerald-100 to-emerald-200/90'
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
        

        {/* Selected Filter Display */}
        {(selectedSupplier || selectedDossier) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-900">Filtre actif:</span>
              <span className="text-sm font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded">
                {selectedSupplier ? `Fournisseur: ${selectedSupplier}` : `Dossier: ${selectedDossier}`}
              </span>
              <button
                onClick={() => {
                  setSelectedSupplier(null);
                  setSelectedDossier(null);
                  setSearchTerm('');
                  setDetailStatusKey(null);
                }}
                className="text-xs text-blue-600 hover:text-blue-800 underline ml-auto"
              >
                Effacer
              </button>
            </div>
          </div>
        )}

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

        {/* White Background Container for Filters */}
        <div className="bg-white p-4 rounded-lg  mt-[-20px]">
          {/* Advanced Filters */}
          <div className={`grid gap-2 ${filterDateType === 'custom' ? 'grid-cols-1 md:grid-cols-5' : 'grid-cols-1 md:grid-cols-2'}`}>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          <select
            value={filterDateType}
            onChange={(e) => setFilterDateType(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Toutes dates</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="trimester">Ce trimestre</option>
            <option value="semester">Ce semestre</option>
            <option value="custom">Personnalisé</option>
          </select>

          {filterDateType === 'custom' && (
            <>
              <input
                type="date"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              
              <span className="flex items-center text-xs text-gray-600 justify-center">au</span>
              
              <input
                type="date"
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </>
          )}
          </div>
        </div>

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
                              'text-left rounded-lg border border-gray-200 bg-white shadow-sm border-l-4 pl-3 pr-3 py-3 transition-all duration-200',
                              card.bar,
                              card.hoverClass,
                              selected ? card.selectedClass : ''
                            ].join(' ')}
                          >
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                              {card.label}
                            </p>
                            <p className="text-sm text-gray-600 mt-2">
                              <span className="font-semibold text-gray-900 tabular-nums">{card.count}</span>{' '}
                              facture{card.count !== 1 ? 's' : ''}
                            </p>
                            <p className="text-sm font-semibold text-gray-900 mt-1 tabular-nums">
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
          <div className="flex w-full max-w-6xl flex-col rounded-xl border border-gray-200/80 bg-white shadow-xl h-[min(720px,92vh)] max-h-[92vh]">
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
              <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3">
                <div className="flex min-w-0 flex-nowrap items-start gap-3">
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

                  <div className="shrink-0 pt-5">
                    <span className="sr-only">Période de réception</span>
                    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                  <select
                    value={relevePeriodeType}
                    onChange={(e) => setRelevePeriodeType(e.target.value as RelevePeriodeType)}
                    title="Type de période"
                    className="shrink-0 min-w-[8.5rem] h-10 rounded-md border border-gray-300 bg-white pl-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="annee">Année</option>
                    <option value="mois">Mois</option>
                    <option value="semestre">Semestre</option>
                    <option value="trimestre">Trimestre</option>
                    <option value="personnalise">Personnalisé</option>
                  </select>

                  {relevePeriodeType === 'annee' && (
                    <select
                      value={releveYear}
                      onChange={(e) => setReleveYear(e.target.value)}
                      title="Année"
                      className="shrink-0 min-w-[5.25rem] h-10 rounded-md border border-gray-300 bg-white pl-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  )}

                  {relevePeriodeType === 'mois' && (
                    <>
                      <select
                        value={releveYear}
                        onChange={(e) => setReleveYear(e.target.value)}
                        title="Année"
                        className="shrink-0 min-w-[5.25rem] h-10 rounded-md border border-gray-300 bg-white pl-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {years.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <select
                        value={releveMonth}
                        onChange={(e) => setReleveMonth(e.target.value)}
                        title="Mois"
                        className="shrink-0 min-w-[5rem] h-10 rounded-md border border-gray-300 bg-white pl-2.5 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={String(m)}>
                            {String(m).padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  {relevePeriodeType === 'semestre' && (
                    <>
                      <select
                        value={releveYear}
                        onChange={(e) => setReleveYear(e.target.value)}
                        title="Année"
                        className="shrink-0 min-w-[5.25rem] h-10 rounded-md border border-gray-300 bg-white pl-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {years.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <select
                        value={releveSemester}
                        onChange={(e) => setReleveSemester(e.target.value)}
                        title="Semestre"
                        className="shrink-0 min-w-[6.25rem] h-10 rounded-md border border-gray-300 bg-white pl-2.5 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="1">S1</option>
                        <option value="2">S2</option>
                      </select>
                    </>
                  )}

                  {relevePeriodeType === 'trimestre' && (
                    <>
                      <select
                        value={releveYear}
                        onChange={(e) => setReleveYear(e.target.value)}
                        title="Année"
                        className="shrink-0 min-w-[5.25rem] h-10 rounded-md border border-gray-300 bg-white pl-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {years.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <select
                        value={releveTrimester}
                        onChange={(e) => setReleveTrimester(e.target.value)}
                        title="Trimestre"
                        className="shrink-0 min-w-[6rem] h-10 rounded-md border border-gray-300 bg-white pl-2.5 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="1">T1</option>
                        <option value="2">T2</option>
                        <option value="3">T3</option>
                        <option value="4">T4</option>
                      </select>
                    </>
                  )}

                  {relevePeriodeType === 'personnalise' && (
                    <>
                      <input
                        type="date"
                        value={releveDateStart}
                        onChange={(e) => setReleveDateStart(e.target.value)}
                        title="Date début"
                        className="shrink-0 min-w-[9.5rem] h-10 rounded-md border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="shrink-0 text-xs font-medium text-gray-500">au</span>
                      <input
                        type="date"
                        value={releveDateEnd}
                        onChange={(e) => setReleveDateEnd(e.target.value)}
                        title="Date fin"
                        className="shrink-0 min-w-[9.5rem] h-10 rounded-md border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </>
                  )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
                <div className="h-full overflow-auto rounded-lg border border-gray-200">
                  <table className="w-full min-w-[760px] text-sm leading-snug">
                    <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-100">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-800">N°</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-800">N° facture</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-800">Échéance</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-800">Montant</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-800">Paiement</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-800">Solde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {releveRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">
                            Aucune facture pour ces filtres.
                          </td>
                        </tr>
                      ) : (
                        releveRows.map((inv, idx) => (
                          <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                            <td className="px-3 py-2 text-gray-600 tabular-nums align-middle">{idx + 1}</td>
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
                              {formatReleveDueDate(inv.dueDate)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums align-middle">
                              {formatMoney(inv.amount)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-800 align-middle">
                              {formatMoney(inv.totalPaid)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-red-700 align-middle">
                              {formatMoney(inv.restAPayer)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {releveRows.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-100 text-sm font-semibold text-gray-900">
                          <td colSpan={3} className="px-3 py-2.5">
                            Totaux ({releveRows.length} facture{releveRows.length > 1 ? 's' : ''})
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(releveTotals.montant)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(releveTotals.paiement)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-red-800">{formatMoney(releveTotals.solde)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
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

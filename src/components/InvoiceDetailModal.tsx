import { X, Printer, Maximize2, CreditCard, Trash2, MoreVertical, Filter, Search, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Invoice as DbInvoice } from '../services/tableService';
import { Invoice as ContextInvoice, InvoiceStatus } from '../types';
import { formatCurrency, formatMoney } from '../utils/formatters';
import { supabase } from '../services/supabase';
import ViewInvoiceModal from './ViewInvoiceModal';
import PaiementModal from './PaiementModal';
import ViewPdfModal from './ViewPdfModal';
import ContextMenu from './ContextMenu';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { refreshAllData, useDataRefresh, REFRESH_EVENTS } from '../hooks/useDataRefresh';
import * as XLSX from 'xlsx';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceRemoved?: () => void;
  title: string;
  invoices: DbInvoice[];
  invoiceTypeScope?: 'operationnel' | 'frais-generaux';
  ordoPaiementId?: number;
  summary?: {
    totalAmount?: number;
    totalPaid?: number;
    totalRemaining?: number;
  };
}

interface InvoiceWithPayments extends DbInvoice {
  totalPaid: number;
  solde: number;
  hasPayments: boolean;
  'Facture attachée'?: string;
  'Catégorie de charge'?: string;
  'Niveau urgence'?: string;
  'Région'?: string;
  'Délais de paiement'?: number;
  'Échéance'?: string;
  'validation DR'?: string | boolean | null;
  'validation DOP'?: string | boolean | null;
  Devise?: string;
  'Gestionnaire'?: string;
  'Centre de coût'?: string;
  paymentInfo?: {
    modePaiement?: string;
    datePaiement?: string;
    BanqueSGL?: string;
    compteSGL?: string;
    BanqueFournisseur?: string;
    compteFournisseur?: string;
    paiedby?: string;
    fichier?: string;
  };
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

function InvoiceDetailModal({ 
  isOpen, 
  onClose, 
  onInvoiceRemoved,
  title, 
  invoices,
  invoiceTypeScope,
  ordoPaiementId,
  summary 
}: InvoiceDetailModalProps) {
  const formatSingleWord = (value?: string | null) => {
    const text = String(value || '').trim();
    if (!text) return 'N/A';
    if (text.includes(' ')) return text;
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  };

  const normalizeInvoiceType = (value?: string | null) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  const { success, error: showError } = useToast();
  const { agent } = useAuth();
  const { canMarkAsPaid } = usePermission();
  const [invoicesWithPayments, setInvoicesWithPayments] = useState<InvoiceWithPayments[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewInvoiceModal, setViewInvoiceModal] = useState<{ isOpen: boolean; invoice: any }>(
    { isOpen: false, invoice: null }
  );
  const [paiementModal, setPaiementModal] = useState<{ isOpen: boolean; invoice: any; ordoPaiementId?: number }>(
    { isOpen: false, invoice: null }
  );
  const [pdfModal, setPdfModal] = useState<{ isOpen: boolean; url?: string; title: string; summary?: { totalAmount?: number; totalPaid?: number; totalRemaining?: number } }>(
    { isOpen: false, title: '' }
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    invoice: InvoiceWithPayments | null;
    position: { x: number; y: number };
  } | null>(null);
  const [showPaidFilters, setShowPaidFilters] = useState(false);
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const normalizedTitle = (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const isPaidReportMode =
    normalizedTitle.includes('factures paye') &&
    !normalizedTitle.includes('partiellement');
  const displayTitle = isPaidReportMode ? 'Relevé des factures payées' : title;

  useEffect(() => {
    if (isOpen) {
      loadInvoicePayments();
    }
  }, [isOpen, invoices]);

  useDataRefresh(REFRESH_EVENTS.ALL, () => {
    if (isOpen) {
      loadInvoicePayments();
    }
  });

  const loadInvoicePayments = async () => {
    setLoading(true);
    try {
      const { data: paiements } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye, modePaiement, datePaiement, BanqueSGL, compteSGL, BanqueFournisseur, compteFournisseur, paiedby, fichier, timestamp');

      // Create map of invoice numbers with their total paid amounts
      const paymentMap = new Map<string, number>();
      const paymentDetailsMap = new Map<string, Record<string, any>>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture;
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);

          const existing = paymentDetailsMap.get(invoiceNumber);
          const existingDate = existing?.timestamp || existing?.datePaiement || '';
          const candidateDate = p.timestamp || p.datePaiement || '';
          if (!existing || new Date(candidateDate).getTime() >= new Date(existingDate).getTime()) {
            paymentDetailsMap.set(invoiceNumber, p);
          }
        });
      }

      // Filter invoices by region if agent has a specific region
      let filteredInvoices = agent?.REGION && agent.REGION !== 'TOUT' 
        ? invoices.filter(inv => (inv as any)['Région'] === agent.REGION)
        : invoices;

      // Enforce invoice type scope when provided (operationnel / frais-generaux)
      if (invoiceTypeScope && filteredInvoices.length > 0) {
        const invoiceNumbers = filteredInvoices.map((inv: any) => inv['Numéro de facture']).filter(Boolean);
        if (invoiceNumbers.length > 0) {
          const { data: scopedRows } = await supabase
            .from('FACTURES')
            .select('"Numéro de facture", "Type de facture"')
            .in('Numéro de facture', invoiceNumbers);

          const allowed = new Set(
            (scopedRows || [])
              .filter((row: any) => normalizeInvoiceType(row['Type de facture']) === normalizeInvoiceType(invoiceTypeScope))
              .map((row: any) => row['Numéro de facture'])
          );

          filteredInvoices = filteredInvoices.filter((inv: any) => allowed.has(inv['Numéro de facture']));
        }
      }

      // Enrich invoices with payment data
      const enriched = filteredInvoices.map((inv) => {
        const invoiceNumber = inv['Numéro de facture'];
        const totalPaid = paymentMap.get(invoiceNumber) || 0;
        const montant = parseFloat(inv.Montant as any) || 0;
        const solde = montant - totalPaid;
        const hasPayments = totalPaid > 0;

        return {
          ...inv,
          totalPaid,
          solde,
          hasPayments,
          paymentInfo: paymentDetailsMap.get(invoiceNumber)
            ? {
                modePaiement: paymentDetailsMap.get(invoiceNumber)?.modePaiement,
                datePaiement: paymentDetailsMap.get(invoiceNumber)?.datePaiement,
                BanqueSGL: paymentDetailsMap.get(invoiceNumber)?.BanqueSGL,
                compteSGL: paymentDetailsMap.get(invoiceNumber)?.compteSGL,
                BanqueFournisseur: paymentDetailsMap.get(invoiceNumber)?.BanqueFournisseur,
                compteFournisseur: paymentDetailsMap.get(invoiceNumber)?.compteFournisseur,
                paiedby: paymentDetailsMap.get(invoiceNumber)?.paiedby,
                fichier: paymentDetailsMap.get(invoiceNumber)?.fichier,
              }
            : undefined,
        };
      });

      setInvoicesWithPayments(enriched);
    } catch (err) {
      console.error('Erreur lors du chargement des paiements:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '', 'width=1400,height=900');
    if (printWindow) {
      const table = document.querySelector('table')?.outerHTML;
      const printStyle = `
        <style>
          @media print {
            @page {
              size: landscape;
              margin: 5mm;
            }
            body {
              margin: 0;
              padding: 10mm;
              font-family: Arial, sans-serif;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 6px;
              text-align: left;
            }
            th {
              background-color: #e5e7eb;
              font-weight: bold;
            }
            tr:nth-child(even) {
              background-color: #f9fafb;
            }
          }
        </style>
      `;
      const content = `
        ${printStyle}
        <h2>${displayTitle}</h2>
        ${table}
        <div style="margin-top: 20px; font-size: 12px; font-weight: bold;">
          <p>Total Facture: $${formatCurrency(displayTotals.totalAmount)} | Montant Payé: $${formatCurrency(displayTotals.totalPaid)} | Solde à Payer: $${formatCurrency(displayTotals.totalRemaining)}</p>
        </div>
      `;
      printWindow.document.write(content);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  const exportToExcel = () => {
    // Préparer les données du tableau
    const tableData: any[] = sortedInvoices.map(invoice => ({
      'Numéro Facture': invoice['Numéro de facture'],
      'Fournisseur': invoice.Fournisseur,
      'Date Réception': new Date(invoice['Date de réception']).toLocaleDateString('fr-FR'),
      'Montant': parseFloat(invoice.Montant as any) || 0,
      'Montant Payé': invoice.totalPaid,
      'Solde à Payer': invoice.solde
    }));

    // Ajouter une ligne vide puis les totaux
    tableData.push({
      'Numéro Facture': '',
      'Fournisseur': '',
      'Date Réception': '',
      'Montant': 0,
      'Montant Payé': 0,
      'Solde à Payer': 0
    });

    tableData.push({
      'Numéro Facture': 'TOTAUX',
      'Fournisseur': '',
      'Date Réception': '',
      'Montant': displayTotals.totalAmount,
      'Montant Payé': displayTotals.totalPaid,
      'Solde à Payer': displayTotals.totalRemaining
    });

    // Créer un workbook et ajouter la feuille
    const worksheet = XLSX.utils.json_to_sheet(tableData);
    
    // Définir la largeur des colonnes
    const colWidths = [
      { wch: 15 }, // Numéro Facture
      { wch: 20 }, // Fournisseur
      { wch: 15 }, // Date Réception
      { wch: 15 }, // Montant
      { wch: 15 }, // Montant Payé
      { wch: 15 }  // Solde à Payer
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, displayTitle);

    // Télécharger le fichier
    XLSX.writeFile(workbook, `${displayTitle.replace(/\s+/g, '_')}.xlsx`);
  };

  const calculateTotals = (rows: InvoiceWithPayments[]) => {
    const totals = {
      totalAmount: 0,
      totalPaid: 0,
      totalRemaining: 0
    };

    rows.forEach((invoice) => {
      totals.totalAmount += parseFloat(invoice.Montant as any) || 0;
      totals.totalPaid += invoice.totalPaid || 0;
      totals.totalRemaining += invoice.solde || 0;
    });

    return totals;
  };

  const calculateDueDate = (invoice: InvoiceWithPayments): Date | null => {
    // Si l'échéance est définie, l'utiliser
    if (invoice['Échéance']) {
      return new Date(invoice['Échéance']);
    }
    
    // Sinon, calculer à partir de la date de réception + délais de paiement
    if (invoice['Date de réception'] && invoice['Délais de paiement']) {
      const receptionDate = new Date(invoice['Date de réception']);
      const daysToAdd = invoice['Délais de paiement'] as any as number;
      const dueDate = new Date(receptionDate);
      dueDate.setDate(dueDate.getDate() + daysToAdd);
      return dueDate;
    }
    
    return null;
  };

  const isInvoiceOverdue = (invoice: InvoiceWithPayments): boolean => {
    const dueDate = calculateDueDate(invoice);
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today && invoice.solde > 0.01;
  };

  const isBonAPayer = (invoice: InvoiceWithPayments): boolean => {
    // Règle demandée: Bon à payer uniquement après validation DOP
    const drValidated = invoice['validation DR'] !== null && invoice['validation DR'] !== undefined && invoice['validation DR'] !== '';
    const dopValidated = invoice['validation DOP'] !== null && invoice['validation DOP'] !== undefined && invoice['validation DOP'] !== '';
    const isRejected = invoice.Statut?.toUpperCase().includes('REJET');
    
    if (isRejected) return false;
    return dopValidated;
  };

  const handleContextMenu = (e: React.MouseEvent, invoice: InvoiceWithPayments) => {
    e.preventDefault();
    console.log('Context menu triggered for invoice:', invoice['Numéro de facture']);
    console.log('Is Bon à Payer:', isBonAPayer(invoice));
    console.log('Invoice data:', {
      Montant: invoice.Montant,
      'validation DR': invoice['validation DR'],
      'validation DOP': invoice['validation DOP'],
      Statut: invoice.Statut
    });
    
    // Uniquement pour les factures "Bon à Payer"
    if (isBonAPayer(invoice)) {
      console.log('Setting context menu');
      setContextMenu({
        invoice,
        position: { x: e.clientX, y: e.clientY }
      });
    } else {
      console.log('Invoice is not Bon à Payer, menu not shown');
    }
  };

  const sortedInvoices = [...invoicesWithPayments].sort((a, b) => {
    const montantA = parseFloat(a.Montant as any) || 0;
    const montantB = parseFloat(b.Montant as any) || 0;
    return montantB - montantA;
  });

  const availableRegions = Array.from(
    new Set(invoicesWithPayments.map((inv) => String(inv['Région'] || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const availableSuppliers = Array.from(
    new Set(invoicesWithPayments.map((inv) => String(inv.Fournisseur || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const availableYears = Array.from(
    new Set(
      invoicesWithPayments
        .map((inv) => inv.paymentInfo?.datePaiement)
        .filter(Boolean)
        .map((d) => new Date(d as string).getFullYear())
        .filter((year) => !Number.isNaN(year))
    )
  ).sort((a, b) => b - a);

  const filteredInvoices = sortedInvoices.filter((invoice) => {
    const search = searchQuery.trim().toLowerCase();
    if (search) {
      const invoiceNumber = String(invoice['Numéro de facture'] || '').toLowerCase();
      const supplier = String(invoice.Fournisseur || '').toLowerCase();
      const category = String(invoice['Catégorie de charge'] || '').toLowerCase();
      const matchesSearch = invoiceNumber.includes(search) || supplier.includes(search) || category.includes(search);
      if (!matchesSearch) return false;
    }

    if (!isPaidReportMode) return true;

    if (filterRegion !== 'all' && String(invoice['Région'] || '') !== filterRegion) {
      return false;
    }
    if (filterSupplier !== 'all' && String(invoice.Fournisseur || '') !== filterSupplier) {
      return false;
    }

    const paymentDate = invoice.paymentInfo?.datePaiement
      ? new Date(invoice.paymentInfo.datePaiement)
      : null;

    if (filterYear !== 'all') {
      if (!paymentDate || paymentDate.getFullYear() !== Number(filterYear)) {
        return false;
      }
    }

    if (filterMonth !== 'all') {
      if (!paymentDate || paymentDate.getMonth() + 1 !== Number(filterMonth)) {
        return false;
      }
    }

    if (filterDateFrom) {
      if (!paymentDate || paymentDate < new Date(filterDateFrom)) {
        return false;
      }
    }

    if (filterDateTo) {
      if (!paymentDate || paymentDate > new Date(`${filterDateTo}T23:59:59`)) {
        return false;
      }
    }

    return true;
  });

  const displayTotals = calculateTotals(filteredInvoices);
  const totalsByCurrency = filteredInvoices.reduce<Record<string, { total: number; paid: number; remaining: number }>>((acc, invoice) => {
    const currency = String(invoice.Devise || 'USD').toUpperCase();
    if (!acc[currency]) {
      acc[currency] = { total: 0, paid: 0, remaining: 0 };
    }
    acc[currency].total += parseFloat(invoice.Montant as any) || 0;
    acc[currency].paid += invoice.totalPaid || 0;
    acc[currency].remaining += invoice.solde || 0;
    return acc;
  }, {});
  const currencyRows = Object.entries(totalsByCurrency);

  const handleInvoiceNumberClick = async (invoice: InvoiceWithPayments) => {
    if (invoice.hasPayments) {
      const { data, error } = await supabase
        .from('FACTURES')
        .select('*')
        .eq('ID', invoice.ID)
        .single();

      if (!error && data) {
        const invoiceForModal = {
          invoiceNumber: data['Numéro de facture'],
          amount: parseFloat(data.Montant),
          supplier: data.Fournisseur,
          receptionDate: data['Date de réception'],
        };
        setPaiementModal({ isOpen: true, invoice: invoiceForModal, ordoPaiementId });
      }
    } else {
      const { data, error } = await supabase
        .from('FACTURES')
        .select('*')
        .eq('ID', invoice.ID)
        .single();

      if (!error && data) {
        const invoiceForModal = {
          invoiceNumber: data['Numéro de facture'],
          amount: parseFloat(data.Montant),
          supplier: data.Fournisseur,
          receptionDate: data['Date de réception'],
        };
        setViewInvoiceModal({ isOpen: true, invoice: invoiceForModal });
      }
    }
  };

  const handleViewInvoice = (invoice: InvoiceWithPayments) => {
    const invoiceForModal = {
      invoiceNumber: invoice['Numéro de facture'],
      amount: parseFloat(invoice.Montant as any),
      supplier: invoice.Fournisseur,
      receptionDate: invoice['Date de réception'],
    };
    setViewInvoiceModal({ isOpen: true, invoice: invoiceForModal });
  };

  const handlePayInvoice = (invoice: InvoiceWithPayments) => {
    const invoiceForModal = {
      invoiceNumber: invoice['Numéro de facture'],
      amount: parseFloat(invoice.Montant as any),
      supplier: invoice.Fournisseur,
      receptionDate: invoice['Date de réception'],
    };
    setPaiementModal({ isOpen: true, invoice: invoiceForModal, ordoPaiementId });
  };

  const handleAddToPaymentOrder = async (invoice: InvoiceWithPayments) => {
    try {
      // Logique pour ajouter à l'ordre de paiement du jour
      success('Facture ajoutée à l\'ordre de paiement du jour');
    } catch (err) {
      showError('Erreur lors de l\'ajout à l\'ordre de paiement');
    }
  };

  // Fonctions adaptées pour ContextMenu (attend type Invoice)
  const handleContextMenuViewInvoice = (invoice: ContextInvoice) => {
    const invoiceForModal = {
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      supplier: invoice.supplier,
      receptionDate: invoice.receptionDate,
    };
    setViewInvoiceModal({ isOpen: true, invoice: invoiceForModal });
  };

  const handleContextMenuPayInvoice = (invoice: ContextInvoice) => {
    const invoiceForModal = {
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      supplier: invoice.supplier,
      receptionDate: invoice.receptionDate,
    };
    setPaiementModal({ isOpen: true, invoice: invoiceForModal, ordoPaiementId });
  };

  const handleContextMenuAddToPaymentOrder = async (_invoice: ContextInvoice) => {
    try {
      success('Facture ajoutée à l\'ordre de paiement du jour');
    } catch (err) {
      showError('Erreur lors de l\'ajout à l\'ordre de paiement');
    }
  };

  // Convertir InvoiceWithPayments en Invoice pour ContextMenu
  const convertToInvoice = (invoiceWithPayments: InvoiceWithPayments): ContextInvoice => ({
    id: invoiceWithPayments.ID || 0,
    invoiceNumber: invoiceWithPayments['Numéro de facture'] || '',
    supplier: invoiceWithPayments.Fournisseur || '',
    receptionDate: invoiceWithPayments['Date de réception'] || '',
    amount: parseFloat(invoiceWithPayments.Montant as any) || 0,
    currency: (invoiceWithPayments.Devise || 'USD') as 'USD' | 'CDF' | 'EUR',
    chargeCategory: invoiceWithPayments['Catégorie de charge'] || '',
    urgencyLevel: (invoiceWithPayments['Niveau urgence'] || 'Basse') as 'Basse' | 'Moyenne' | 'Haute',
    status: 'bon-a-payer' as InvoiceStatus,
    region: (invoiceWithPayments['Région'] || 'OUEST') as 'OUEST' | 'SUD' | 'EST' | 'NORD',
    manager: invoiceWithPayments['Gestionnaire'] || '',
    costCenter: invoiceWithPayments['Centre de coût'] || ''
  });

  const handlePaymentButtonClick = async (invoice: InvoiceWithPayments) => {
    const { data, error } = await supabase
      .from('FACTURES')
      .select('*')
      .eq('ID', invoice.ID)
      .single();

    if (!error && data) {
      const invoiceForModal = {
        invoiceNumber: data['Numéro de facture'],
        amount: parseFloat(data.Montant),
        supplier: data.Fournisseur,
        receptionDate: data['Date de réception'],
      };
      setPaiementModal({ isOpen: true, invoice: invoiceForModal, ordoPaiementId });
    }
  };

  const scope = invoiceTypeScope === 'frais-generaux' ? 'frais-generaux' : 'operationnel';
  const canEditPaiementModal = Boolean(ordoPaiementId) || canMarkAsPaid(scope);

  const handleRemoveInvoice = async (invoice: InvoiceWithPayments) => {
    if (!ordoPaiementId) return;

    try {
      // Get the current order
      const { data: order, error: fetchError } = await supabase
        .from('ORDRE_PAIEMENT')
        .select('facture')
        .eq('ID', ordoPaiementId)
        .single();

      if (fetchError || !order) {
        showError('Erreur: Ordre de paiement non trouvé');
        return;
      }

      // Parse the facture JSON
      let factures: any[] = [];
      try {
        const parsed = JSON.parse(order.facture);
        factures = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        showError('Erreur de parsing du JSON');
        return;
      }

      // Filter out the invoice to remove
      const invoiceNumber = invoice['Numéro de facture'];
      const updatedFactures = factures.filter((f: any) => 
        (f.invoiceNumber !== invoiceNumber && f['Numéro de facture'] !== invoiceNumber)
      );

      // Update the order with the new facture JSON
      const { error: updateError } = await supabase
        .from('ORDRE_PAIEMENT')
        .update({ 
          facture: JSON.stringify(updatedFactures),
          NumeroFacture: updatedFactures.map((f: any) => f.invoiceNumber || f['Numéro de facture']).join(', ')
        })
        .eq('ID', ordoPaiementId);

      if (updateError) {
        showError('Erreur lors de la suppression: ' + updateError.message);
        return;
      }

      success(`✓ Facture ${invoiceNumber} retirée de l'ordre de paiement`);
      
      // Remove from local state
      setInvoicesWithPayments(invoicesWithPayments.filter(inv => inv.ID !== invoice.ID));
      
      // Notify parent component to reload
      onInvoiceRemoved?.();
    } catch (err) {
      showError('Erreur lors de la suppression: ' + (err instanceof Error ? err.message : 'Erreur inconnue'));
    }
  };

  const handleClose = () => {
    // Actualiser les données du modal avant fermeture
    loadInvoicePayments();
    
    // Rafraîchir le tableau des données à la fermeture
    if (onInvoiceRemoved) {
      onInvoiceRemoved();
    }
    
    // Émettre l'événement de fermeture de modal pour le rechargement automatique
    window.dispatchEvent(new Event('modalClosed'));
    onClose();
  };

  const handleRefreshCurrentView = async () => {
    setIsRefreshing(true);
    try {
      await loadInvoicePayments();
      refreshAllData();
      success('Données actualisées depuis la base.');
    } catch {
      showError('Erreur lors de l’actualisation des données.');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 ${isFullscreen ? 'p-0' : ''}`}>
        <div className={`bg-white rounded-lg shadow-xl overflow-hidden flex flex-col ${isFullscreen ? 'w-full h-screen' : 'max-w-[1400px] w-full h-[95vh]'}`}>
          {/* En-tête */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gray-200 border-b p-4 shadow-md">
            <h2 className="text-lg font-bold text-gray-900">{displayTitle}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full md:w-[420px] md:max-w-[45vw] md:min-w-[300px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher: numéro, fournisseur, catégorie..."
                  className="w-full h-9 pl-9 pr-3 border border-gray-300 rounded-lg text-xs leading-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              {isPaidReportMode && (
                <button
                  onClick={() => setShowPaidFilters((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors text-xs font-semibold text-gray-700"
                  title="Afficher/Masquer les filtres"
                >
                  <Filter size={14} />
                  Filtres
                </button>
              )}
              <button
                onClick={handleRefreshCurrentView}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
                title="Actualiser"
                disabled={isRefreshing}
              >
                <RefreshCw size={20} className={`text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
                title="Vue plein écran"
              >
                <Maximize2 size={20} className="text-gray-600" />
              </button>
              <button
                onClick={exportToExcel}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
                title="Exporter en Excel"
              >
                <i className="fa fa-file-excel-o text-gray-600 text-xl"></i>
              </button>
              <button
                onClick={handlePrint}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
                title="Imprimer"
              >
                <Printer size={20} className="text-gray-600" />
              </button>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>
          </div>

          {/* Résumé sous le titre */}
          <div className="border-b p-4 bg-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-600 mb-0.5">Total Facture ({filteredInvoices.length})</p>
                <p className="text-base font-bold text-gray-900">
                  {currencyRows.length === 1
                    ? formatMoney(displayTotals.totalAmount, currencyRows[0][0])
                    : formatCurrency(displayTotals.totalAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-0.5">Montant Payé</p>
                <p className="text-base font-bold text-green-600">
                  {currencyRows.length === 1
                    ? formatMoney(displayTotals.totalPaid, currencyRows[0][0])
                    : formatCurrency(displayTotals.totalPaid)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-0.5">Solde à Payer</p>
                <p className="text-base font-bold text-red-600">
                  {currencyRows.length === 1
                    ? formatMoney(displayTotals.totalRemaining, currencyRows[0][0])
                    : formatCurrency(displayTotals.totalRemaining)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-0.5">Nombre de factures</p>
                <p className="text-base font-bold text-gray-900">{filteredInvoices.length}</p>
              </div>
            </div>
            {currencyRows.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {currencyRows.map(([currency, totals]) => (
                  <span key={currency} className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-gray-300 text-gray-700">
                    {currency}: {formatMoney(totals.total, currency)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Tableau des factures */}
          <div className="flex-1 overflow-auto">
            {isPaidReportMode && showPaidFilters && (
              <div className="p-4 border-b bg-white">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <select
                    value={filterRegion}
                    onChange={(e) => setFilterRegion(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  >
                    <option value="all">Région: Toutes</option>
                    {availableRegions.map((region) => (
                      <option key={region} value={region}>
                        Région: {region}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterSupplier}
                    onChange={(e) => setFilterSupplier(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  >
                    <option value="all">Fournisseur: Tous</option>
                    {availableSuppliers.map((supplier) => (
                      <option key={supplier} value={supplier}>
                        {supplier}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  >
                    <option value="all">Année: Toutes</option>
                    {availableYears.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  >
                    <option value="all">Mois: Tous</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={String(month)}>
                        Mois {month}
                      </option>
                    ))}
                  </select>

                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs"
                    title="Date de paiement du"
                  />

                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs"
                    title="Date de paiement au"
                  />
                </div>
              </div>
            )}
            {loading ? (
              <p className="text-center text-gray-500 py-8 text-sm">Chargement des données...</p>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-10 text-center">
                <img src={EMPTY_ANIMATION_SVG} alt="Aucune donnée" className="mx-auto w-40 h-auto animate-bounce" />
                <p className="mt-3 text-sm font-semibold text-gray-600">Aucune facture à afficher.</p>
                <p className="text-xs text-gray-500">Ajustez les filtres ou actualisez les données.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b bg-gray-200">
                    {isPaidReportMode ? (
                      <>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">Numéro Facture</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">Fournisseur</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-900 text-xs">Montant</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">Mode paiement</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">Banque SGL / Compte</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">Banque fournisseur / Compte</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">PaidBy</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">Fichier</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">Date paiement</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                          Numéro Facture
                        </th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                          Fournisseur
                        </th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                          Date Réception
                        </th>
                        {agent?.REGION === 'TOUT' && (
                          <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                            Région
                          </th>
                        )}
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                          Catégorie de charge
                        </th>
                        <th className="text-center py-2 px-3 font-semibold text-gray-900 text-xs">
                          Priorité de paiement
                        </th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                          Échéance
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-900 text-xs">
                          Montant
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-900 text-xs">
                          Montant Payé
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-900 text-xs">
                          Solde à Payer
                        </th>
                        <th className="text-center py-2 px-3 font-semibold text-gray-900 text-xs">
                          PDF
                        </th>
                        {ordoPaiementId && (
                          <th className="text-center py-2 px-3 font-semibold text-gray-900 text-xs">
                            Payer
                          </th>
                        )}
                        {ordoPaiementId && (
                          <th className="text-center py-2 px-3 font-semibold text-gray-900 text-xs">
                            Retirer
                          </th>
                        )}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice, index) => {
                    const isPaid = invoice.solde <= 0.01;
                    const isPartiallyPaid = invoice.totalPaid > 0 && invoice.solde > 0.01;
                    const isOverdue = isInvoiceOverdue(invoice);
                    const showBlueBar = isPaid || isPartiallyPaid;
                    
                    return (
                    <tr 
                      key={index} 
                      className={`border-b hover:bg-blue-50 hover:shadow-sm transition-all duration-200 cursor-context-menu hover:border-blue-200 border-l-4 ${
                        isOverdue ? 'border-l-red-500' : showBlueBar ? 'border-l-blue-500' : 'border-l-yellow-400'
                      } ${isBonAPayer(invoice) ? 'cursor-context-menu' : ''}`}
                      onContextMenu={(e) => handleContextMenu(e, invoice)}
                    >
                      <td 
                        className="py-2 px-3 text-xs text-blue-600 cursor-pointer hover:underline font-semibold hover:text-blue-800 transform hover:scale-105 transition-all duration-200"
                        onClick={() => handleInvoiceNumberClick(invoice)}
                      >
                        {invoice['Numéro de facture']}
                      </td>
                      {isPaidReportMode ? (
                        <>
                          <td className="py-2 px-3 text-xs text-gray-700">
                            {invoice.Fournisseur || 'N/A'}
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-900 text-right font-semibold">
                            {formatCurrency(invoice.Montant)} USD
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-700">
                            {invoice.paymentInfo?.modePaiement || 'N/A'}
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-700">
                            <div className="flex flex-col gap-1">
                              <span>{invoice.paymentInfo?.BanqueSGL || 'N/A'}</span>
                              {invoice.paymentInfo?.compteSGL ? (
                                <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-semibold">
                                  {invoice.paymentInfo.compteSGL}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-[10px]">Compte N/A</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-700">
                            <div className="flex flex-col gap-1">
                              <span>{invoice.paymentInfo?.BanqueFournisseur || 'N/A'}</span>
                              {invoice.paymentInfo?.compteFournisseur ? (
                                <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                                  {invoice.paymentInfo.compteFournisseur}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-[10px]">Compte N/A</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-700">
                            {invoice.paymentInfo?.paiedby || 'N/A'}
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-700">
                            {invoice.paymentInfo?.fichier ? (
                              <a
                                href={invoice.paymentInfo.fichier}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                Voir fichier
                              </a>
                            ) : (
                              'N/A'
                            )}
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-700">
                            {invoice.paymentInfo?.datePaiement
                              ? new Date(invoice.paymentInfo.datePaiement).toLocaleDateString('fr-FR')
                              : 'N/A'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-3 text-xs text-gray-700 hover:text-gray-900 transition-colors">
                            {invoice.Fournisseur}
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-700 hover:text-gray-900 transition-colors">
                            {new Date(invoice['Date de réception']).toLocaleDateString('fr-FR')}
                          </td>
                          {agent?.REGION === 'TOUT' && (
                            <td className="py-2 px-3 text-xs">
                              {(() => {
                                const region = invoice['Région'] as string;
                                if (!region) return <span className="text-gray-500">N/A</span>;
                                
                                const regionColors: Record<string, { bg: string; text: string }> = {
                                  'OUEST': { bg: 'bg-blue-100', text: 'text-blue-800' },
                                  'EST': { bg: 'bg-green-100', text: 'text-green-800' },
                                  'SUD': { bg: 'bg-orange-100', text: 'text-orange-800' },
                                  'NORD': { bg: 'bg-purple-100', text: 'text-purple-800' }
                                };
                                
                                const colors = regionColors[region.toUpperCase()] || { bg: 'bg-gray-100', text: 'text-gray-800' };
                                
                                return (
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                                    {region}
                                  </span>
                                );
                              })()}
                            </td>
                          )}
                          <td className="py-2 px-3 text-xs text-gray-700 hover:text-gray-900 transition-colors">
                            {invoice['Catégorie de charge'] === 'Bulletin de liquidation' ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                                <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                                Bulletin de liquidation
                              </span>
                            ) : (
                              invoice['Catégorie de charge'] || 'N/A'
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {formatSingleWord(invoice['Niveau urgence'])}
                          </td>
                          <td className={`py-2 px-3 text-xs transition-colors font-semibold ${
                            isOverdue ? 'text-red-600 bg-red-50' : 'text-gray-700'
                          }`}>
                            {(() => {
                              const dueDate = calculateDueDate(invoice);
                              return dueDate 
                                ? dueDate.toLocaleDateString('fr-FR')
                                : 'N/A';
                            })()}
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-900 text-right font-semibold hover:text-gray-950 transition-colors">
                            {formatCurrency(invoice.Montant)} USD
                          </td>
                          <td className="py-2 px-3 text-xs text-right font-semibold bg-gray-100 hover:bg-gray-200 transition-colors">
                            <span className={invoice.totalPaid > 0 ? 'text-green-600' : 'text-gray-700'}>
                              {formatCurrency(invoice.totalPaid)} USD
                            </span>
                          </td>
                          <td className="py-2 px-3 text-xs text-right font-semibold bg-gray-100 hover:bg-gray-200 transition-colors">
                            <span className={invoice.solde > 0 ? 'text-red-600' : 'text-green-600'}>
                              {formatCurrency(invoice.solde)} USD
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center hover:bg-blue-100 rounded transition-all duration-200">
                            {invoice['Facture attachée'] ? (
                              <button
                                onClick={() => 
                                  setPdfModal({
                                    isOpen: true,
                                    url: invoice['Facture attachée'],
                                    title: `Facture ${invoice['Numéro de facture']}`,
                                    summary: {
                                      totalAmount: parseFloat(invoice.Montant as any) || 0,
                                      totalPaid: invoice.totalPaid,
                                      totalRemaining: invoice.solde
                                    }
                                  })
                                }
                                className="inline-flex items-center justify-center p-2 text-red-700 hover:text-red-900 hover:bg-red-100 rounded-lg transition-all duration-200 transform hover:scale-125"
                                title="Afficher le PDF"
                              >
                                <i className="fa fa-file-pdf-o text-lg"></i>
                              </button>
                            ) : (
                              <span className="text-gray-400 text-xs">N/A</span>
                            )}
                          </td>
                          {ordoPaiementId && (
                            <td className="py-2 px-3 text-center hover:bg-green-100 rounded transition-all duration-200">
                              <button
                                onClick={() => handlePaymentButtonClick(invoice)}
                                disabled={invoice.solde <= 0.01}
                                className={`inline-flex items-center justify-center p-2 rounded-lg transition-all duration-200 transform hover:scale-110 ${
                                  invoice.solde <= 0.01
                                    ? 'text-gray-400 cursor-not-allowed opacity-50'
                                    : 'text-green-700 hover:text-green-900 hover:bg-green-200'
                                }`}
                                title={invoice.solde <= 0.01 ? 'Facture entièrement payée' : 'Enregistrer un paiement'}
                              >
                                <CreditCard size={18} />
                              </button>
                            </td>
                          )}
                          {ordoPaiementId && (
                            <td className="py-2 px-3 text-center hover:bg-red-100 rounded transition-all duration-200">
                              <button
                                onClick={() => handleRemoveInvoice(invoice)}
                                className="inline-flex items-center justify-center p-2 text-red-700 hover:text-red-900 hover:bg-red-100 rounded-lg transition-all duration-200 transform hover:scale-110"
                                title="Retirer de l'ordre de paiement"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ViewInvoiceModal */}
      {viewInvoiceModal.isOpen && viewInvoiceModal.invoice && (
        <ViewInvoiceModal
          invoice={viewInvoiceModal.invoice}
          onClose={() => setViewInvoiceModal({ isOpen: false, invoice: null })}
        />
      )}

      {/* PaiementModal */}
      {paiementModal.isOpen && paiementModal.invoice && (
        <PaiementModal
          invoice={paiementModal.invoice}
          onClose={() => {
            setPaiementModal({ isOpen: false, invoice: null, ordoPaiementId: undefined });
            // Actualiser les données du modal avant fermeture
            loadInvoicePayments();
          }}
          readOnly={!canEditPaiementModal}
          ordoPaiementId={paiementModal.ordoPaiementId}
        />
      )}

      {/* ViewPdfModal */}
      <ViewPdfModal
        isOpen={pdfModal.isOpen}
        onClose={() => setPdfModal({ isOpen: false, title: '', summary: undefined })}
        pdfUrl={pdfModal.url}
        title={pdfModal.title}
        summary={pdfModal.summary}
      />

      {/* Menu contextuel pour les factures "Bon à Payer" */}
      {contextMenu && contextMenu.invoice && (
        <ContextMenu
          key="context-menu"
          invoice={convertToInvoice(contextMenu.invoice)}
          position={contextMenu.position}
          onView={handleContextMenuViewInvoice}
          onEdit={() => {}} // Pas d'édition pour le moment
          onPay={handleContextMenuPayInvoice}
          onAddToPaymentOrder={handleContextMenuAddToPaymentOrder}
          onClose={() => setContextMenu(null)}
          activeMenu={invoiceTypeScope === 'frais-generaux' ? 'factures-ffg-validated' : 'factures-validated'}
        />
      )}
    </>
  );
}

export default InvoiceDetailModal;

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import StatCard from '../components/StatCard';
import InvoiceDetailModal from '../components/InvoiceDetailModal';
import PaiementModal from '../components/PaiementModal';
import Top10SuppliersModal from '../components/Top10SuppliersModal';
import TopProgressBar from '../components/TopProgressBar';
import LoadingSpinner from '../components/LoadingSpinner';
import MonthlyInvoiceChart from '../components/MonthlyInvoiceChart';
import SkeletonCard from '../components/SkeletonCard';
import SkeletonGrid from '../components/SkeletonGrid';
import ViewInvoiceModal from '../components/ViewInvoiceModal';
import { dashboardService, type DashboardStats, type TopSupplier, type Invoice, type MonthlyInvoiceStats } from '../services/tableService';
import { supabase } from '../services/supabase';
import { formatCurrency } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';
import { useDataRefresh, REFRESH_EVENTS } from '../hooks/useDataRefresh';

interface DashboardProps {
  activeMenu?: string;
  menuTitle?: string;
  invoiceTypeScope?: 'operationnel' | 'frais-generaux';
}

interface BlockingCharge {
  id: number;
  designation: string;
  nombreFactures: number;
  montantTotal: number;
  montantPaye: number;
  montantNonPaye: number;
}

interface UrgencyStats {
  urgentes: { montant: number; count: number };
  prioritaires: { montant: number; count: number };
  normales: { montant: number; count: number };
}

interface AgeStats {
  zero30: { montant: number; count: number };
  thirty60: { montant: number; count: number };
  sixty90: { montant: number; count: number };
  plus90: { montant: number; count: number };
}

interface SupplierAgeRow {
  fournisseur: string;
  nonEchu: number;
  zero30: number;
  thirty60: number;
  sixty90: number;
  plus90: number;
  total: number;
}

interface BulletinSupplierBreakdown {
  fournisseur: string;
  totalMontant: number;
  totalPaid: number;
  totalUnpaid: number;
  totalRejected: number;
  count: number;
}

interface ModalState {
  isOpen: boolean;
  type: 'total' | 'nonPayee' | 'bonAPayer' | 'enAttenteValidation' | 'payee' | 'partiellementPayee' | 'rejetee' | 'echue' | 'topSupplier' | null;
  invoices: Invoice[];
  title?: string;
  summary?: {
    totalAmount?: number;
    totalPaid?: number;
    totalRemaining?: number;
  };
}

interface Top10Supplier {
  fournisseur: string;
  nombreFactures: number;
  montantNonPaye: number;
}

function Dashboard({ menuTitle, invoiceTypeScope = 'operationnel' }: DashboardProps) {
  const { agent } = useAuth();
  const [activeTab, setActiveTab] = useState(1);
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('all');
  // Initialiser à undefined - la synchronisation avec agent se fera via useEffect
  const [selectedRegionBulletin, setSelectedRegionBulletin] = useState<string | undefined>(undefined);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [regions, setRegions] = useState<string[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topSupplier, setTopSupplier] = useState<TopSupplier | null>(null);
  const [blockingCharges, setBlockingCharges] = useState<BlockingCharge[]>([]);
  const [urgencyStats, setUrgencyStats] = useState<UrgencyStats | null>(null);
  const [ageStats, setAgeStats] = useState<AgeStats | null>(null);
  const [supplierAgeData, setSupplierAgeData] = useState<SupplierAgeRow[]>([]);
  const [bulletinSupplierData, setBulletinSupplierData] = useState<BulletinSupplierBreakdown[]>([]);
  const [bulletinGlobalStats, setBulletinGlobalStats] = useState<DashboardStats | null>(null);
  const [bulletinUrgencyStats, setBulletinUrgencyStats] = useState<UrgencyStats | null>(null);
  const [bulletinAgeStats, setBulletinAgeStats] = useState<AgeStats | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyInvoiceStats[]>([]);
  const [costCenterData, setCostCenterData] = useState<Array<{ centre: string; montant: number; nombreFactures: number; montantPaye: number; montantNonPaye: number }>>([]);
  const [supplierCategories, setSupplierCategories] = useState<Array<{ category: string; color: string; count: number; montant: number; nombreFournisseurs: number; montantPaye: number; soldeAPayer: number }>>([]);
  const [selectedSupplierCategory, setSelectedSupplierCategory] = useState<string | null>(null);
  const [suppliersByCategory, setSuppliersByCategory] = useState<Array<{ fournisseur: string; montant: number; nombreFactures: number; montantPaye: number; solde: number }>>([]);
  const [selectedSupplierForModal, setSelectedSupplierForModal] = useState<string | null>(null);
  const [supplierInvoices, setSupplierInvoices] = useState<any[]>([]);
  const [supplierModalLoading, setSupplierModalLoading] = useState(false);
  const [invoiceForViewModal, setInvoiceForViewModal] = useState<any>(null);
  const [invoiceForPaiementModal, setInvoiceForPaiementModal] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [top10Suppliers, setTop10Suppliers] = useState<Top10Supplier[]>([]);
  const [top10Loading, setTop10Loading] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: null,
    invoices: [],
    title: '',
  });
  const [top10Modal, setTop10Modal] = useState<{ isOpen: boolean }>({
    isOpen: false,
  });

  const tabs = [
    { id: 1, label: 'Global' },
    { id: 2, label: 'Bulletin de Liquidation' },
    { id: 3, label: 'Factures à impact opérationnel' },
    { id: 4, label: 'Balance agée' },
    { id: 5, label: 'Centre des coûts' },
    { id: 6, label: 'Catégorie Fournisseurs' }
  ].filter((tab) => invoiceTypeScope === 'frais-generaux' ? ![2, 3].includes(tab.id) : true);

  useEffect(() => {
    if (invoiceTypeScope === 'frais-generaux' && (activeTab === 2 || activeTab === 3)) {
      setActiveTab(1);
    }
  }, [invoiceTypeScope, activeTab]);

  const loadCostCenterData = async (costCenterRegion?: string | null) => {
    try {
      const region = costCenterRegion !== undefined ? costCenterRegion : selectedRegionBulletin;
      // Si region est undefined, charger TOUS les centres de coûts
      // Sinon, charger les centres de coûts de la région spécifiée
      if (region === undefined) {
        // Afficher tous les centres de coûts (toutes régions)
        const costCenters = await dashboardService.getCostCentersWithStats(selectedYear, invoiceTypeScope);
        setCostCenterData(costCenters);
      } else if (region) {
        // Afficher les centres de coûts de la région spécifiée
        const costCenters = await dashboardService.getCostCentersWithStatsByRegion(region, selectedYear, invoiceTypeScope);
        setCostCenterData(costCenters);
      } else {
        // Pas de région (edge case)
        setCostCenterData([]);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des données des centres de coûts:', err);
    }
  };

  const loadSupplierCategories = async () => {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, Montant, "Catégorie fournisseur", "Fournisseur", "Date de réception", "Numéro de facture", "Région"')
        .eq('Type de facture', invoiceTypeScope);
      
      if (error) throw error;

      // Charger les paiements
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');
      
      if (paiementsError) throw paiementsError;

      // Créer une map des paiements par numéro de facture
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture;
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);
        });
      }

      // Filtrer par année, mois et région
      const monthFilter = selectedMonth !== 'all' ? parseInt(selectedMonth) : null;
      const filtered = (factures || []).filter((f: any) => {
        if (!f['Date de réception']) return false;
        const date = new Date(f['Date de réception']);
        if (date.getFullYear().toString() !== selectedYear) return false;
        if (monthFilter && date.getMonth() + 1 !== monthFilter) return false;
        // Filter by region - respect agent's region restrictions
        if (selectedRegionBulletin !== undefined && f['Région'] !== selectedRegionBulletin) return false;
        return true;
      });

      // Grouper par catégorie de fournisseur
      const categories = new Map<string, { montant: number; count: number; fournisseurs: Set<string>; montantPaye: number; soldeAPayer: number }>();
      
      filtered.forEach((f: any) => {
        const category = f['Catégorie fournisseur'] || 'Non spécifiée';
        const montant = parseFloat(f.Montant) || 0;
        const fournisseur = f['Fournisseur'];
        const invoiceNumber = f['Numéro de facture'];
        const totalPaidForInvoice = paymentMap.get(invoiceNumber) || 0;
        const reste = montant - totalPaidForInvoice;
        
        if (!categories.has(category)) {
          categories.set(category, { montant: 0, count: 0, fournisseurs: new Set(), montantPaye: 0, soldeAPayer: 0 });
        }
        
        const cat = categories.get(category)!;
        cat.montant += montant;
        cat.count += 1;
        cat.fournisseurs.add(fournisseur);
        cat.montantPaye += totalPaidForInvoice;
        cat.soldeAPayer += reste;
      });

      // Convertir en array avec couleurs
      const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-cyan-500'];
      const categoryArray = Array.from(categories.entries()).map(([category, data], idx) => ({
        category,
        color: colors[idx % colors.length],
        count: data.count,
        nombreFournisseurs: data.fournisseurs.size,
        montant: data.montant,
        montantPaye: data.montantPaye,
        soldeAPayer: data.soldeAPayer
      }));

      setSupplierCategories(categoryArray);
      setSelectedSupplierCategory(null);
    } catch (err) {
      console.error('Erreur lors du chargement des catégories de fournisseurs:', err);
    }
  };

  const loadSuppliersByCategory = async (category: string) => {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('Fournisseur, Montant, "Date de réception", "Numéro de facture", "Région", "Catégorie fournisseur"')
        .eq('Type de facture', invoiceTypeScope);
      
      if (error) throw error;

      // Charger les paiements
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');
      
      if (paiementsError) throw paiementsError;

      // Créer une map des paiements par numéro de facture
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture;
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);
        });
      }

      // Filtrer par année, mois, catégorie et région
      const monthFilter = selectedMonth !== 'all' ? parseInt(selectedMonth) : null;
      const filtered = (factures || []).filter((f: any) => {
        if (!f['Date de réception']) return false;
        const date = new Date(f['Date de réception']);
        if (date.getFullYear().toString() !== selectedYear) return false;
        if (monthFilter && date.getMonth() + 1 !== monthFilter) return false;
        // Filter by category
        if (f['Catégorie fournisseur'] !== category) return false;
        // Filter by region - respect agent's region restrictions
        if (selectedRegionBulletin !== undefined && f['Région'] !== selectedRegionBulletin) return false;
        return true;
      });

      // Grouper par fournisseur
      const suppliers = new Map<string, { montant: number; count: number; montantPaye: number; solde: number }>();
      
      filtered.forEach((f: any) => {
        const montant = parseFloat(f.Montant) || 0;
        const fournisseur = f['Fournisseur'];
        const invoiceNumber = f['Numéro de facture'];
        const totalPaidForInvoice = paymentMap.get(invoiceNumber) || 0;
        const reste = montant - totalPaidForInvoice;
        
        if (!suppliers.has(fournisseur)) {
          suppliers.set(fournisseur, { montant: 0, count: 0, montantPaye: 0, solde: 0 });
        }
        
        const sup = suppliers.get(fournisseur)!;
        sup.montant += montant;
        sup.count += 1;
        sup.montantPaye += totalPaidForInvoice;
        sup.solde += reste;
      });

      // Convertir et trier par solde décroissant (solde à payer en priorité)
      const supplierArray = Array.from(suppliers.entries())
        .map(([fournisseur, data]) => ({
          fournisseur,
          montant: data.montant,
          nombreFactures: data.count,
          montantPaye: data.montantPaye,
          solde: data.solde
        }))
        .sort((a, b) => b.solde - a.solde);

      setSuppliersByCategory(supplierArray);
    } catch (err) {
      console.error('Erreur lors du chargement des fournisseurs:', err);
    }
  };

  const loadSupplierInvoices = async (supplierName: string) => {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Montant, "Date de réception", Statut, "validation DR", "validation DOP", "validation DG"')
        .eq('Fournisseur', supplierName)
        .eq('Type de facture', invoiceTypeScope);
      
      if (error) throw error;

      // Charger les paiements
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');
      
      if (paiementsError) throw paiementsError;

      // Créer une map des paiements
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture;
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);
        });
      }

      // Enrichir les factures avec les données de paiement
      const enrichedInvoices = (factures || []).map((f: any) => {
        const invoiceNumber = f['Numéro de facture'];
        const montant = parseFloat(f.Montant) || 0;
        const totalPaid = paymentMap.get(invoiceNumber) || 0;
        return {
          ...f,
          montantPaye: totalPaid,
          solde: montant - totalPaid
        };
      });

      setSupplierInvoices(enrichedInvoices);
    } catch (err) {
      console.error('Erreur lors du chargement des factures du fournisseur:', err);
      setSupplierInvoices([]);
    } finally {
      setSupplierModalLoading(false);
    }
  };

  // Load supplier invoices when selectedSupplierForModal changes
  useEffect(() => {
    if (selectedSupplierForModal) {
      loadSupplierInvoices(selectedSupplierForModal);
    }
  }, [selectedSupplierForModal]);

  const loadDashboardData = async (withLoader = false) => {
    console.log('?? [Dashboard] loadDashboardData called with: year=', selectedYear, ', region=', selectedRegionBulletin, ', month=', selectedMonth);
    const shouldShowLoader = withLoader || (isInitialLoad && !stats);
    if (shouldShowLoader) {
      setLoading(true);
    }
    setError(null);
    
    try {
      // Phase 1: Charger les données critiques d'abord (cartes principales)
      const [dashStats, supplier, charges] = await Promise.all([
        dashboardService.getDashboardStats(selectedYear, selectedRegionBulletin, invoiceTypeScope),
        dashboardService.getTopSupplier(selectedYear, selectedRegionBulletin, invoiceTypeScope),
        dashboardService.getBlockingChargesStats(selectedYear, selectedRegionBulletin, invoiceTypeScope)
      ]);
      
      // Mettre à jour les données critiques immédiatement
      setStats(dashStats);
      setTopSupplier(supplier);
      setBlockingCharges(charges);
      
      console.log('?? [Dashboard] Critical data loaded. dashStats.totalMontant=', dashStats.totalMontant, ', chargesCount=', charges.length, ', topSupplier=', supplier?.fournisseur);

      // Débloquer rapidement l'affichage après les données critiques
      if (shouldShowLoader) {
        setLoading(false);
        setIsInitialLoad(false);
      }
      
      // Phase 2: Charger les données secondaires en parallèle
      const [urgency, age, supplierAge, bulletin, monthly, availableRegions] = await Promise.all([
        dashboardService.getInvoicesByUrgency(selectedYear, selectedRegionBulletin, invoiceTypeScope),
        dashboardService.getInvoicesByAge(selectedYear, selectedRegionBulletin, invoiceTypeScope),
        dashboardService.getSupplierAgeBreakdown(selectedYear, selectedRegionBulletin, invoiceTypeScope),
        dashboardService.getBulletinStats(selectedYear, selectedRegionBulletin),
        dashboardService.getMonthlyInvoiceStats(selectedYear, selectedRegionBulletin),
        dashboardService.getRegions()
      ]);
      
      setUrgencyStats(urgency);
      setAgeStats(age);
      setSupplierAgeData(supplierAge);
      setBulletinSupplierData(bulletin.supplierBreakdown);
      setMonthlyData(monthly);
      setRegions(availableRegions);
      
      // Phase 3: Charger les données des centres de coûts (non critique, non bloquant)
      void loadCostCenterData();
      
    } catch (err) {
      console.error('Erreur lors du chargement des données du dashboard:', err);
      setError('Erreur lors du chargement des données');
    } finally {
      if (shouldShowLoader) {
        setLoading(false);
      }
      setIsInitialLoad(false);
    }
  };

  const calculateBulletinStats = async () => {
    try {
      let facturesQuery = supabase
        .from('FACTURES')
        .select('ID, Montant, "Statut", "Date de réception", "validation DR", "validation DOP", "validation DG", "Numéro de facture", "Région", "Catégorie de charge", "Type de facture"')
        .eq('Type de facture', invoiceTypeScope);

      if (selectedYear) {
        facturesQuery = facturesQuery
          .gte('"Date de réception"', `${selectedYear}-01-01`)
          .lte('"Date de réception"', `${selectedYear}-12-31`);
      }
      if (selectedRegionBulletin) {
        facturesQuery = facturesQuery.eq('"Région"', selectedRegionBulletin);
      }

      const { data: factures, error } = await facturesQuery;
      
      if (error) throw error;

      // Charger les paiements
      const { data: paiements } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');

      // Créer une map des paiements par numéro de facture
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture;
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);
        });
      }

      // Initialiser les stats
      let totalMontant = 0;
      let totalPaid = 0;
      let nonPayeeMontant = 0;
      let nonPayeeCount = 0;
      let bonAPayerMontant = 0;
      let bonAPayerCount = 0;
      let enAttenteValidationMontant = 0;
      let enAttenteValidationCount = 0;
      let payeeMontant = 0;
      let payeeCount = 0;
      let totalFactures = 0;
      let partiellementPayeeMontantTotal = 0;
      let partiellementPayeeMontantPaye = 0;
      let partiellementPayeeReste = 0;
      let partiellementPayeeCount = 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Traiter chaque facture
      (factures || []).forEach((facture: any) => {
        // Filtrer par catégorie de charge - UNIQUEMENT Bulletin de liquidation
        if (facture['Catégorie de charge'] !== 'Bulletin de liquidation') {
          return;
        }

        const montant = parseFloat(facture.Montant) || 0;
        const statut = facture.Statut?.toLowerCase() || '';
        const invoiceNumber = facture['Numéro de facture'];

        // Exclus les factures rejetées
        if (statut.includes('rejet')) return;

        totalMontant += montant;
        totalFactures += 1;

        const totalPaidForInvoice = paymentMap.get(invoiceNumber) || 0;
        const reste = montant - totalPaidForInvoice;

        // Ajouter les montants payés
        payeeMontant += totalPaidForInvoice;
        if (totalPaidForInvoice > 0) {
          payeeCount += 1;
        }

        // Ajouter les montants non payés
        if (reste > 0) {
          nonPayeeMontant += reste;
          if (totalPaidForInvoice === 0) {
            nonPayeeCount += 1;
          }
        }

        // Paiement partiel
        if (totalPaidForInvoice > 0 && totalPaidForInvoice < montant) {
          partiellementPayeeMontantTotal += montant;
          partiellementPayeeMontantPaye += totalPaidForInvoice;
          partiellementPayeeReste += reste;
          partiellementPayeeCount += 1;
        }

        // Vérifier la validation pour les factures non complètement payées
        if (totalPaidForInvoice < montant) {
          const drValidated = facture['validation DR'] != null && String(facture['validation DR']).trim() !== '';
          const dopValidated = facture['validation DOP'] != null && String(facture['validation DOP']).trim() !== '';
          const dgValidated = facture['validation DG'] != null && String(facture['validation DG']).trim() !== '';
          
          let isValidated = false;
          if (montant <= 2500) {
            isValidated = drValidated;
          } else if (montant <= 10000) {
            isValidated = drValidated && dopValidated;
          } else {
            isValidated = drValidated && dopValidated && dgValidated;
          }

          if (isValidated) {
            bonAPayerMontant += reste;
            if (totalPaidForInvoice === 0) {
              bonAPayerCount += 1;
            }
          } else {
            enAttenteValidationMontant += reste;
            if (totalPaidForInvoice === 0) {
              enAttenteValidationCount += 1;
            }
          }
        }

        totalPaid += totalPaidForInvoice;
      });

      setBulletinGlobalStats({
        totalMontant,
        totalPaid,
        totalUnpaid: nonPayeeMontant,
        totalRejected: 0,
        totalFactures,
        nonPayeeMontant,
        nonPayeeCount,
        bonAPayerMontant,
        bonAPayerCount,
        enAttenteValidationMontant,
        enAttenteValidationCount,
        payeeMontant,
        payeeCount,
        partiellementPayeeMontantTotal,
        partiellementPayeeMontantPaye,
        partiellementPayeeReste,
        partiellementPayeeCount,
        echueMontant: 0,
        echueeCount: 0,
        rejeteeCount: 0,
        rejeteeMontant: 0,
      } as any);

      // Pour le moment, on ne calcule pas les stats d'urgence et d'âge pour le Bulletin
      // Ces calculs peuvent être ajoutés ultérieurement si nécessaire
      setBulletinUrgencyStats({
        urgentes: { montant: 0, count: 0 },
        prioritaires: { montant: 0, count: 0 },
        normales: { montant: 0, count: 0 },
      });

      setBulletinAgeStats({
        zero30: { montant: 0, count: 0 },
        thirty60: { montant: 0, count: 0 },
        sixty90: { montant: 0, count: 0 },
        plus90: { montant: 0, count: 0 },
      });
    } catch (err) {
      console.error('Erreur lors du calcul des données Bulletin de Liquidation:', err);
    }
  };

  // Load dashboard data when year, month, or region changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadDashboardData();
  }, [selectedYear, selectedMonth, selectedRegionBulletin, invoiceTypeScope]);

  // Synchroniser selectedRegionBulletin avec la région de l'agent connecté
  useEffect(() => {
    if (agent?.REGION) {
      if (agent.REGION !== 'TOUT') {
        // Si l'agent a une région spécifique (pas TOUT), forcer cette région
        setSelectedRegionBulletin(agent.REGION);
      } else {
        // Si l'agent a la région TOUT, afficher toutes les régions (undefined)
        setSelectedRegionBulletin(undefined);
      }
    }
  }, [agent?.REGION]);

  // Recalculate bulletin stats when region changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isInitialLoad) {
      calculateBulletinStats();
    }
  }, [selectedRegionBulletin]);

  // Reload cost center data when region or year changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === 5) {
      loadCostCenterData(selectedRegionBulletin);
    }
  }, [selectedRegionBulletin, activeTab, selectedYear]);

  // Load supplier categories when tab 6 is active
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === 6) {
      loadSupplierCategories();
    }
  }, [activeTab, selectedYear, selectedMonth, selectedRegionBulletin]);

  // Reload suppliers when filters change and a category is selected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedSupplierCategory) {
      loadSuppliersByCategory(selectedSupplierCategory);
    }
  }, [selectedYear, selectedMonth, selectedRegionBulletin]);

  // Initialisation des stats bulletin au montage.
  // Les autres données dashboard sont déjà chargées par l'effet dépendant des filtres.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    calculateBulletinStats();
  }, []);

  // Écouter les événements de rafraîchissement manuel
  useDataRefresh(REFRESH_EVENTS.ALL, () => {
    console.log('🔄 Rafraîchissement manuel des stats du dashboard');
    loadDashboardData();
    calculateBulletinStats();
  });

  // Ensure agent's region is respected - update selectedRegionBulletin if agent's region changes
  useEffect(() => {
    if (agent?.REGION && agent.REGION !== 'TOUT') {
      // Agent has a specific region - force selection to their region
      setSelectedRegionBulletin(agent.REGION);
    }
  }, [agent?.REGION]);

  const handleRefresh = () => {
    loadDashboardData();
  };

  const openTop10Modal = async () => {
    setTop10Loading(true);
    try {
      const data = await dashboardService.getTop10SuppliersWithUnpaidInvoices(selectedYear, selectedRegionBulletin);
      setTop10Suppliers(data);
      setTop10Modal({ isOpen: true });
    } catch (err) {
      console.error('Erreur lors du chargement des top 10 fournisseurs:', err);
    } finally {
      setTop10Loading(false);
    }
  };

  const closeTop10Modal = () => {
    setTop10Modal({ isOpen: false });
  };

  const openModalByUrgency = async (urgencyLevel: 'urgentes' | 'prioritaires' | 'normales', title: string) => {
    try {
      const invoices = await dashboardService.getInvoicesByUrgencyDetailed(urgencyLevel, selectedYear, invoiceTypeScope);
      
      // Filter by region if selected
      let filtered = invoices;
      if (selectedRegionBulletin) {
        filtered = invoices.filter((inv: any) => inv['Région'] === selectedRegionBulletin);
      }
      
      let summary: { totalAmount?: number } | undefined = undefined;

      if (urgencyLevel === 'urgentes') {
        summary = { totalAmount: urgencyStats?.urgentes.montant || 0 };
      } else if (urgencyLevel === 'prioritaires') {
        summary = { totalAmount: urgencyStats?.prioritaires.montant || 0 };
      } else {
        summary = { totalAmount: urgencyStats?.normales.montant || 0 };
      }

      setModal({
        isOpen: true,
        type: null,
        invoices: filtered,
        title,
        summary,
      });
    } catch (err) {
      console.error('Erreur lors de l\'ouverture du modal:', err);
    }
  };

  const openModalByChargeCategory = async (designation: string, title: string) => {
    try {
      const invoices = await dashboardService.getInvoicesByChargeCategory(designation, selectedYear, selectedRegionBulletin);
      
      let summary: { totalAmount?: number } | undefined = undefined;

      // Find the charge in blockingCharges to get the amount
      const charge = blockingCharges.find(c => c.designation === designation);
      if (charge) {
        summary = { totalAmount: charge.montantTotal };
      }

      setModal({
        isOpen: true,
        type: null,
        invoices: invoices,
        title,
        summary,
      });
    } catch (err) {
      console.error('Erreur lors de l\'ouverture du modal:', err);
    }
  };

  const openModalByCostCenter = async (costCenter: string, title: string) => {
    try {
      // Récupérer les factures pour le centre de coûts spécifique
      const invoices = await dashboardService.getInvoicesByCostCenter(costCenter, selectedYear, invoiceTypeScope);
      
      // Filtrer par région si sélectionnée
      let filtered = invoices;
      if (selectedRegionBulletin) {
        filtered = invoices.filter((inv: any) => inv['Région'] === selectedRegionBulletin);
      }
      
      setModal({
        isOpen: true,
        type: null,
        invoices: filtered,
        title,
      });
    } catch (err) {
      console.error('Erreur lors de l\'ouverture du modal:', err);
    }
  };

  // Fonctions dédiées pour les Bulletins de Liquidation
  const openModalForBulletinByType = async (type: ModalState['type'], title: string) => {
    try {
      let invoices: Invoice[] = [];
      let summary: { totalAmount?: number; totalPaid?: number; totalRemaining?: number } | undefined = undefined;

      // Charger toutes les factures bulletin
      const [nonPayee, bonAPayer, payee, partiellementPayee, echue, rejetee] = await Promise.all([
        dashboardService.getNonPayeeInvoices(selectedYear),
        dashboardService.getBonAPayerInvoices(selectedYear),
        dashboardService.getPayeeInvoices(selectedYear),
        dashboardService.getPartiellementPayeeInvoices(selectedYear),
        dashboardService.getOverdueInvoices(selectedYear),
        dashboardService.getRejeteesInvoices(selectedYear),
      ]);
      
      let allBulletins = [...nonPayee, ...bonAPayer, ...payee, ...partiellementPayee, ...echue, ...rejetee] as any[];
      
      // Filtrer uniquement les bulletins de liquidation
      allBulletins = allBulletins.filter(inv => inv['Catégorie de charge'] === 'Bulletin de liquidation');
      
      // Filter by region if selected
      if (selectedRegionBulletin) {
        allBulletins = allBulletins.filter(inv => inv['Région'] === selectedRegionBulletin);
      }
      
      // Supprimer les doublons
      const seen = new Set();
      allBulletins = allBulletins.filter((inv) => {
        const key = inv['Numéro de facture'];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Filtrer selon le type
      switch (type) {
        case 'total':
          invoices = allBulletins;
          summary = { totalAmount: bulletinGlobalStats?.totalMontant };
          break;
        case 'nonPayee':
          invoices = allBulletins;
          summary = { totalAmount: bulletinGlobalStats?.nonPayeeMontant };
          break;
        case 'bonAPayer':
          invoices = allBulletins;
          summary = { totalAmount: bulletinGlobalStats?.bonAPayerMontant };
          break;
        case 'payee':
          invoices = allBulletins;
          summary = { totalAmount: bulletinGlobalStats?.payeeMontant };
          break;
        case 'echue':
          invoices = allBulletins;
          summary = { totalAmount: bulletinGlobalStats?.echueMontant };
          break;
      }

      setModal({
        isOpen: true,
        type,
        invoices: invoices as Invoice[],
        title,
        summary
      });
    } catch (err) {
      console.error('Erreur lors de l\'ouverture du modal bulletin:', err);
    }
  };

  // Ouvrir modal pour bulletins d'un fournisseur spécifique
  const openModalForBulletinFromTable = async (fournisseur: string, filterType: 'all' | 'paid' | 'unpaid' | 'rejected' = 'all') => {
    try {
      const [nonPayee, bonAPayer, payee, partiellementPayee, echue, rejetee] = await Promise.all([
        dashboardService.getNonPayeeInvoices(selectedYear, selectedRegionBulletin),
        dashboardService.getBonAPayerInvoices(selectedYear, selectedRegionBulletin),
        dashboardService.getPayeeInvoices(selectedYear, selectedRegionBulletin),
        dashboardService.getPartiellementPayeeInvoices(selectedYear, selectedRegionBulletin),
        dashboardService.getOverdueInvoices(selectedYear, selectedRegionBulletin),
        dashboardService.getRejeteesInvoices(selectedYear, selectedRegionBulletin),
      ]);
      
      let invoices = [...nonPayee, ...bonAPayer, ...payee, ...partiellementPayee, ...echue, ...rejetee] as any[];
      
      // Filtrer uniquement les bulletins de liquidation du fournisseur
      invoices = invoices.filter(inv => 
        inv['Catégorie de charge'] === 'Bulletin de liquidation' && 
        inv.Fournisseur === fournisseur
      );

      // Supprimer les doublons
      const seen = new Set();
      invoices = invoices.filter((inv) => {
        const key = inv['Numéro de facture'];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Charger les paiements pour filtrer
      const { data: paiements } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');

      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture;
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);
        });
      }

      // Appliquer le filtre selon le type
      if (filterType === 'paid') {
        invoices = invoices.filter(inv => {
          const montant = parseFloat(inv.Montant) || 0;
          const invoiceNumber = inv['Numéro de facture'];
          const amountPaid = paymentMap.get(invoiceNumber) || 0;
          return amountPaid >= montant && montant > 0;
        });
      } else if (filterType === 'unpaid') {
        invoices = invoices.filter(inv => {
          const invoiceNumber = inv['Numéro de facture'];
          const amountPaid = paymentMap.get(invoiceNumber) || 0;
          return amountPaid === 0;
        });
      } else if (filterType === 'rejected') {
        invoices = invoices.filter(inv => {
          const statut = inv['Statut']?.toLowerCase() || '';
          return statut.includes('rejet');
        });
      }

      setModal({
        isOpen: true,
        type: null,
        invoices: invoices as Invoice[],
        title: `Bulletins - ${fournisseur}`,
        summary: {},
      });
    } catch (err) {
      console.error('Erreur lors de l\'ouverture du modal bulletin:', err);
    }
  };

  const openModalByAge = async (
    ageRange: 'zero30' | 'thirty60' | 'sixty90' | 'plus90',
    title: string,
    supplier?: string
  ) => {
    try {
      const invoices = await dashboardService.getInvoicesByAgeRange(ageRange, selectedYear, supplier, selectedRegionBulletin, invoiceTypeScope);
      
      setModal({
        isOpen: true,
        type: 'total',
        invoices,
        title,
        summary: {}
      });
    } catch (err) {
      console.error('Erreur lors du chargement des factures par âge:', err);
    }
  };

  const openModal = async (type: ModalState['type']) => {
    try {
      let invoices: Invoice[] = [];
      let summary: { totalAmount?: number; totalPaid?: number; totalRemaining?: number } | undefined = undefined;

      switch (type) {
        case 'total': {
          // Debug log
          console.log('DEBUG: openModal total - selectedRegionBulletin:', selectedRegionBulletin);
          
          // Fetch all invoices from all categories
          const [nonPayee, bonAPayer, payee, partiellementPayee, echue, rejetee] = await Promise.all([
            dashboardService.getNonPayeeInvoices(selectedYear, selectedRegionBulletin),
            dashboardService.getBonAPayerInvoices(selectedYear, selectedRegionBulletin),
            dashboardService.getPayeeInvoices(selectedYear, selectedRegionBulletin),
            dashboardService.getPartiellementPayeeInvoices(selectedYear, selectedRegionBulletin),
            dashboardService.getOverdueInvoices(selectedYear, selectedRegionBulletin),
            dashboardService.getRejeteesInvoices(selectedYear, selectedRegionBulletin),
          ]);
          invoices = [...nonPayee, ...bonAPayer, ...payee, ...partiellementPayee, ...echue, ...rejetee];
          // Remove duplicates based on invoice number
          const seen = new Set();
          invoices = invoices.filter((inv) => {
            const key = inv['Numéro de facture'];
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          summary = {
            totalAmount: stats?.totalMontant,
          };
          break;
        }
        case 'nonPayee':
          invoices = await dashboardService.getNonPayeeInvoices(selectedYear, selectedRegionBulletin);
          summary = {
            totalAmount: stats?.nonPayeeMontant,
          };
          break;
        case 'bonAPayer':
          invoices = await dashboardService.getBonAPayerInvoices(selectedYear, selectedRegionBulletin);
          summary = {
            totalAmount: stats?.bonAPayerMontant,
          };
          break;
        case 'enAttenteValidation':
          invoices = await dashboardService.getEnAttenteValidationInvoices(selectedYear, selectedRegionBulletin);
          summary = {
            totalAmount: stats?.enAttenteValidationMontant,
          };
          break;
        case 'payee':
          invoices = await dashboardService.getPayeeInvoices(selectedYear, selectedRegionBulletin);
          summary = {
            totalAmount: stats?.payeeMontant,
          };
          break;
        case 'partiellementPayee':
          invoices = await dashboardService.getPartiellementPayeeInvoices(selectedYear, selectedRegionBulletin);
          summary = {
            totalAmount: stats?.partiellementPayeeMontantTotal,
            totalPaid: stats?.partiellementPayeeMontantPaye,
            totalRemaining: stats?.partiellementPayeeReste,
          };
          break;
        case 'echue':
          invoices = await dashboardService.getOverdueInvoices(selectedYear, selectedRegionBulletin);
          summary = {
            totalAmount: stats?.echueMontant,
          };
          break;
        case 'rejetee':
          invoices = await dashboardService.getRejeteesInvoices(selectedYear, selectedRegionBulletin);
          summary = {
            totalAmount: stats?.rejeteeMontant,
          };
          break;
      }

      // Filter by region if selected (now redundant since services already filter)
      // if (selectedRegionBulletin) {
      //   invoices = invoices.filter((inv: any) => inv['Région'] === selectedRegionBulletin);
      // }

      setModal({
        isOpen: true,
        type,
        invoices,
        summary
      });
    } catch (err) {
      console.error('Erreur lors de l\'ouverture du modal:', err);
    }
  };

  const closeModal = () => {
    setModal({
      isOpen: false,
      type: null,
      invoices: [],
      title: '',
    });
  };

  const getModalTitle = () => {
    // If a custom title was provided, use it
    if (modal.title) {
      return modal.title;
    }

    // Otherwise, generate based on type
    switch (modal.type) {
      case 'total':
        return 'Total Factures';
      case 'nonPayee':
        return 'Factures Non Payées';
      case 'bonAPayer':
        return 'Facture Bon à Payer';
      case 'enAttenteValidation':
        return 'En attente de validation';
      case 'payee':
        return 'Factures Payées';
      case 'partiellementPayee':
        return 'Factures Payées Partiellement';
      case 'echue':
        return 'Factures Échues';
      case 'rejetee':
        return 'Factures Rejetées';
      default:
        return 'Détails';
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 1: // Global
        if (loading && isInitialLoad) {
          return (
            <div className="space-y-8">
              <div className="space-y-6 pt-6">
                {/* Skeleton pour les 4 cartes principales */}
                <div className="grid grid-cols-4 gap-6">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
                
                {/* Skeleton pour la deuxième rangée */}
                <div className="grid grid-cols-3 gap-6">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
                
                {/* Skeleton pour le graphique */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
                    <div className="h-64 bg-gray-200 rounded"></div>
                  </div>
                </div>
              </div>
            </div>
          );
        }
        if (error) {
          return <div className="text-center py-8 text-red-600">{error}</div>;
        }
        return (
          <div className="space-y-8">
            <div className="space-y-6 pt-6">
                {/* Rangée 1: 4 colonnes */}
                <div className="grid grid-cols-4 gap-6">
                  <StatCard
                    label="Total Factures"
                    value={stats?.totalMontant || 0}
                    currency="USD"
                    nombreFactures={stats?.totalFactures || 0}
                    bgColor="bg-gradient-to-br from-purple-500 to-purple-600"
                    textColor="text-white"
                    onDetailClick={() => openModal('total')}
                    variant="compact"
                    icon="calculator"
                    onHover={true}
                  />
                  <StatCard
                    label="Factures Non Payées"
                    value={stats?.nonPayeeMontant || 0}
                    currency="USD"
                    nombreFactures={stats?.nonPayeeCount || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-gradient-to-br from-pink-400 to-pink-500"
                    textColor="text-white"
                    onDetailClick={() => openModal('nonPayee')}
                    variant="compact"
                    icon="x-circle"
                    onHover={true}
                  />
                  <StatCard
                    label="Facture Bon à Payer"
                    value={stats?.bonAPayerMontant || 0}
                    currency="USD"
                    nombreFactures={stats?.bonAPayerCount || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-gradient-to-br from-orange-400 to-yellow-400"
                    textColor="text-white"
                    onDetailClick={() => openModal('bonAPayer')}
                    variant="compact"
                    icon="alert"
                    onHover={true}
                  />
                  <StatCard
                    label="Facture Payée"
                    value={stats?.payeeMontant || 0}
                    currency="USD"
                    nombreFactures={stats?.payeeCount || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-gradient-to-br from-green-400 to-emerald-500"
                    textColor="text-white"
                    onDetailClick={() => openModal('payee')}
                    variant="compact"
                    icon="trending"
                    onHover={true}
                  />
                </div>

                {/* Rangée 2: 4 colonnes */}
                <div className="grid grid-cols-4 gap-6">
                  <StatCard
                    label="Facture Payée Partiellement"
                    value={stats?.partiellementPayeeReste || 0}
                    currency="USD"
                    montantPaye={stats?.partiellementPayeeMontantTotal}
                    montantReste={stats?.partiellementPayeeMontantPaye}
                    labelMontantPaye="Total"
                    labelMontantReste="Payé"
                    nombreFactures={stats?.partiellementPayeeCount || 0}
                    bgColor="bg-blue-600"
                    textColor="text-gray-700"
                    onDetailClick={() => openModal('partiellementPayee')}
                    variant="default"
                  />
                  <StatCard
                    label="Facture Échue"
                    value={stats?.echueMontant || 0}
                    currency="USD"
                    nombreFactures={stats?.echueeCount || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-red-600"
                    textColor="text-gray-700"
                    onDetailClick={() => openModal('echue')}
                    variant="default"
                  />
                  <StatCard
                    label={selectedMonth === 'all' ? `Top Fournisseur - ${selectedYear}` : `Top Fournisseur - ${new Date(`2000-${selectedMonth}-01`).toLocaleString('fr-FR', { month: 'long' }).charAt(0).toUpperCase()}${new Date(`2000-${selectedMonth}-01`).toLocaleString('fr-FR', { month: 'long' }).slice(1)} ${selectedYear}`}
                    fournisseur={topSupplier?.fournisseur || 'N/A'}
                    value={topSupplier?.montantTotal || 0}
                    currency="USD"
                    subtitle="Montant total"
                    nombreFactures={topSupplier?.nombreFactures || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-indigo-600"
                    textColor="text-gray-700"
                    onDetailClick={openTop10Modal}
                    variant="default"
                  />
                  <StatCard
                    label="Facture Rejetée"
                    value={stats?.rejeteeMontant || 0}
                    currency="USD"
                    nombreFactures={stats?.rejeteeCount || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-gray-600"
                    textColor="text-gray-700"
                    onDetailClick={() => openModal('rejetee')}
                    variant="default"
                  />
                </div>
            </div>

            <div className="space-y-6">
                <div className="grid grid-cols-4 gap-6">
                  <StatCard
                    label="Factures à impact opérationnel"
                    value={blockingCharges.reduce((sum, c) => sum + c.montantTotal, 0)}
                    currency="USD"
                    nombreFactures={blockingCharges.reduce((sum, c) => sum + c.nombreFactures, 0)}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-red-600"
                    textColor="text-white"
                    onDetailClick={() => setActiveTab(3)}
                  />
                  <StatCard
                    label="Urgentes"
                    value={urgencyStats?.urgentes.montant || 0}
                    currency="USD"
                    nombreFactures={urgencyStats?.urgentes.count || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-red-500"
                    textColor="text-white"
                    onDetailClick={() => openModalByUrgency('urgentes', 'Factures Urgentes')}
                  />
                  <StatCard
                    label="En attente de validation"
                    value={stats?.enAttenteValidationMontant || 0}
                    currency="USD"
                    nombreFactures={stats?.enAttenteValidationCount || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-orange-500"
                    textColor="text-white"
                    onDetailClick={() => openModal('enAttenteValidation')}
                  />
                  <StatCard
                    label="Normales"
                    value={urgencyStats?.normales.montant || 0}
                    currency="USD"
                    nombreFactures={urgencyStats?.normales.count || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-green-500"
                    textColor="text-white"
                    onDetailClick={() => openModalByUrgency('normales', 'Factures Normales')}
                  />
                </div>
            </div>

            {/* Graphique mensuel */}
            <MonthlyInvoiceChart data={monthlyData} loading={loading} />
          </div>
        );

      case 2: // Bulletin de Liquidation
        return (
          <div className="space-y-8">
            {/* Catégorie: General - Bulletin de Liquidation */}
            <div>
              <div className="space-y-6 pt-6">
                {/* Rangée 1: 4 colonnes */}
                <div className="grid grid-cols-4 gap-6">
                  <StatCard
                    label="Total Bulletins"
                    value={bulletinGlobalStats?.totalMontant || 0}
                    currency="USD"
                    nombreFactures={bulletinGlobalStats?.totalFactures || 0}
                    bgColor="bg-gradient-to-br from-purple-500 to-purple-600"
                    textColor="text-white"
                    onDetailClick={() => openModalForBulletinByType('total', 'Total Bulletins - Bulletin de Liquidation')}
                    variant="compact"
                    icon="calculator"
                    onHover={true}
                  />
                  <StatCard
                    label="Bulletin Non Payé"
                    value={bulletinGlobalStats?.nonPayeeMontant || 0}
                    currency="USD"
                    nombreFactures={bulletinGlobalStats?.nonPayeeCount || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-gradient-to-br from-pink-400 to-pink-500"
                    textColor="text-white"
                    onDetailClick={() => openModalForBulletinByType('nonPayee', 'Bulletins Non Payés - Bulletin de Liquidation')}
                    variant="compact"
                    icon="x-circle"
                    onHover={true}
                  />
                  <StatCard
                    label="Bulletin Bon à Payer"
                    value={bulletinGlobalStats?.bonAPayerMontant || 0}
                    currency="USD"
                    nombreFactures={bulletinGlobalStats?.bonAPayerCount || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-gradient-to-br from-orange-400 to-yellow-400"
                    textColor="text-white"
                    onDetailClick={() => openModalForBulletinByType('bonAPayer', 'Bulletins Bon à Payer - Bulletin de Liquidation')}
                    variant="compact"
                    icon="alert"
                    onHover={true}
                  />
                  <StatCard
                    label="Bulletin Payé"
                    value={bulletinGlobalStats?.payeeMontant || 0}
                    currency="USD"
                    nombreFactures={bulletinGlobalStats?.payeeCount || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-gradient-to-br from-green-400 to-emerald-500"
                    textColor="text-white"
                    onDetailClick={() => openModalForBulletinByType('payee', 'Bulletins Payés - Bulletin de Liquidation')}
                    variant="compact"
                    icon="trending"
                    onHover={true}
                  />
                </div>

                {/* Rangée 2: 4 colonnes */}
                <div className="grid grid-cols-4 gap-6">
                  <StatCard
                    label="Bulletin Payé Partiellement"
                    value={bulletinGlobalStats?.partiellementPayeeReste || 0}
                    currency="USD"
                    montantPaye={bulletinGlobalStats?.partiellementPayeeMontantTotal}
                    montantReste={bulletinGlobalStats?.partiellementPayeeMontantPaye}
                    labelMontantPaye="Total"
                    labelMontantReste="Payé"
                    nombreFactures={bulletinGlobalStats?.partiellementPayeeCount || 0}
                    bgColor="bg-blue-500"
                    textColor="text-white"
                    onDetailClick={() => openModalForBulletinByType('partiellementPayee', 'Bulletins Payés Partiellement - Bulletin de Liquidation')}
                  />
                  <StatCard
                    label="Bulletin Échu"
                    value={bulletinGlobalStats?.echueMontant || 0}
                    currency="USD"
                    nombreFactures={bulletinGlobalStats?.echueeCount || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-red-600"
                    textColor="text-white"
                    onDetailClick={() => openModalForBulletinByType('echue', 'Bulletins Échus - Bulletin de Liquidation')}
                  />
                  <StatCard
                    label="Urgentes"
                    value={bulletinUrgencyStats?.urgentes.montant || 0}
                    currency="USD"
                    nombreFactures={bulletinUrgencyStats?.urgentes.count || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-red-500"
                    textColor="text-white"
                    onDetailClick={() => openModalByUrgency('urgentes', 'Bulletins Urgents - Bulletin de Liquidation')}
                  />
                  <StatCard
                    label="Normales"
                    value={bulletinUrgencyStats?.normales.montant || 0}
                    currency="USD"
                    nombreFactures={bulletinUrgencyStats?.normales.count || 0}
                    montantPaye={0}
                    montantReste={0}
                    bgColor="bg-green-500"
                    textColor="text-white"
                    onDetailClick={() => openModalByUrgency('normales', 'Bulletins Normaux - Bulletin de Liquidation')}
                  />
                </div>
              </div>
            </div>

            
            {/* Tableau par fournisseur */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                  <h3 className="text-lg font-semibold text-gray-800">Tableau par fournisseur - Bulletin de Liquidation</h3>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Région</label>
                  {agent?.REGION === 'TOUT' ? (
                    <select 
                      value={selectedRegionBulletin || ''}
                      onChange={(e) => setSelectedRegionBulletin(e.target.value || undefined)}
                      className="px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Toutes les régions</option>
                      <option value="OUEST">OUEST</option>
                      <option value="EST">EST</option>
                      <option value="SUD">SUD</option>
                      <option value="NORD">NORD</option>
                    </select>
                  ) : (
                    <select 
                      value={selectedRegionBulletin || ''}
                      disabled
                      className="px-3 py-1 text-sm border border-gray-300 rounded bg-gray-100 cursor-not-allowed"
                    >
                      <option value={agent?.REGION}>{agent?.REGION}</option>
                    </select>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Fournisseur</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Payé</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Non payé</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Rejeté</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Nombre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {bulletinSupplierData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-800 font-medium">{row.fournisseur}</td>
                        <td 
                          className="px-4 py-3 text-xs text-right text-blue-600 font-semibold cursor-pointer hover:underline"
                          onClick={() => openModalForBulletinFromTable(row.fournisseur, 'all')}
                          title="Cliquer pour voir tous les bulletins"
                        >
                          {formatCurrency(row.totalMontant)}
                        </td>
                        <td 
                          className="px-4 py-3 text-xs text-right text-green-600 font-semibold cursor-pointer hover:underline"
                          onClick={() => openModalForBulletinFromTable(row.fournisseur, 'paid')}
                          title="Cliquer pour voir les bulletins payés"
                        >
                          {formatCurrency(row.totalPaid)}
                        </td>
                        <td 
                          className="px-4 py-3 text-xs text-right text-orange-600 font-semibold cursor-pointer hover:underline"
                          onClick={() => openModalForBulletinFromTable(row.fournisseur, 'unpaid')}
                          title="Cliquer pour voir les bulletins non payés"
                        >
                          {formatCurrency(row.totalUnpaid)}
                        </td>
                        <td 
                          className="px-4 py-3 text-xs text-right text-red-600 font-semibold cursor-pointer hover:underline"
                          onClick={() => openModalForBulletinFromTable(row.fournisseur, 'rejected')}
                          title="Cliquer pour voir les bulletins rejetés"
                        >
                          {formatCurrency(row.totalRejected)}
                        </td>
                        <td 
                          className="px-4 py-3 text-xs text-center text-blue-600 font-semibold cursor-pointer hover:underline"
                          onClick={() => openModalForBulletinFromTable(row.fournisseur, 'all')}
                          title="Cliquer pour voir tous les bulletins"
                        >
                          {row.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 3: // Factures à impact opérationnel
        return (
          <div className="space-y-6">
            {loading ? (
              <SkeletonGrid count={6} columns={3} />
            ) : blockingCharges.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Aucune charge bloquante</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {blockingCharges.map((charge, index) => {
                  // Assign colors based on index
                  const colors = [
                    'bg-gradient-to-br from-red-500 to-red-600',
                    'bg-gradient-to-br from-orange-500 to-orange-600',
                    'bg-gradient-to-br from-yellow-500 to-yellow-600',
                    'bg-gradient-to-br from-pink-500 to-pink-600',
                    'bg-gradient-to-br from-purple-500 to-purple-600',
                    'bg-gradient-to-br from-indigo-500 to-indigo-600',
                  ];
                  const color = colors[index % colors.length];

                  return (
                    <StatCard
                      key={charge.id}
                      label={charge.designation}
                      value={charge.montantNonPaye}
                      currency="USD"
                      nombreFactures={charge.nombreFactures}
                      bgColor={color}
                      textColor="text-white"
                      montantPaye={charge.montantTotal}
                      montantReste={charge.montantPaye}
                      labelMontantPaye="Total"
                      labelMontantReste="Payé"
                      onDetailClick={() => openModalByChargeCategory(charge.designation, charge.designation)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );

      case 4: // Balance agé
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-6">
              <StatCard
                label="0-30 jours"
                value={ageStats?.zero30.montant ?? 0}
                currency="USD"
                bgColor="bg-gradient-to-br from-green-600 to-green-700"
                textColor="text-white"
                nombreFactures={ageStats?.zero30.count || 0}
                onDetailClick={() => openModalByAge('zero30', 'Factures 0-30 jours')}
              />
              <StatCard
                label="31-60 jours"
                value={ageStats?.thirty60.montant ?? 0}
                currency="USD"
                bgColor="bg-gradient-to-br from-yellow-600 to-yellow-700"
                textColor="text-white"
                nombreFactures={ageStats?.thirty60.count || 0}
                onDetailClick={() => openModalByAge('thirty60', 'Factures 31-60 jours')}
              />
              <StatCard
                label="61-90 jours"
                value={ageStats?.sixty90.montant ?? 0}
                currency="USD"
                bgColor="bg-gradient-to-br from-orange-600 to-orange-700"
                textColor="text-white"
                nombreFactures={ageStats?.sixty90.count || 0}
                onDetailClick={() => openModalByAge('sixty90', 'Factures 61-90 jours')}
              />
              <StatCard
                label="+90 jours"
                value={ageStats?.plus90.montant ?? 0}
                currency="USD"
                bgColor="bg-gradient-to-br from-red-600 to-red-700"
                textColor="text-white"
                nombreFactures={ageStats?.plus90.count || 0}
                onDetailClick={() => openModalByAge('plus90', 'Factures +90 jours')}
              />
            </div>

            {/* Tableau par fournisseur */}
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                <h3 className="text-lg font-semibold text-gray-800">Tableau par fournisseur</h3>
              </div>
              <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Fournisseur</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">0-30</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">31-60</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">61-90</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">+90</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {supplierAgeData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-800">{row.fournisseur}</td>
                        <td 
                          className="px-4 py-3 text-xs text-green-700 font-semibold cursor-pointer hover:underline"
                          onClick={() => openModalByAge('zero30', `Factures ${row.fournisseur} - 0-30 jours`, row.fournisseur)}
                        >
                          {formatCurrency(row.zero30)}
                        </td>
                        <td 
                          className="px-4 py-3 text-xs text-yellow-700 font-semibold cursor-pointer hover:underline"
                          onClick={() => openModalByAge('thirty60', `Factures ${row.fournisseur} - 31-60 jours`, row.fournisseur)}
                        >
                          {formatCurrency(row.thirty60)}
                        </td>
                        <td 
                          className="px-4 py-3 text-xs text-orange-700 font-semibold cursor-pointer hover:underline"
                          onClick={() => openModalByAge('sixty90', `Factures ${row.fournisseur} - 61-90 jours`, row.fournisseur)}
                        >
                          {formatCurrency(row.sixty90)}
                        </td>
                        <td 
                          className="px-4 py-3 text-xs text-red-700 font-semibold cursor-pointer hover:underline"
                          onClick={() => openModalByAge('plus90', `Factures ${row.fournisseur} - +90 jours`, row.fournisseur)}
                        >
                          {formatCurrency(row.plus90)}
                        </td>
                        <td 
                          className="px-4 py-3 text-xs font-semibold text-gray-900 cursor-pointer hover:underline"
                          onClick={() => openModal('total')}
                        >
                          {formatCurrency(row.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 5: // Centre des coûts
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {costCenterData.map((center) => {
                // Couleurs pour les barres gauche selon l'index
                const colors = [
                  'bg-blue-600',
                  'bg-green-600',
                  'bg-purple-600',
                  'bg-orange-600',
                  'bg-red-600',
                  'bg-indigo-600',
                  'bg-pink-600',
                  'bg-yellow-600',
                  'bg-teal-600',
                  'bg-gray-600'
                ];
                const bgColor = colors[costCenterData.indexOf(center) % colors.length];
                
                return (
                  <StatCard
                    key={center.centre}
                    label={center.centre}
                    value={center.montantNonPaye}
                    currency="USD"
                    nombreFactures={center.nombreFactures}
                    bgColor={bgColor}
                    textColor="text-gray-700"
                    montantPaye={center.montant}
                    montantReste={center.montantPaye}
                    labelMontantPaye="Total"
                    labelMontantReste="Payé"
                    onDetailClick={() => openModalByCostCenter(center.centre, `Factures - ${center.centre}`)}
                    variant="default"
                  />
                );
              })}
            </div>
            
            {costCenterData.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                Aucun centre de coûts disponible
              </div>
            )}
          </div>
        );

      case 6: // Fournisseur - Catégories
        return (
          <div className="space-y-6">
            {selectedSupplierCategory ? (
              // Affichage détail d'une catégorie en cartes colorées
              <div>
                <button
                  onClick={() => setSelectedSupplierCategory(null)}
                  className="mb-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  ← Retour aux catégories
                </button>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {suppliersByCategory.map((supplier, idx) => {
                    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500'];
                    const bgColor = colors[idx % colors.length];
                    
                    return (
                      <div
                        key={supplier.fournisseur}
                        onClick={() => {
                          setSelectedSupplierForModal(supplier.fournisseur);
                          setSupplierModalLoading(true);
                        }}
                        className={`${bgColor} rounded-lg p-6 text-white cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-2xl`}
                      >
                        <h4 className="text-lg font-bold mb-4">{supplier.fournisseur}</h4>
                        
                        {/* Solde à payer - prominent */}
                        <div className="mb-4">
                          <p className="text-xs opacity-90 mb-1">SOLDE À PAYER</p>
                          <p className="text-3xl font-bold">{formatCurrency(supplier.solde)}</p>
                        </div>

                        {/* Mini info grid */}
                        <div className="grid grid-cols-3 gap-3 text-sm border-t border-white border-opacity-20 pt-3">
                          <div>
                            <p className="text-xs opacity-80">Total</p>
                            <p className="font-bold">{formatCurrency(supplier.montant)}</p>
                          </div>
                          <div>
                            <p className="text-xs opacity-80">Payé</p>
                            <p className="font-bold">{formatCurrency(supplier.montantPaye)}</p>
                          </div>
                          <div>
                            <p className="text-xs opacity-80">Factures</p>
                            <p className="font-bold">{supplier.nombreFactures}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              // Affichage des catégories
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {supplierCategories.map((category) => (
                  <div
                    key={category.category}
                    onClick={() => {
                      setSelectedSupplierCategory(category.category);
                      loadSuppliersByCategory(category.category);
                    }}
                    className={`${category.color} rounded-lg p-6 text-white cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-2xl`}
                  >
                    <h3 className="text-lg font-bold mb-4">{category.category}</h3>
                    
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      {/* Factures */}
                      <div className="bg-white bg-opacity-20 rounded p-3">
                        <p className="text-xs opacity-90">Factures</p>
                        <p className="text-2xl font-bold">{category.count}</p>
                      </div>
                      
                      {/* Fournisseurs */}
                      <div className="bg-white bg-opacity-20 rounded p-3">
                        <p className="text-xs opacity-90">Fournisseurs</p>
                        <p className="text-2xl font-bold">{category.nombreFournisseurs}</p>
                      </div>
                      
                      {/* Total */}
                      <div className="bg-white bg-opacity-20 rounded p-3">
                        <p className="text-xs opacity-90">Total</p>
                        <p className="text-sm font-bold">{formatCurrency(category.montant)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm border-t border-white border-opacity-20 pt-3">
                      {/* Payé */}
                      <div>
                        <p className="text-xs opacity-80">Payé</p>
                        <p className="font-bold">{formatCurrency(category.montantPaye)}</p>
                      </div>
                      
                      {/* Solde à payer */}
                      <div className="text-right">
                        <p className="text-xs opacity-80">Solde à payer</p>
                        <p className="font-bold">{formatCurrency(category.soldeAPayer)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {supplierCategories.length === 0 && !selectedSupplierCategory && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <div className="mb-6 relative w-32 h-32">
                  <svg
                    className="w-full h-full animate-bounce"
                    viewBox="0 0 200 200"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Boîte vide */}
                    <rect x="40" y="60" width="120" height="90" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
                    {/* Couvercle ouvert */}
                    <line x1="40" y1="60" x2="20" y2="40" stroke="currentColor" strokeWidth="2" />
                    <line x1="160" y1="60" x2="180" y2="40" stroke="currentColor" strokeWidth="2" />
                    {/* Ligne de fermeture */}
                    <path d="M 20 40 L 30 30 L 170 30 L 180 40" fill="none" stroke="currentColor" strokeWidth="2" />
                    {/* Point d'interrogation */}
                    <circle cx="100" cy="105" r="25" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-600 mb-2">Aucune catégorie de fournisseur</h3>
                <p className="text-sm text-gray-500 mb-4">Aucune facture disponible pour les critères sélectionnés</p>
                <button
                  onClick={handleRefresh}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  Actualiser
                </button>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      
      {/* Top Progress Bar */}
      <TopProgressBar isLoading={loading} />
      
      <div className="bg-gray-200 pr-4 pl-4 pt-2 pb-0 sticky top-0 z-40">
        <div className="rounded-lg mb-10px">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <div className="flex items-center gap-6">
              {/* Onglets par région */}
              <div className="flex gap-1 ">
                {agent?.REGION === 'TOUT' && (
                  <button
                    onClick={() => setSelectedRegionBulletin(undefined)}
                    className={`px-4 py-2 font-semibold text-xs transition-all duration-200 ${
                      selectedRegionBulletin === undefined
                        ? 'bg-red-700 text-white shadow-md'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Vue globale
                  </button>
                )}
                {agent?.REGION === 'TOUT' ? (
                  regions.map((region) => (
                    <button
                      key={region}
                      onClick={() => setSelectedRegionBulletin(region)}
                      className={`px-4 py-2  font-semibold text-xs transition-all duration-200 ${
                        selectedRegionBulletin === region
                          ? 'bg-red-700 text-white shadow-md'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {region}
                    </button>
                  ))
                ) : (
                  <button
                    className="px-4 py-2 rounded-full font-semibold text-xs bg-red-700 text-white shadow-md cursor-not-allowed opacity-75"
                    disabled
                    title={`Vous êtes limité à la région: ${agent?.REGION || 'N/A'}`}
                  >
                    {agent?.REGION || 'Région'}
                  </button>
                )}
              </div>

              {/* Sélecteur d'année */}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>

              {/* Sélecteur de mois */}
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tous les mois</option>
                <option value="1">Janvier</option>
                <option value="2">Février</option>
                <option value="3">Mars</option>
                <option value="4">Avril</option>
                <option value="5">Mai</option>
                <option value="6">Juin</option>
                <option value="7">Juillet</option>
                <option value="8">Août</option>
                <option value="9">Septembre</option>
                <option value="10">Octobre</option>
                <option value="11">Novembre</option>
                <option value="12">Décembre</option>
              </select>

              {/* Bouton d'actualisation */}
              <button
                onClick={handleRefresh}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors duration-200"
                title="Actualiser les données"
              >
                <RefreshCw size={20} className="text-gray-700" />
              </button>
            </div>
          </div>

        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm transition-all duration-150 ease-out rounded-t-lg ${
                activeTab === tab.id
                  ? 'text-black bg-white shadow-sm font-bold'
                  : 'text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </div>
      </div>
      

      <div className="flex-1 bg-white rounded-lg shadow-sm p-6">
        {loading && isInitialLoad ? (
          <div className="space-y-8">
            <div className="space-y-6 pt-6">
              {/* Skeleton pour les 4 cartes principales */}
              <div className="grid grid-cols-4 gap-6">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
              
              {/* Skeleton pour la deuxième rangée */}
              <div className="grid grid-cols-3 gap-6">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
              
              {/* Skeleton pour le graphique */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
                  <div className="h-64 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        ) : renderTabContent()}
      </div>

      {/* Modal des détails factures */}
      <InvoiceDetailModal
        isOpen={modal.isOpen}
        onClose={closeModal}
        title={getModalTitle()}
        invoices={modal.invoices}
        invoiceTypeScope={invoiceTypeScope}
        summary={modal.summary}
      />

      {/* Modal Top 10 Fournisseurs */}
      <Top10SuppliersModal
        isOpen={top10Modal.isOpen}
        onClose={closeTop10Modal}
        suppliers={top10Suppliers}
        loading={top10Loading}
        year={selectedYear}
      />

      {/* Modal Détail Fournisseur */}
      {selectedSupplierForModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-screen overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedSupplierForModal}</h2>
                <p className="text-xs text-gray-500 mt-1">Détail des factures</p>
              </div>
              <button
                onClick={() => setSelectedSupplierForModal(null)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              {supplierModalLoading ? (
                <div className="text-center py-6">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <p className="text-xs text-gray-500 mt-2">Chargement...</p>
                </div>
              ) : supplierInvoices.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-500">
                  Aucune facture trouvée
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Non payées */}
                  {supplierInvoices.filter(f => f.solde > 0).length > 0 && (
                    <div>
                      <h3 className="text-base font-bold text-red-600 mb-2">
                        À payer ({supplierInvoices.filter(f => f.solde > 0).length})
                      </h3>
                      <div className="space-y-2">
                        {supplierInvoices
                          .filter(f => f.solde > 0)
                          .map((invoice) => (
                            <div key={invoice.ID} className="border border-red-200 bg-red-50 rounded p-3 hover:bg-red-100 transition-colors">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p
                                    onClick={() => {
                                      // Si paiement partiel (montantPaye > 0), ouvrir PaiementModal
                                      if (invoice.montantPaye && invoice.montantPaye > 0) {
                                        setInvoiceForPaiementModal(invoice);
                                      } else {
                                        // Sinon, ouvrir ViewInvoiceModal
                                        setInvoiceForViewModal(invoice);
                                      }
                                    }}
                                    className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-blue-600 hover:underline"
                                  >
                                    {invoice['Numéro de facture']}
                                  </p>
                                  <p className="text-xs text-gray-600 mt-1">{new Date(invoice['Date de réception']).toLocaleDateString('fr-FR')}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-red-600">{formatCurrency(invoice.solde)}</p>
                                  <p className="text-xs text-gray-600">à payer</p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Payées */}
                  {supplierInvoices.filter(f => f.solde === 0 && f.montantPaye > 0).length > 0 && (
                    <div>
                      <h3 className="text-base font-bold text-green-600 mb-2">
                        Payées ({supplierInvoices.filter(f => f.solde === 0 && f.montantPaye > 0).length})
                      </h3>
                      <div className="space-y-2">
                        {supplierInvoices
                          .filter(f => f.solde === 0 && f.montantPaye > 0)
                          .map((invoice) => (
                            <div key={invoice.ID} className="border border-green-200 bg-green-50 rounded p-3 hover:bg-green-100 transition-colors">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p
                                    onClick={() => setInvoiceForPaiementModal(invoice)}
                                    className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-blue-600 hover:underline"
                                  >
                                    {invoice['Numéro de facture']}
                                  </p>
                                  <p className="text-xs text-gray-600 mt-1">{new Date(invoice['Date de réception']).toLocaleDateString('fr-FR')}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-green-600">{formatCurrency(invoice.Montant)}</p>
                                  <p className="text-xs text-gray-600">Payée</p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ViewInvoiceModal - pour les factures non payées */}
      {invoiceForViewModal && (
        <ViewInvoiceModal
          invoice={{
            id: invoiceForViewModal.ID,
            invoiceNumber: invoiceForViewModal['Numéro de facture'],
            supplier: selectedSupplierForModal || '',
            receptionDate: invoiceForViewModal['Date de réception'],
            amount: parseFloat(invoiceForViewModal.Montant) || 0,
            currency: 'USD' as const,
            chargeCategory: '',
            urgencyLevel: 'Moyenne' as const,
            status: (invoiceForViewModal.Statut?.toLowerCase() === 'payée' ? 'paid' : 'pending') as any,
            region: 'OUEST' as const
          }}
          onClose={() => setInvoiceForViewModal(null)}
        />
      )}

      {/* PaiementModal - en lecture seule pour les factures payées */}
      {invoiceForPaiementModal && (
        <PaiementModal
          invoice={{
            id: invoiceForPaiementModal.ID,
            invoiceNumber: invoiceForPaiementModal['Numéro de facture'],
            supplier: selectedSupplierForModal || '',
            receptionDate: invoiceForPaiementModal['Date de réception'],
            amount: parseFloat(invoiceForPaiementModal.Montant) || 0,
            currency: 'USD' as const,
            chargeCategory: '',
            urgencyLevel: 'Moyenne' as const,
            status: 'paid' as const,
            region: 'OUEST' as const
          }}
          onClose={() => setInvoiceForPaiementModal(null)}
          readOnly={true}
        />
      )}
    </div>
  );
}

export default Dashboard;

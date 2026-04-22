import { useState, useEffect } from 'react';
import { RefreshCw, FileText, Search, Filter, Download, Eye, Edit, Trash2, DollarSign, AlertCircle, Calendar } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../contexts/AuthContext';
import AccessDenied from '../components/AccessDenied';
import InvoiceTable from '../components/InvoiceTable';
import { Invoice } from '../types';
import * as XLSX from 'xlsx';

interface Facture {
  ID: string;
  "Date de réception": string;
  "Numéro de facture": string;
  Fournisseur: string;
  "Montant": number;
  Devise: string;
  "Niveau urgence": string;
  Échéance: string;
  Statut: string;
  "validation DR": boolean;
  "validation DOP": boolean;
  "validation DG": boolean;
  "Centre de coût": string;
  Gestionnaire: string;
  Région: string;
  // Champs supplémentaires
  "Date d'émission"?: string;
  "Catégorie fournisseur"?: string;
  "Type de facture"?: string;
  "Catégorie de charge"?: string;
  "Numéro de dossier"?: string;
  "Motif / Description"?: string;
  "Taux facture"?: number;
  "Délais de paiement"?: number;
  "Mode de paiement requis"?: string;
  "Facture attachée"?: string;
  "Commentaires"?: string;
}

interface ValidationPageProps {
  activeMenu?: string;
  menuTitle?: string;
}

function ValidationPage({ activeMenu, menuTitle = 'En attente validation' }: ValidationPageProps) {
  const { canView } = usePermission();
  const { agent } = useAuth();
  const { error } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('En attente validation DR');
  const [selectedRegion, setSelectedRegion] = useState(agent?.REGION === 'TOUT' ? 'all' : (agent?.REGION || 'all'));
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [allInvoices, setAllInvoices] = useState<Facture[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Déterminer le filtre selon le menu actif
  const getStatusFilter = () => {
    switch (activeMenu) {
      case 'factures-pending':
        return 'En attente validation DR';
      case 'factures-pending-dop':
        return 'En attente validation DOP';
      case 'factures-validated':
        return 'Validée';
      case 'factures-rejected':
        return 'Rejetée';
      case 'factures-overdue':
        return 'Échue';
      default:
        return 'En attente validation DR';
    }
  };

  useEffect(() => {
    const statusFilter = getStatusFilter();
    console.log('=== useEffect FIRST ===');
    console.log('activeMenu prop:', activeMenu);
    console.log('statusFilter calculated:', statusFilter);
    setSelectedStatus(statusFilter);
    loadInvoices(statusFilter);
  }, [activeMenu]);

  useEffect(() => {
    // Appeler filterInvoices quand allInvoices change
    if (allInvoices.length > 0 || loading === false) {
      filterInvoices(selectedRegion, selectedYear, selectedMonth);
    }
  }, [selectedRegion, selectedYear, selectedMonth, allInvoices, searchTerm]);

  const loadInvoices = async (statusFilter: string) => {
    setLoading(true);
    try {
      // Charger les factures selon le contexte
      let allData = [];
      
      if (statusFilter === 'En attente validation DR' || 
          statusFilter === 'En attente validation DOP' || 
          statusFilter === 'En attente validation DG') {
        // Pour les zones d'attente, ne charger QUE les factures avec ce statut exact, sans filtre supplémentaire
        const { data: pendingData, error: pendingError } = await supabase
          .from('FACTURES')
          .select('*')
          .eq('Statut', statusFilter)
          .order('"Date de réception"', { ascending: false });

        if (pendingError) {
          console.error('Erreur chargement factures en attente:', pendingError);
          error('Erreur lors du chargement des factures');
          return;
        }

        // Charger les paiements existants pour exclure les factures avec paiements
        const { data: paiements, error: paiementsError } = await supabase
          .from('PAIEMENTS')
          .select('NumeroFacture, montantPaye');

        const facturesAvecPaiements = new Set();
        if (paiements && !paiementsError) {
          paiements.forEach((p: any) => {
            // Vérifier si le montant payé est supérieur à 0 (même pour les paiements partiels)
            const paidAmount = parseFloat(p.montantPaye) || 0;
            const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
            
            if (paidAmount > 0 && invoiceNumber) {
              facturesAvecPaiements.add(invoiceNumber);
            }
          });
        }

        // Filtrer les factures payées
        allData = (pendingData || []).filter(invoice => {
          if (facturesAvecPaiements.has(invoice["Numéro de facture"])) {
            console.log(`Facture ${invoice["Numéro de facture"]}: Paiement détecté, exclusion`);
            return false;
          }
          return true;
        });
        
      } else if (statusFilter === 'Validée') {
        // Pour la zone validée, charger TOUTES les factures sauf les rejetées
        // et filtrer celles qui respectent les règles de validation selon le montant
        const { data: allInvoicesData, error: allError } = await supabase
          .from('FACTURES')
          .select('*')
          .not('Statut', 'eq', 'Rejetée')
          .order('"Date de réception"', { ascending: false });

        console.log('=== DEBUG VALIDÉE - FACTURE 2026-00652 ===');
        console.log('Query: ALL factures (pas de filtre sur Statut)');
        console.log('Error:', allError);
        console.log('Data received from Supabase:', allInvoicesData);
        console.log('Data length before filtering:', allInvoicesData?.length || 0);
        
        if (allInvoicesData && allInvoicesData.length > 0) {
          console.log('All invoices from DB:');
          allInvoicesData.forEach(inv => {
            if (inv["Numéro de facture"] === '2026-00652') {
              console.log(`*** FACTURE CIBLE 2026-00652 ***: statut=${inv.Statut}, montant=${inv.Montant}, DR=${inv["validation DR"]}, DOP=${inv["validation DOP"]}, DG=${inv["validation DG"]}`);
            } else {
              console.log(`  - ${inv["Numéro de facture"]}: statut=${inv.Statut}, montant=${inv.Montant}`);
            }
          });
        }

        if (allError) {
          console.error('Erreur chargement factures validées:', allError);
          error('Erreur lors du chargement des factures');
          return;
        }

        // Utiliser les utilitaires de paiement centralisés
        const { getAllPaymentsMap } = await import('../utils/paymentUtils');
        const paymentsMap = await getAllPaymentsMap();
        const facturesAvecPaiements = new Set(paymentsMap.keys());
        
        console.log('=== DEBUG PAIEMENTS POUR 2026-00652 ===');
        console.log('Nombre de paiements trouvés:', paymentsMap.size);
        console.log('Factures avec paiements finales:', Array.from(facturesAvecPaiements));
        console.log('2026-00652 présente dans facturesAvecPaiements?', facturesAvecPaiements.has('2026-00652'));
        
        if (facturesAvecPaiements.has('2026-00652')) {
          console.log(`*** PAIEMENT POUR 2026-00652 ***: montant=${paymentsMap.get('2026-00652')}`);
        }

        // Filtrer les factures qui respectent les règles de validation selon le montant
        // ET qui n'ont pas encore de paiement
        allData = (allInvoicesData || []).filter(invoice => {
          // Debug spécial pour 2026-00652
          if (invoice["Numéro de facture"] === '2026-00652') {
            console.log(`*** FILTRAGE 2026-00652 ***: statut=${invoice.Statut}, dansFacturesAvecPaiements=${facturesAvecPaiements.has('2026-00652')}`);
          }
          
          // Exclure les factures rejetées
          if (invoice.Statut === 'Rejetée') {
            console.log(`Facture ${invoice["Numéro de facture"]}: Rejetée, exclusion`);
            return false;
          }

          // Vérifier s'il y a déjà un paiement pour cette facture
          if (facturesAvecPaiements.has(invoice["Numéro de facture"])) {
            console.log(`Facture ${invoice["Numéro de facture"]}: Paiement détecté, exclusion`);
            if (invoice["Numéro de facture"] === '2026-00652') {
              console.log(`*** 2026-00652 EXCLUE CAR PAYÉE ***`);
            }
            return false;
          }

          // Convertir le montant en nombre (peut être une string dans la BDD)
          const amountRaw = invoice.Montant;
          const amount = typeof amountRaw === 'string' ? parseFloat(amountRaw) : (amountRaw || 0);
          
          const drValidated = invoice["validation DR"] != null && String(invoice["validation DR"]).trim() !== '';
          const dopValidated = invoice["validation DOP"] != null && String(invoice["validation DOP"]).trim() !== '';
          const dgValidated = invoice["validation DG"] != null && String(invoice["validation DG"]).trim() !== '';
          
          console.log(`Vérification facture ${invoice["Numéro de facture"]}: statut=${invoice.Statut}, montant=${amount} (raw=${amountRaw}, type=${typeof amountRaw}), DR=${drValidated}, DOP=${dopValidated}, DG=${dgValidated}`);
          
          // Appliquer les règles de validation selon le montant
          let isValid = false;
          
          if (amount <= 2500) {
            // 0 à 2,500 USD : DR seule doit signer
            isValid = drValidated;
            console.log(`  → Montant ${amount} <= 2500: DR required=${drValidated}`);
          } else if (amount <= 10000) {
            // 2,500 à 10,000 USD : DR + DOP doivent signer
            isValid = drValidated && dopValidated;
            console.log(`  → Montant ${amount} entre 2500-10000: DR+DOP required=${drValidated && dopValidated}`);
          } else {
            // > 10,000 USD : DR + DOP + DG doivent tous signer
            isValid = drValidated && dopValidated && dgValidated;
            console.log(`  → Montant ${amount} > 10000: DR+DOP+DG required=${drValidated && dopValidated && dgValidated}`);
          }
          
          console.log(`  → Résultat: ${isValid ? 'VALIDE ✓' : 'INVALIDE ✗'}`);
          return isValid;
        });
        
        console.log(`Total factures validées après filtrage: ${allData.length}`);
      } else if (statusFilter === 'Rejetée') {
        // Pour les factures rejetées, charger toutes les factures avec Statut = 'Rejetée'
        const { data: rejectedData, error: rejectedError } = await supabase
          .from('FACTURES')
          .select('*')
          .eq('Statut', 'Rejetée')
          .order('"Date de réception"', { ascending: false });

        console.log('=== FACTURES REJETÉES ===');
        console.log('Query: Statut = Rejetée');
        console.log('Error:', rejectedError);
        console.log('Data length:', rejectedData?.length || 0);

        if (rejectedError) {
          console.error('Erreur chargement factures rejetées:', rejectedError);
          error('Erreur lors du chargement des factures rejetées');
          return;
        }

        // Charger les paiements existants pour exclure les factures avec paiements
        const { data: paiements, error: paiementsError } = await supabase
          .from('PAIEMENTS')
          .select('NumeroFacture, montantPaye');

        const facturesAvecPaiements = new Set();
        if (paiements && !paiementsError) {
          paiements.forEach((p: any) => {
            // Vérifier si le montant payé est supérieur à 0 (même pour les paiements partiels)
            const paidAmount = parseFloat(p.montantPaye) || 0;
            const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
            
            if (paidAmount > 0 && invoiceNumber) {
              facturesAvecPaiements.add(invoiceNumber);
            }
          });
        }

        // Filtrer les factures payées
        allData = (rejectedData || []).filter(invoice => {
          if (facturesAvecPaiements.has(invoice["Numéro de facture"])) {
            console.log(`Facture ${invoice["Numéro de facture"]}: Paiement détecté, exclusion`);
            return false;
          }
          return true;
        });
        console.log(`Total factures rejetées après exclusion des paiements: ${allData.length}`);
      } else if (statusFilter === 'Échue') {
        // Pour les factures échues, charger toutes les factures et filtrer par date d'échéance
        const { data: allInvoicesData, error: allError } = await supabase
          .from('FACTURES')
          .select('*')
          .order('"Date de réception"', { ascending: false });

        console.log('=== FACTURES ÉCHUES ===');
        console.log('Query: All factures');
        console.log('Error:', allError);
        console.log('Data length:', allInvoicesData?.length || 0);

        if (allError) {
          console.error('Erreur chargement factures echues:', allError);
          error('Erreur lors du chargement des factures');
          return;
        }

        // Charger les paiements existants pour exclure les factures avec paiements
        const { data: paiements, error: paiementsError } = await supabase
          .from('PAIEMENTS')
          .select('NumeroFacture, montantPaye');

        const facturesAvecPaiements = new Set();
        if (paiements && !paiementsError) {
          paiements.forEach((p: any) => {
            // Vérifier si le montant payé est supérieur à 0 (même pour les paiements partiels)
            const paidAmount = parseFloat(p.montantPaye) || 0;
            const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
            
            if (paidAmount > 0 && invoiceNumber) {
              facturesAvecPaiements.add(invoiceNumber);
            }
          });
        }

        // Filtrer les factures dont la date d'échéance est dépassée ET qui ne sont pas payées
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        allData = (allInvoicesData || []).filter(invoice => {
          // Exclure les factures payées
          if (facturesAvecPaiements.has(invoice["Numéro de facture"])) {
            console.log(`Facture ${invoice["Numéro de facture"]}: Paiement détecté, exclusion`);
            return false;
          }

          if (!invoice.Échéance) return false;
          const dueDate = new Date(invoice.Échéance);
          dueDate.setHours(0, 0, 0, 0);
          console.log(`Vérification facture ${invoice["Numéro de facture"]}: Échéance=${invoice.Échéance}, Dépassée=${dueDate < today}`);
          return dueDate < today;
        });
        
        console.log(`Total factures échues après filtrage: ${allData.length}`);
      } else {
        // Pour les autres cas, charger selon le statut
        const { data: statusData, error: statusError } = await supabase
          .from('FACTURES')
          .select('*')
          .eq('Statut', statusFilter)
          .order('"Date de réception"', { ascending: false });

        if (statusError) {
          console.error('Erreur chargement factures:', statusError);
          error('Erreur lors du chargement des factures');
          return;
        }

        // Charger les paiements existants pour exclure les factures avec paiements
        const { data: paiements, error: paiementsError } = await supabase
          .from('PAIEMENTS')
          .select('NumeroFacture, montantPaye');

        const facturesAvecPaiements = new Set();
        if (paiements && !paiementsError) {
          paiements.forEach((p: any) => {
            // Vérifier si le montant payé est supérieur à 0 (même pour les paiements partiels)
            const paidAmount = parseFloat(p.montantPaye) || 0;
            const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
            
            if (paidAmount > 0 && invoiceNumber) {
              facturesAvecPaiements.add(invoiceNumber);
            }
          });
        }

        // Filtrer les factures payées
        allData = (statusData || []).filter(invoice => {
          if (facturesAvecPaiements.has(invoice["Numéro de facture"])) {
            console.log(`Facture ${invoice["Numéro de facture"]}: Paiement détecté, exclusion`);
            return false;
          }
          return true;
        });
      }

      const filteredData = allData;
      
      // Debug: Analyser les factures spécifiques
      console.log('Données chargées pour', statusFilter, ':', allData.map(inv => ({
        numero: inv["Numéro de facture"],
        statut: inv.Statut,
        validations: {
          DR: inv["validation DR"],
          DOP: inv["validation DOP"],
          DG: inv["validation DG"]
        }
      })));
      
      setAllInvoices(allData);
      
      // Debug détaillé
      console.log('=== VALIDATION PAGE DEBUG ===');
      console.log('statusFilter:', statusFilter);
      console.log('allData.length:', allData.length);
      if (allData.length > 0) {
        console.log('Première facture:', {
          numero: allData[0]["Numéro de facture"],
          statut: allData[0].Statut,
          montant: allData[0].Montant,
          region: allData[0]["Région"]
        });
      }
    } catch (err) {
      console.error('Erreur générale:', err);
      error('Erreur lors du chargement des factures');
    } finally {
      setLoading(false);
    }
  };

  const filterInvoices = (region?: string, year?: string, month?: string) => {
    console.log('=== filterInvoices CALLED ===');
    console.log('allInvoices.length:', allInvoices.length);
    console.log('region:', region, 'year:', year, 'month:', month, 'searchTerm:', searchTerm);
    
    let filtered = [...allInvoices];

    // Filtre par recherche (N° dossier, fournisseur, montant, priorité)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(inv => {
        const dossierNum = (inv["Numéro de dossier"] || '').toLowerCase();
        const invoiceNumber = (inv["Numéro de facture"] || '').toLowerCase();
        const supplier = (inv.Fournisseur || '').toLowerCase();
        const amount = String(inv.Montant || '');
        const urgency = (inv["Niveau urgence"] || '').toLowerCase();
        
        return dossierNum.includes(term) || 
               invoiceNumber.includes(term) || 
               supplier.includes(term) || 
               amount.includes(term) || 
               urgency.includes(term);
      });
      console.log('Après filtre recherche:', filtered.length);
    }

    // Filtre par région
    if (region && region !== 'all') {
      filtered = filtered.filter(inv => inv["Région"] === region);
      console.log('Après filtre région:', filtered.length);
    }

    // Filtre par année
    if (year) {
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);
      filtered = filtered.filter(inv => {
        if (!inv["Date de réception"]) return false;
        const receptionDate = new Date(inv["Date de réception"]);
        return receptionDate >= startDate && receptionDate <= endDate;
      });
      console.log('Après filtre année:', filtered.length);
    }

    // Filtre par mois
    if (month && month !== 'all') {
      const monthNum = parseInt(month);
      filtered = filtered.filter(inv => {
        if (!inv["Date de réception"]) return false;
        const receptionDate = new Date(inv["Date de réception"]);
        return receptionDate.getMonth() + 1 === monthNum;
      });
      console.log('Après filtre mois:', filtered.length);
    }

    // Debug: Logger les données avant transformation
    console.log('Données avant transformation:', filtered.length, 'factures');
    console.log('Avant transformation détail:', filtered.map(inv => ({
      numero: inv["Numéro de facture"],
      statut: inv.Statut,
      validations: {
        DR: inv["validation DR"],
        DOP: inv["validation DOP"],
        DG: inv["validation DG"]
      }
    })));

    // Transformer les données Facture en Invoice pour InvoiceTable
    const transformedInvoices: Invoice[] = filtered.map(inv => {
      const amountRaw = inv.Montant;
      const amount = typeof amountRaw === 'string' ? parseFloat(amountRaw) : (amountRaw || 0);
      const drValidated = inv["validation DR"] != null && String(inv["validation DR"]).trim() !== '';
      const dopValidated = inv["validation DOP"] != null && String(inv["validation DOP"]).trim() !== '';
      const dgValidated = inv["validation DG"] != null && String(inv["validation DG"]).trim() !== '';
      
      let isBonAPayer = false;
      // Nouvelles règles de validation
      if (amount <= 2500) {
        // Pour les factures de moins de 2500$, DR seul suffit
        isBonAPayer = drValidated;
      } else if (dopValidated) {
        // Si le DOP a signé, passe directement à "bon à payer" peu importe le montant
        isBonAPayer = true;
      } else {
        // Anciennes règles pour les autres cas
        if (amount <= 10000) {
          isBonAPayer = drValidated && dopValidated;
        } else {
          isBonAPayer = drValidated && dopValidated && dgValidated;
        }
      }
      
      console.log(`Transformation ${inv["Numéro de facture"]}: montant=${amount}, bon-a-payer=${isBonAPayer}`);
      
      return {
      id: parseInt(inv.ID),
      invoiceNumber: inv["Numéro de facture"],
      supplier: inv.Fournisseur,
      receptionDate: inv["Date de réception"],
      amount: amount,
      currency: inv.Devise as 'USD' | 'CDF' | 'EUR',
      chargeCategory: inv["Catégorie de charge"] || 'Non spécifié',
      urgencyLevel: inv["Niveau urgence"] as 'Haute' | 'Moyenne' | 'Basse',
      status: (() => {
        const finalStatus = inv.Statut === 'Rejetée' ? 'rejected' :
               inv.Statut === 'Échue' ? 'overdue' :
               isBonAPayer ? 'bon-a-payer' : 
               inv.Statut === 'En attente validation DR' ? 'pending' : 
               inv.Statut === 'En attente validation DOP' ? 'pending' :
               inv.Statut === 'En attente validation DG' ? 'pending' : 
               inv.Statut === 'Validée' ? 'validated' : 
               inv.Statut === 'Payée' ? 'paid' : 'pending';
        return finalStatus;
      })(),
      region: inv.Région as 'OUEST' | 'SUD' | 'EST' | 'NORD',
      validations: ((inv["validation DR"] != null && String(inv["validation DR"]).trim() !== '') ? 1 : 0) + ((inv["validation DOP"] != null && String(inv["validation DOP"]).trim() !== '') ? 1 : 0) + ((inv["validation DG"] != null && String(inv["validation DG"]).trim() !== '') ? 1 : 0),
      file: inv["Facture attachée"] || undefined,
      // Champs supplémentaires pour le formulaire
      emissionDate: inv["Date d'émission"],
      supplierCategory: inv["Catégorie fournisseur"],
      costCenter: inv["Centre de coût"],
      manager: inv.Gestionnaire,
      invoiceType: inv["Type de facture"],
      fileNumber: inv["Numéro de dossier"],
      motif: inv["Motif / Description"],
      exchangeRate: inv["Taux facture"],
      paymentDelay: inv["Délais de paiement"]?.toString(),
      dueDate: inv.Échéance,
      paymentMode: inv["Mode de paiement requis"],
      attachedInvoiceUrl: inv["Facture attachée"],
      comments: inv["Commentaires"]
    };
    });

    console.log('=== FINAL RESULT ===');
    console.log('transformedInvoices.length:', transformedInvoices.length);
    console.log('transformedInvoices:', transformedInvoices);

    setInvoices(transformedInvoices);
  };

  const handleRefresh = () => {
    loadInvoices(selectedStatus);
  };

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
  };

  const regions = [
    { id: 'all', label: 'Toutes les régions' },
    { id: 'OUEST', label: 'OUEST' },
    { id: 'EST', label: 'EST' },
    { id: 'SUD', label: 'SUD' }
  ];

  const years = [
    { id: '2026', label: '2026' },
    { id: '2025', label: '2025' },
    { id: '2024', label: '2024' }
  ];

  const months = [
    { id: 'all', label: 'Tous les mois' },
    { id: '1', label: 'Janvier' },
    { id: '2', label: 'Février' },
    { id: '3', label: 'Mars' },
    { id: '4', label: 'Avril' },
    { id: '5', label: 'Mai' },
    { id: '6', label: 'Juin' },
    { id: '7', label: 'Juillet' },
    { id: '8', label: 'Août' },
    { id: '9', label: 'Septembre' },
    { id: '10', label: 'Octobre' },
    { id: '11', label: 'Novembre' },
    { id: '12', label: 'Décembre' }
  ];

  const getValidationStatus = (invoice: Facture) => {
    if (invoice["validation DG"]) return { text: 'DG', color: 'text-green-600' };
    if (invoice["validation DOP"]) return { text: 'DOP', color: 'text-blue-600' };
    if (invoice["validation DR"]) return { text: 'DR', color: 'text-yellow-600' };
    return { text: 'En attente', color: 'text-gray-600' };
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency?.toLowerCase()) {
      case 'urgent': return 'text-red-600';
      case 'prioritaire': return 'text-orange-600';
      default: return 'text-green-600';
    }
  };

  const getDaysRemaining = (dueDate: string) => {
    if (!dueDate) return '-';
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `Échue (${Math.abs(diffDays)}j)`;
    if (diffDays === 0) return 'Aujourd\'hui';
    return `${diffDays}j`;
  };

  const getStatistics = () => {
    const totalAmount = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const urgentCount = invoices.filter(inv => {
      const urgency = inv.urgencyLevel?.toLowerCase();
      return urgency === 'haute' || urgency === 'urgent' || urgency === 'prioritaire';
    }).length;
    const overdueCount = invoices.filter(inv => {
      if (!inv.dueDate) return false;
      const today = new Date();
      const due = new Date(inv.dueDate);
      return due < today;
    }).length;

    return {
      total: totalAmount.toFixed(2),
      count: invoices.length,
      urgent: urgentCount,
      overdue: overdueCount
    };
  };

  const stats = getStatistics();

  const handleExportToExcel = () => {
    if (invoices.length === 0) {
      alert('Aucune facture à exporter');
      return;
    }

    // Préparer les données pour l'export
    const exportData = invoices.map(inv => ({
      'Numéro de facture': inv.invoiceNumber || '',
      'Fournisseur': inv.supplier || '',
      'Montant': inv.amount || 0,
      'Devise': inv.currency || 'USD',
      'Date de réception': inv.receptionDate || '',
      'Échéance': inv.dueDate || '',
      'Niveau urgence': inv.urgencyLevel || '',
      'Région': inv.region || '',
      'Centre de coût': inv.costCenter || '',
      'Statut': inv.status || '',
      'Gestionnaire': inv.manager || ''
    }));

    // Créer un workbook et ajouter les données
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Factures');

    // Définir les largeurs de colonnes
    const colWidths = [
      { wch: 18 },
      { wch: 25 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 18 },
      { wch: 15 },
      { wch: 15 }
    ];
    ws['!cols'] = colWidths;

    // Télécharger le fichier
    const fileName = `Factures_${selectedStatus}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  if (!canView('factures')) {
    return <AccessDenied message="Vous n'avez pas accès à la validation des factures." />;
  }

  return (
    <div className="p-0 bg-white">
      {/* Filtres unifiés avec style tabs */}
      <div className="bg-gray-100  pr-4 pl-4 pt-4 pb-0 mb-6">
        {/* Header de la page */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{menuTitle}</h1>
          <p className="text-gray-600 mt-0">
            {invoices.length} facture{invoices.length > 1 ? 's' : ''} en attente
          </p>
        </div>
      </div>
        <div className="flex items-center justify-between">
          
          {/* Onglets par région */}
          <div className="flex">
            {agent?.REGION === 'TOUT' ? (
              <>
                <button
                  onClick={() => handleRegionChange('all')}
                  className={`pr-4 pl-4 pt-2 pb-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                    selectedRegion === 'all'
                      ? 'font-bold text-black bg-white'
                      : 'text-gray-600'
                  }`}
                >
                  Toutes
                </button>
                <button
                  onClick={() => handleRegionChange('OUEST')}
                  className={`pr-4 pl-4 pt-2 pb-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                    selectedRegion === 'OUEST'
                      ? 'font-bold text-black bg-white'
                      : 'text-gray-600'
                  }`}
                >
                  OUEST
                </button>
                <button
                  onClick={() => handleRegionChange('EST')}
                  className={`pr-4 pl-4 pt-2 pb-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                    selectedRegion === 'EST'
                      ? 'font-bold text-black bg-white'
                      : 'text-gray-600'
                  }`}
                >
                  EST
                </button>
                <button
                  onClick={() => handleRegionChange('SUD')}
                  className={`pr-4 pl-4 pt-2 pb-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                    selectedRegion === 'SUD'
                      ? 'font-bold text-black bg-white'
                      : 'text-gray-600'
                  }`}
                >
                  SUD
                </button>
                <button
                  onClick={() => handleRegionChange('NORD')}
                  className={`pr-4 pl-4 pt-2 pb-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                    selectedRegion === 'NORD'
                      ? 'font-bold text-black bg-white'
                      : 'text-gray-600'
                  }`}
                >
                  NORD
                </button>
              </>
            ) : (
              agent?.REGION && (
                <button
                  onClick={() => handleRegionChange(agent.REGION)}
                  className={`pr-4 pl-4 pt-2 pb-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                    selectedRegion === agent.REGION
                      ? 'font-bold text-black bg-white'
                      : 'text-gray-600'
                  }`}
                >
                  {agent.REGION}
                </button>
              )
            )}
          </div>
          
          {/* Contrôles à droite */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="N° dossier, fournisseur, montant, priorité..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Année</label>
              <select 
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Mois</label>
              <select 
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {months.map((month) => (
                  <option key={month.id} value={month.id}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            
            <button
              onClick={() => loadInvoices(getStatusFilter())}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded hover:from-gray-600 hover:to-gray-700 transition-all duration-200 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Actualiser
            </button>
            
            <button
              onClick={handleExportToExcel}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-gradient-to-r from-green-500 to-green-600 text-white rounded hover:from-green-600 hover:to-green-700 transition-all duration-200"
              title="Exporter les factures en Excel"
            >
              <Download size={14} />
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 bg-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement des factures...</p>
          </div>
        </div>
      ) : (
        <>
        {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4" >
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-4 hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-semibold opacity-90">Total Factures</p>
                  <p className="text-3xl font-bold">{stats.count.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="opacity-30">
              <FileText size={32} />
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg shadow-lg p-4 hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-semibold opacity-90">Montant Total</p>
                  <p className="text-3xl font-bold">{stats.total.toLocaleString()}</p>
                  <p className="text-xs opacity-75 mt-1">USD</p>
                </div>
              </div>
            </div>
            <div className="opacity-30">
              <DollarSign size={32} />
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg shadow-lg p-4 hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-semibold opacity-90">Factures Urgentes</p>
                  <p className="text-3xl font-bold">{stats.urgent.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="opacity-30">
              <AlertCircle size={32} />
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-lg p-4 hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer text-white">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-semibold opacity-90">Factures Échues</p>
                  <p className="text-3xl font-bold">{stats.overdue.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="opacity-30">
              <Calendar size={32} />
            </div>
          </div>
        </div>
      </div>

      {/* Tableau des factures avec menu contextuel */}
      <div className="px-0 pb-4">
        <InvoiceTable invoices={invoices} activeMenu={activeMenu} agent={agent} />
      </div>
        </>
      )}
    </div>
  );
}

export default ValidationPage;

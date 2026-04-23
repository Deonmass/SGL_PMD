import { X, FileText, Loader2, Maximize2 } from 'lucide-react';
import { Invoice } from '../types';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { ordoPaiementService, caisseService, Caisse } from '../services/tableService';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { refreshAllData } from '../hooks/useDataRefresh';
import CompteModal from './modals/CompteModal';
import Swal from 'sweetalert2';

interface PaymentData {
  datePaiement: string;
  typePaiement: 'Total' | 'Partiel';
  modePaiement: 'caisse' | 'banque' | 'cheque' | 'op' | '';
  entite: string;
  referencePaiement: string;
  devise: 'USD' | 'CDF' | 'EUR';
  montantAutoriseé: number;
  montantPaye: number | null;
  compteSGL: string;
  compteFournisseur: string;
  BanqueFournisseur: string;
  BanqueSGL: string;
  commentaires: string;
}

interface PaiementModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSuccess?: () => void;
  showOnlyNew?: boolean;
  readOnly?: boolean;
  ordoPaiementId?: number;
}

interface CompteInitialData {
  Fournisseur: string;
  Banque: string;
  devise: string;
  SGL: boolean;
}

const banques = ['Access Bank RDC', 'Afriland First Bank CD SA', 'BGFibank', 'CADECO', 'Ecobank', 'EQUITY BCDC', 'FirstBank DRC SA', 'RAWBANK', 'Solidaire Banque SA', 'Sofibanque SA', 'Standard Bank Congo', 'TMB'];

const getReferenceLabel = (mode: string): string => {
  switch (mode) {
    case 'banque':
      return 'Entrer le compte bancaire *';
    case 'cheque':
      return 'Entrer le N° de chèque *';
    case 'op':
      return 'Entrer la Référence OP *';
    case 'caisse':
      return 'Référence *';
    default:
      return 'Référence paiement';
  }
};

// Composant pour charger et afficher les comptes SGL
function CompteSGLSelect({
  value,
  onChange,
  banque,
  disabled,
  refreshTrigger = 0,
  onAddAccount
}: {
  value: string;
  onChange: (compte: string) => void;
  banque: string;
  disabled: boolean;
  refreshTrigger?: number;
  onAddAccount?: () => void;
}) {
  const [comptes, setComptes] = useState<Array<{ Compte: string; devise?: string }>>([]);
  
  const loadComptesSGL = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('COMPTES')
        .select('Compte, devise')
        .eq('Banque', banque)
        .eq('SGL', true);
      
      if (!error && data) {
        console.log('Comptes SGL chargés:', data);
        setComptes(data);
      } else if (error) {
        console.error('Erreur query SGL:', error);
      }
    } catch (error) {
      console.error('Erreur chargement comptes SGL:', error);
    }
  }, [banque]);

  useEffect(() => {
    if (banque) {
      loadComptesSGL();
    } else {
      setComptes([]);
    }
  }, [banque, loadComptesSGL, refreshTrigger]);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        Compte SGL
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">Sélectionner un compte...</option>
        {comptes.map((cpt) => (
          <option key={cpt.Compte} value={cpt.Compte}>
            {cpt.Compte} {cpt.devise ? `(${cpt.devise})` : ''}
          </option>
        ))}
      </select>
      {!disabled && banque && comptes.length === 0 && (
        <button
          type="button"
          onClick={onAddAccount}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Ajouter un compte
        </button>
      )}
    </div>
  );
}

// Composant pour charger et afficher les comptes du fournisseur
function CompteFournisseurSelect({
  value,
  onChange,
  banque,
  fournisseur,
  disabled,
  refreshTrigger = 0,
  onAddAccount
}: {
  value: string;
  onChange: (compte: string) => void;
  banque: string;
  fournisseur: string;
  disabled: boolean;
  refreshTrigger?: number;
  onAddAccount?: () => void;
}) {
  const [comptes, setComptes] = useState<Array<{ Compte: string; devise?: string }>>([]);
  
  const loadComptesF = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('COMPTES')
        .select('Compte, devise')
        .eq('Banque', banque)
        .ilike('Fournisseur', `%${fournisseur}%`);
      
      if (!error && data) {
        setComptes(data);
      } else if (error) {
        console.error('Erreur query fournisseur:', error);
      }
    } catch (error) {
      console.error('Erreur chargement comptes fournisseur:', error);
    }
  }, [banque, fournisseur]);

  useEffect(() => {
    if (banque && fournisseur) {
      loadComptesF();
    } else {
      setComptes([]);
    }
  }, [banque, fournisseur, loadComptesF, refreshTrigger]);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        Compte Fournisseur
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">Sélectionner un compte...</option>
        {comptes.map((cpt) => (
          <option key={cpt.Compte} value={cpt.Compte}>
            {cpt.Compte} {cpt.devise ? `(${cpt.devise})` : ''}
          </option>
        ))}
      </select>
      {!disabled && banque && fournisseur && comptes.length === 0 && (
        <button
          type="button"
          onClick={onAddAccount}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Ajouter un compte
        </button>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PaiementModal({ invoice, onClose, onSuccess, showOnlyNew: _showOnlyNew = false, readOnly = false, ordoPaiementId }: PaiementModalProps) {
  const { success, error: showError } = useToast();
  const { agent } = useAuth();
  const [activeTab, setActiveTab] = useState(1);
  const [activeLeftTab, setActiveLeftTab] = useState<'visualization' | 'details'>('visualization');
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalPaid, setTotalPaid] = useState(0);
  const [savedTabs, setSavedTabs] = useState<number[]>([]);
  const [caisses, setCaisses] = useState<Caisse[]>([]);
  const [invoiceDetails, setInvoiceDetails] = useState<any>(null);
  const [showCompteModal, setShowCompteModal] = useState(false);
  const [compteRefreshTrigger, setCompteRefreshTrigger] = useState(0);
  const [compteInitialData, setCompteInitialData] = useState<CompteInitialData | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const showAlertError = useCallback((message: string) => {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message,
      confirmButtonColor: '#2563eb'
    });
  }, []);

  const showAlertSuccess = useCallback((message: string) => {
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: message,
      confirmButtonColor: '#2563eb'
    });
  }, []);

  // Wrapper pour onClose qui rafraîchit les données
  const handleClose = useCallback(() => {
    refreshAllData();
    onClose();
  }, [onClose]);

  // Charger les détails complets de la facture au montage
  useEffect(() => {
    const loadInvoiceDetails = async () => {
      try {
        const { data, error } = await supabase
          .from('FACTURES')
          .select('*')
          .eq('Numéro de facture', invoice.invoiceNumber)
          .single();

        if (!error && data) {
          setInvoiceDetails(data);
          console.log('Détails facture chargés:', data);
        } else if (error) {
          console.error('Erreur chargement détails facture:', error);
        }
      } catch (err) {
        console.error('Erreur lors du chargement des détails de la facture:', err);
      }
    };
    loadInvoiceDetails();
  }, [invoice.invoiceNumber]);

  // Charger les caisses au montage du composant
  useEffect(() => {
    const loadCaisses = async () => {
      try {
        const data = await caisseService.getAll();
        setCaisses(data || []);
      } catch (err) {
        console.error('Erreur lors du chargement des caisses:', err);
      }
    };
    loadCaisses();
  }, []);

  // Initialiser le premier paiement
  useEffect(() => {
    loadExistingPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.invoiceNumber, readOnly]);

  const loadExistingPayments = async () => {
    try {
      // Load existing payments from PAIEMENTS table
      // ID format: {invoiceNumber}-{index}-{timestamp}
      const { data, error } = await supabase
        .from('PAIEMENTS')
        .select('*')
        .ilike('id', `${invoice.invoiceNumber}-%`)
        .order('datePaiement', { ascending: true });

      if (error) {
        console.error('Erreur lors du chargement des paiements:', error);
        initializeFirstPayment();
        return;
      }

      if (data && data.length > 0) {
        // Map existing payments to PaymentData format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingPayments = data.map((payment: any, index: number) => {
          // Calculer le montant facture pour ce paiement
          let montantFactureForPayment = invoice.amount || 0;
          for (let i = 0; i < index; i++) {
            montantFactureForPayment -= (data[i]?.montantPaye || 0);
          }
          return {
            datePaiement: payment.datePaiement || '',
            typePaiement: payment.typePaiement || 'Total' as const,
            modePaiement: payment.modePaiement || '' as const,
            entite: '', // Not stored in DB, form-only field
            referencePaiement: payment.referencePaiement || '',
            devise: payment.devise || invoice.currency as 'USD' | 'CDF' | 'EUR',
            montantAutoriseé: payment.montantAutorise !== undefined && payment.montantAutorise !== null
              ? Math.round((Number(payment.montantAutorise) || 0) * 100) / 100
              : Math.round(Math.max(0, montantFactureForPayment) * 100) / 100,
            montantPaye: payment.montantPaye || 0,
            compteSGL: payment.compteSGL || '',
            compteFournisseur: payment.compteFournisseur || '',
            BanqueFournisseur: payment.BanqueFournisseur || '',
            BanqueSGL: payment.BanqueSGL || '',
            commentaires: payment.commentaires || ''
          };
        });

        // Add a new empty payment for additional entries SEULEMENT s'il y a du reste à payer
        const totalPaid = Math.round(existingPayments.reduce((sum, p) => sum + (p.montantPaye || 0), 0) * 100) / 100;
        const resteTotal = Math.round(((invoice.amount || 0) - totalPaid) * 100) / 100;
        
        if (resteTotal > 0) {
          existingPayments.push({
            datePaiement: new Date().toISOString().split('T')[0],
            typePaiement: 'Total' as const,
            modePaiement: '' as const,
            entite: '',
            referencePaiement: '',
            devise: invoice.currency as 'USD' | 'CDF' | 'EUR',
            montantAutoriseé: resteTotal,
            montantPaye: 0,
            compteSGL: '',
            compteFournisseur: '',
            BanqueFournisseur: '',
            BanqueSGL: '',
            commentaires: ''
          });
        }

        setPayments(existingPayments);
        // Mark existing payments as saved
        setSavedTabs(Array.from({ length: data.length }, (_, i) => i));
      } else {
        // No existing payments, initialize with first
        initializeFirstPayment();
      }
    } catch (error) {
      console.error('Erreur:', error);
      if (!readOnly) {
        initializeFirstPayment();
      }
    }
  };

  const initializeFirstPayment = () => {
    const initialPayment: PaymentData = {
      datePaiement: new Date().toISOString().split('T')[0],
      typePaiement: 'Total',
      modePaiement: '',
      entite: '',
      referencePaiement: '',
      devise: invoice.currency as 'USD' | 'CDF' | 'EUR',
      montantAutoriseé: Math.round((invoice.amount || 0) * 100) / 100,
      montantPaye: 0,
      compteSGL: '',
      compteFournisseur: '',
      BanqueFournisseur: '',
      BanqueSGL: '',
      commentaires: ''
    };
    setPayments([initialPayment]);
  };

  // Calculer le total payé
  useEffect(() => {
    const total = payments.reduce((sum, p) => sum + (p.montantPaye || 0), 0);
    // Arrondir à 2 décimales
    setTotalPaid(Math.round(total * 100) / 100);
  }, [payments]);

  // Auto-update du Type paiement basé sur le reste à payer
  useEffect(() => {
    const newPayments: PaymentData[] = payments.map((payment, index) => {
      const resteAPayer = getResteAPayer(index);
      const newType: 'Total' | 'Partiel' = resteAPayer > 0 ? 'Partiel' : 'Total';
      if (payment.typePaiement !== newType) {
        return { ...payment, typePaiement: newType };
      }
      return payment;
    });
    
    // Ne mettre à jour que s'il y a des changements
    if (JSON.stringify(newPayments) !== JSON.stringify(payments)) {
      setPayments(newPayments);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments]);

  // Mettre à jour un ou plusieurs champs d'un paiement en une seule opération
  const updatePayment = (index: number, updates: Partial<PaymentData>) => {
    const newPayments = [...payments];
    newPayments[index] = { ...newPayments[index], ...updates };
    setPayments(newPayments);
  };

  const getMontantFacture = (index: number) => {
    // Pour le 1er paiement, c'est le montant total de la facture
    if (index === 0) return invoice.amount || 0;
    
    // Pour les autres paiements, c'est le montant restant après tous les paiements précédents
    let remaining = invoice.amount || 0;
    for (let i = 0; i < index; i++) {
      remaining -= (payments[i]?.montantPaye || 0);
    }
    // Arrondir à 2 décimales
    return Math.round(Math.max(0, remaining) * 100) / 100;
  };

  const getResteAPayer = (index: number) => {
    const payment = payments[index];
    const montantFacture = getMontantFacture(index);
    // Arrondir à 2 décimales pour éviter les erreurs JavaScript (ex: 0.0000000000000142)
    return Math.round(Math.max(0, montantFacture - (payment?.montantPaye || 0)) * 100) / 100;
  };

  const getRemainingTotal = () => {
    // Arrondir à 2 décimales
    return Math.round(Math.max(0, (invoice.amount || 0) - totalPaid) * 100) / 100;
  };

  const getCurrentPayment = () => {
    return payments[activeTab - 1];
  };

  const isFieldDisabled = (tabIndex: number) => {
    return readOnly || savedTabs.includes(tabIndex);
  };

  const handleFullscreen = () => {
    if (!iframeRef.current) return;
    if (iframeRef.current.requestFullscreen) {
      iframeRef.current.requestFullscreen();
    }
  };

  const handleSubmit = async () => {
    // Validation de l'onglet actuel
    const currentPayment = payments[activeTab - 1];
    
    console.log('Validation du paiement:', {
      index: activeTab - 1,
      currentPayment,
      montantPaye: currentPayment?.montantPaye,
      modePaiement: currentPayment?.modePaiement
    });

    // Validations communes
    if (!currentPayment?.datePaiement) {
      showAlertError('Veuillez remplir la date de paiement');
      return;
    }

    // Montant payé doit être >= 0
    if (currentPayment?.montantPaye === undefined || currentPayment?.montantPaye === null) {
      showAlertError('Veuillez entrer un montant payé');
      return;
    }

    if (!currentPayment?.modePaiement) {
      showAlertError('Veuillez sélectionner un mode de paiement');
      return;
    }

    // Validations spécifiques au mode de paiement
    if (currentPayment.modePaiement === 'caisse') {
      // Pour caisse, entité et référence sont obligatoires
      if (!currentPayment?.entite) {
        showAlertError('Veuillez sélectionner une entité (caisse)');
        return;
      }
      if (!currentPayment?.referencePaiement) {
        showAlertError('La référence est obligatoire pour un paiement en caisse');
        return;
      }
    } else if (['banque', 'cheque', 'op'].includes(currentPayment.modePaiement)) {
      // Pour banque/chèque/OP: vérifier les champs visibles seulement
      // Les champs cachés ne doivent PAS bloquer l'enregistrement
      if (!currentPayment?.BanqueSGL) {
        showAlertError('Veuillez sélectionner la banque SGL');
        return;
      }
      if (!currentPayment?.compteSGL) {
        showAlertError('Veuillez sélectionner le compte SGL');
        return;
      }
      if (!currentPayment?.BanqueFournisseur) {
        showAlertError('Veuillez sélectionner la banque fournisseur');
        return;
      }
      if (!currentPayment?.compteFournisseur) {
        showAlertError('Veuillez sélectionner le compte fournisseur');
        return;
      }
      if (!currentPayment?.referencePaiement) {
        const refLabel = currentPayment.modePaiement === 'op' 
          ? 'la référence de l\'OP'
          : currentPayment.modePaiement === 'cheque'
          ? 'la référence du Chèque'
          : 'la référence de la transaction';
        showAlertError(`Veuillez saisir ${refLabel}`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const index = activeTab - 1;
      const montantFacture = getMontantFacture(index);
      const resteAPayer = getResteAPayer(index);
      
      console.log('Enregistrement du paiement:', {
        index,
        montantFacture,
        resteAPayer,
        modePaiement: currentPayment.modePaiement
      });

      // Enregistrer SEULEMENT l'onglet actuel
      const { error } = await supabase
        .from('PAIEMENTS')
        .insert({
          id: `${invoice.invoiceNumber}-${index + 1}-${Date.now()}`,
          NumeroFacture: invoice.invoiceNumber,
          datePaiement: currentPayment.datePaiement,
          referencePaiement: currentPayment.referencePaiement,
          modePaiement: currentPayment.modePaiement,
          typePaiement: currentPayment.typePaiement,
          montantFacture: montantFacture,
          montantAutorise: Math.round((currentPayment.montantAutoriseé || 0) * 100) / 100,
          montantPaye: Math.round((currentPayment.montantPaye || 0) * 100) / 100,
          resteAPayer: resteAPayer,
          devise: currentPayment.devise,
          compteSGL: currentPayment.compteSGL || '',
          compteFournisseur: currentPayment.compteFournisseur || '',
          BanqueFournisseur: currentPayment.BanqueFournisseur || '',
          BanqueSGL: currentPayment.BanqueSGL || '',
          commentaires: currentPayment.commentaires || '',
          paiedby: agent?.email || null,
          timestamp: new Date().toISOString()
        });

      if (error) {
        console.error('Erreur Supabase:', error);
        showAlertError('Erreur lors de l\'enregistrement: ' + error.message);
        setIsSubmitting(false);
        return;
      }

      console.log('Paiement enregistré avec succès!');
      success('Paiement enregistré avec succès!');
      showAlertSuccess('Paiement enregistré avec succès!');
      
      // Mettre à jour le statut de paiement dans l'ordre de paiement si applicable
      if (ordoPaiementId) {
        try {
          await ordoPaiementService.updateInvoicePaidStatus(
            ordoPaiementId,
            invoice.invoiceNumber,
            Math.round((currentPayment.montantPaye || 0) * 100) / 100
          );
          console.log('Statut de paiement mis à jour dans l\'ordre de paiement');
        } catch (err) {
          console.error('Erreur lors de la mise à jour du statut de paiement:', err);
          // Ne pas bloquer le reste du processus si cette mise à jour échoue
        }
      }
      
      // Marquer cet onglet comme enregistré
      setSavedTabs([...savedTabs, index]);
      
      // Vérifier s'il y a encore du reste à payer
      if (resteAPayer > 0) {
        // Créer un nouvel onglet UNIQUEMENT après l'enregistrement réussi
        const newPayment: PaymentData = {
          datePaiement: new Date().toISOString().split('T')[0],
          typePaiement: 'Partiel',
          modePaiement: '',
          entite: '',
          referencePaiement: '',
          devise: currentPayment.devise,
          montantAutoriseé: resteAPayer,
          montantPaye: 0,
          compteSGL: '',
          compteFournisseur: '',
          BanqueFournisseur: '',
          BanqueSGL: '',
          commentaires: ''
        };
        const newPayments = [...payments, newPayment];
        setPayments(newPayments);
        setTimeout(() => setActiveTab(index + 2), 0);
      } else {
        // Tous les paiements sont faits, fermer la modale
        setTimeout(() => {
          refreshAllData(); // Rafraîchir les données avant de fermer
          onSuccess?.();
          handleClose();
        }, 500);
      }
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du paiement:', error);
      showAlertError('Erreur lors de l\'enregistrement du paiement: ' + (error instanceof Error ? error.message : 'Erreur inconnue'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[98vw] max-w-[1700px] h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between bg-gray-50 border-b px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3 flex-1">
            <FileText className="text-blue-600" size={24} />
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                Paiement Facture {invoice.invoiceNumber}
                {readOnly && <span className="text-sm font-normal text-gray-600 ml-2">(Lecture seule)</span>}
              </h2>
              <div className="flex gap-6 text-sm text-gray-600">
                <span>
                  Montant total: <span className="font-bold text-gray-900">${(invoice.amount || 0).toFixed(2)}</span>
                </span>
                <span>
                  Montant payé: <span className="font-bold text-green-700">${totalPaid.toFixed(2)}</span>
                </span>
                <span>
                  Reste à payer: <span className="font-bold text-orange-700">${getRemainingTotal().toFixed(2)}</span>
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content - 2 colonnes */}
        <div className="flex-1 overflow-hidden p-6 flex gap-6">
          {/* Colonne gauche - 30% : Informations de la facture */}
          <div className="flex-1 lg:flex-[0.3] overflow-hidden max-h-[calc(90vh-8rem)] bg-gray-50 rounded-lg flex flex-col">
            <div className="flex bg-gray-200">
              <button
                onClick={() => setActiveLeftTab('visualization')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeLeftTab === 'visualization' ? 'text-black bg-white' : 'text-gray-600 bg-gray-200'
                }`}
              >
                Visualisation de la facture
              </button>
              <button
                onClick={() => setActiveLeftTab('details')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeLeftTab === 'details' ? 'text-black bg-white' : 'text-gray-600 bg-gray-200'
                }`}
              >
                Détails de la facture
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
            {activeLeftTab === 'visualization' ? (
              (invoiceDetails?.['Facture attachée'] || invoice.attachedInvoiceUrl) ? (
                <div className="border border-gray-300 rounded-lg overflow-hidden bg-white relative group h-full min-h-[300px]">
                  <iframe
                    ref={iframeRef}
                    src={invoiceDetails?.['Facture attachée'] || invoice.attachedInvoiceUrl}
                    title="Invoice PDF"
                    className="w-full h-full border-0"
                    allowFullScreen
                  />
                  <button
                    onClick={handleFullscreen}
                    className="absolute top-3 right-3 bg-white/90 hover:bg-white p-2 rounded-lg shadow-lg transition-all opacity-0 group-hover:opacity-100"
                    title="Plein écran"
                  >
                    <Maximize2 size={16} className="text-gray-700" />
                  </button>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500 text-xs">
                  Aucune facture attachée à visualiser.
                </div>
              )
            ) : invoiceDetails ? (
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-200">
                  <tr className="bg-gray-100">
                    <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                      Informations generales
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium w-1/2">Numero de facture:</td>
                    <td className="py-2 font-semibold text-gray-900 w-1/2">{invoiceDetails['Numéro de facture'] || invoice.invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Date d'emission:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Date emission'] || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Date de reception:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Date de réception'] || invoice.receptionDate}</td>
                  </tr>

                  <tr className="bg-gray-100">
                    <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                      Fournisseur
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Fournisseur:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Fournisseur'] || invoice.supplier}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Categorie fournisseur:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Catégorie fournisseur'] || '-'}</td>
                  </tr>

                  <tr className="bg-gray-100">
                    <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                      Localisation et responsables
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Region:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Région'] || invoice.region || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Centre de cout:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Centre de coût'] || invoice.costCenter || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Gestionnaire:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Gestionnaire'] || '-'}</td>
                  </tr>

                  <tr className="bg-gray-100">
                    <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                      Details de la facture
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Type de facture:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Type de facture'] || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Categorie de charge:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Catégorie de charge'] || invoice.chargeCategory || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Numero de dossier:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Numéro de dossier'] || invoice.fileNumber || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Motif / Description:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Motif / Description'] || '-'}</td>
                  </tr>

                  <tr className="bg-gray-100">
                    <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                      Montants et devise
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Devise:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Devise'] || invoice.currency || 'USD'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Taux facture:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Taux facture'] || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Montant:</td>
                    <td className="py-2 font-bold text-green-700">
                      ${(invoiceDetails['Montant'] || invoice.amount || 0).toFixed(2)} {invoiceDetails['Devise'] || invoice.currency}
                    </td>
                  </tr>

                  <tr className="bg-gray-100">
                    <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                      Delais et urgence
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Priorite de paiement:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Niveau urgence'] || invoice.urgencyLevel || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Date d'echeance:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Échéance'] || invoice.dueDate || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Mode de paiement:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Mode de paiement requis'] || invoiceDetails['Mode de paiement'] || invoice.paymentMode || '-'}</td>
                  </tr>

                  <tr className="bg-gray-100">
                    <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                      Fichiers et statut
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Facture attachee:</td>
                    <td className="py-2 font-semibold text-gray-900">
                      {(invoiceDetails['Facture attachée'] || invoice.attachedInvoiceUrl) ? 'Disponible' : '-'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Statut actuel:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Statut'] || '-'}</td>
                  </tr>

                  <tr className="bg-gray-100">
                    <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                      Notes
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Commentaires:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['Commentaires'] || '-'}</td>
                  </tr>
                  <tr className="bg-gray-100">
                    <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                      Createur
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600 font-medium">Cree par:</td>
                    <td className="py-2 font-semibold text-gray-900">{invoiceDetails['created_by'] || '-'}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="text-center py-4 text-gray-500 text-xs">Chargement des détails...</div>
            )}

            <div className="mt-4 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-600">
              <p className="text-xs text-blue-700 font-semibold">Reste à payer</p>
              <p className="text-lg font-bold text-blue-900">${getRemainingTotal().toFixed(2)}</p>
            </div>
            </div>
          </div>

          {/* Colonne droite - 70% : Formulaire de paiement */}
          <div className="flex-1 lg:flex-[0.7] flex flex-col">
            {/* Onglets de paiement */}
            <div className="flex gap-2 mb-4 border-b">
              {payments.map((payment, index) => (
                <button
                  key={index}
                  onClick={() => setActiveTab(index + 1)}
                  className={`px-4 py-2 font-medium text-sm transition-colors ${
                    activeTab === index + 1
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {index === 0 && payment.typePaiement === 'Total'
                    ? 'Paiement'
                    : index === 0
                    ? '1er paiement'
                    : `${index + 1}e paiement`}
                </button>
              ))}
            </div>

            {/* Contenu de l'onglet actif */}
            {getCurrentPayment() && (
              <div className="flex-1 overflow-y-auto pr-4 space-y-4">
                {savedTabs.includes(activeTab - 1) && (
                  <div className="p-3 bg-green-50 border border-green-300 rounded-lg">
                    <p className="text-xs font-semibold text-green-700">✓ Paiement enregistré</p>
                  </div>
                )}

                {/* Section 1: Montants et Devise EN PREMIER */}
                <div className="grid grid-cols-3 gap-4">
                  {/* Montant facture */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Montant facture</label>
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-xs font-bold text-gray-900">
                      ${getMontantFacture(activeTab - 1).toFixed(2)}
                    </div>
                  </div>
                  
                  {/* Montant autorisé (= Montant facture) */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Montant autorisé</label>
                    <input
                      type="number"
                      value={getCurrentPayment()?.montantAutoriseé ?? getMontantFacture(activeTab - 1)}
                      onChange={(e) => updatePayment(activeTab - 1, { montantAutoriseé: parseFloat(e.target.value) || 0 })}
                      disabled={isFieldDisabled(activeTab - 1)}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>

                  {/* Montant payé */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Montant payé *</label>
                    <input
                      type="number"
                      value={getCurrentPayment()?.montantPaye ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        updatePayment(activeTab - 1, { montantPaye: value === '' ? null : parseFloat(value) || 0 });
                      }}
                      disabled={isFieldDisabled(activeTab - 1)}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>

                  {/* Reste à payer */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Reste à payer</label>
                    <div className={`w-full px-3 py-2 border rounded-lg text-xs font-bold ${
                      getResteAPayer(activeTab - 1) > 0
                        ? 'bg-yellow-50 text-yellow-900 border-yellow-300'
                        : 'bg-green-50 text-green-900 border-green-300'
                    }`}>
                      ${getResteAPayer(activeTab - 1).toFixed(2)}
                    </div>
                  </div>

                  {/* Devise */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Devise</label>
                    <select
                      value={getCurrentPayment()?.devise || 'USD'}
                      onChange={(e) => updatePayment(activeTab - 1, { devise: e.target.value as 'USD' | 'CDF' | 'EUR' })}
                      disabled={isFieldDisabled(activeTab - 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="USD">USD</option>
                      <option value="CDF">CDF</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>

                  {/* Type paiement - AUTO [change automatiquement] */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type paiement</label>
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-xs font-bold text-gray-900">
                      {getResteAPayer(activeTab - 1) > 0 ? 'Partiel' : 'Total'}
                    </div>
                  </div>
                </div>

                {/* Séparateur semi-transparent */}
                <div className="border-t border-gray-300 opacity-30 my-4"></div>

                {/* Section 2-3: Date paiement et Mode paiement sur la même ligne */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date paiement *</label>
                    <input
                      type="date"
                      value={getCurrentPayment()?.datePaiement || ''}
                      onChange={(e) => updatePayment(activeTab - 1, { datePaiement: e.target.value })}
                      disabled={isFieldDisabled(activeTab - 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>

                  {/* Mode paiement (affiche seulement si date remplie) */}
                  {getCurrentPayment()?.datePaiement && (
                    <div className="transition-all duration-300 ease-in-out opacity-100">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Mode paiement *</label>
                    <select
                      value={getCurrentPayment()?.modePaiement || ''}
                      onChange={(e) => updatePayment(activeTab - 1, {
                        modePaiement: e.target.value as 'caisse' | 'banque' | 'cheque' | 'op' | '',
                        entite: '',
                        referencePaiement: '',
                        compteSGL: '',
                        BanqueSGL: '',
                        BanqueFournisseur: '',
                        compteFournisseur: '',
                        commentaires: ''
                      })}
                      disabled={isFieldDisabled(activeTab - 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">--- Sélectionner ---</option>
                      <option value="caisse">Caisse</option>
                      <option value="banque">Banque</option>
                      <option value="cheque">Chèque</option>
                      <option value="op">OP</option>
                    </select>
                  </div>
                )}
                </div>

                {/* Séparateur semi-transparent */}
                <div className="border-t border-gray-300 opacity-30 my-4"></div>

                {/* ========== CAISSE PATH ========== */}
                {getCurrentPayment()?.modePaiement === 'caisse' && (
                  <div className="space-y-4 transition-all duration-500 ease-in-out opacity-100">
                    {/* Section 1: Bureau de paiement (Caisse) */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Veuillez sélectionner le caisse de paiement *
                      </label>
                      <select
                        value={getCurrentPayment()?.entite || ''}
                        onChange={(e) => updatePayment(activeTab - 1, { 
                          entite: e.target.value,
                          referencePaiement: '',
                          commentaires: ''
                        })}
                        disabled={isFieldDisabled(activeTab - 1)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">Sélectionner...</option>
                        {caisses.map((caisse) => (
                          <option key={caisse.ID} value={caisse.Designation || ''}>
                            {caisse.Designation}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Section 2: Référence (Caisse) */}
                    {getCurrentPayment()?.entite && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {getReferenceLabel('caisse')}
                        </label>
                        <input
                          type="text"
                          value={getCurrentPayment()?.referencePaiement || ''}
                          onChange={(e) => updatePayment(activeTab - 1, { referencePaiement: e.target.value })}
                          disabled={isFieldDisabled(activeTab - 1)}
                          placeholder="Entrer la référence..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>
                    )}

                    {/* Section 3: Commentaires (Caisse) */}
                    {getCurrentPayment()?.referencePaiement && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Commentaires</label>
                        <textarea
                          value={getCurrentPayment()?.commentaires || ''}
                          onChange={(e) => updatePayment(activeTab - 1, { commentaires: e.target.value })}
                          disabled={isFieldDisabled(activeTab - 1)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs resize-none disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* ========== BANQUE / OP / CHEQUE PATH ========== */}
                {(getCurrentPayment()?.modePaiement === 'banque' || 
                  getCurrentPayment()?.modePaiement === 'op' || 
                  getCurrentPayment()?.modePaiement === 'cheque') && (
                  <div className="space-y-4 transition-all duration-500 ease-in-out opacity-100">
                    {/* Section 1-2: Banque SGL et Compte SGL sur la même ligne */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Veuillez sélectionner la Banque SGL *
                        </label>
                        <select
                          value={getCurrentPayment()?.BanqueSGL || ''}
                          onChange={(e) => updatePayment(activeTab - 1, { BanqueSGL: e.target.value, compteSGL: '', BanqueFournisseur: '' })}
                          disabled={isFieldDisabled(activeTab - 1)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="">Sélectionner une banque...</option>
                          {banques.map((banque) => (
                            <option key={banque} value={banque}>
                              {banque}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Compte SGL (si Banque SGL sélectionnée) */}
                      {getCurrentPayment()?.BanqueSGL && (
                        <CompteSGLSelect
                          value={getCurrentPayment()?.compteSGL || ''}
                          onChange={(compte) => updatePayment(activeTab - 1, { compteSGL: compte, BanqueFournisseur: '' })}
                          banque={getCurrentPayment()?.BanqueSGL || ''}
                          disabled={isFieldDisabled(activeTab - 1)}
                          refreshTrigger={compteRefreshTrigger}
                          onAddAccount={() => {
                            setCompteInitialData({
                              Fournisseur: invoice.supplier || '',
                              Banque: getCurrentPayment()?.BanqueSGL || '',
                              devise: getCurrentPayment()?.devise || invoice.currency || 'USD',
                              SGL: true
                            });
                            setShowCompteModal(true);
                          }}
                        />
                      )}
                    </div>

                    {/* Section 3-4: Banque Fournisseur et Compte Fournisseur sur la même ligne */}
                    {getCurrentPayment()?.compteSGL && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Veuillez sélectionner la Banque Fournisseur *
                          </label>
                          <select
                            value={getCurrentPayment()?.BanqueFournisseur || ''}
                            onChange={(e) => updatePayment(activeTab - 1, { BanqueFournisseur: e.target.value, compteFournisseur: '' })}
                            disabled={isFieldDisabled(activeTab - 1)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="">Sélectionner une banque...</option>
                            {banques.map((banque) => (
                              <option key={banque} value={banque}>
                                {banque}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Compte Fournisseur (si Banque Fournisseur sélectionnée) */}
                        {getCurrentPayment()?.BanqueFournisseur && (
                          <CompteFournisseurSelect
                            value={getCurrentPayment()?.compteFournisseur || ''}
                            onChange={(compte) => updatePayment(activeTab - 1, { compteFournisseur: compte })}
                            banque={getCurrentPayment()?.BanqueFournisseur || ''}
                            fournisseur={invoice.supplier}
                            disabled={isFieldDisabled(activeTab - 1)}
                            refreshTrigger={compteRefreshTrigger}
                            onAddAccount={() => {
                              setCompteInitialData({
                                Fournisseur: invoice.supplier || '',
                                Banque: getCurrentPayment()?.BanqueFournisseur || '',
                                devise: getCurrentPayment()?.devise || invoice.currency || 'USD',
                                SGL: false
                              });
                              setShowCompteModal(true);
                            }}
                          />
                        )}
                      </div>
                    )}

                    {/* Section 5: Référence (Transaction/OP/Chèque) - si Compte Fournisseur sélectionné */}
                    {getCurrentPayment()?.compteFournisseur && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {getCurrentPayment()?.modePaiement === 'banque' && 'Veuillez saisir la référence de la transaction *'}
                          {getCurrentPayment()?.modePaiement === 'op' && 'Veuillez saisir la référence de l\'OP *'}
                          {getCurrentPayment()?.modePaiement === 'cheque' && 'Veuillez saisir la référence du Chèque *'}
                        </label>
                        <input
                          type="text"
                          value={getCurrentPayment()?.referencePaiement || ''}
                          onChange={(e) => updatePayment(activeTab - 1, { referencePaiement: e.target.value })}
                          disabled={isFieldDisabled(activeTab - 1)}
                          placeholder="Entrer la référence..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>
                    )}

                    {/* Section 6: Commentaires (si Référence remplie) */}
                    {getCurrentPayment()?.referencePaiement && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Commentaires</label>
                        <textarea
                          value={getCurrentPayment()?.commentaires || ''}
                          onChange={(e) => updatePayment(activeTab - 1, { commentaires: e.target.value })}
                          disabled={isFieldDisabled(activeTab - 1)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs resize-none disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t bg-gray-50 flex-shrink-0">
          <div />
          
          {/* Boutons à droite */}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || readOnly || savedTabs.includes(activeTab - 1)}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Enregistrement...
                </>
              ) : readOnly ? (
                'Lecture seule'
              ) : savedTabs.includes(activeTab - 1) ? (
                'Déjà enregistré'
              ) : (
                'Enregistrer le paiement'
              )}
            </button>
          </div>
        </div>
      </div>
      <CompteModal
        isOpen={showCompteModal}
        compte={null}
        initialData={compteInitialData}
        onClose={() => {
          setShowCompteModal(false);
          setCompteInitialData(null);
        }}
        onSave={() => {
          setCompteRefreshTrigger((prev) => prev + 1);
          setShowCompteModal(false);
          setCompteInitialData(null);
        }}
      />
    </div>
  );
}

export default PaiementModal;

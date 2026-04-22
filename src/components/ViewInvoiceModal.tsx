import { X, FileText, AlertTriangle, Loader2, Printer, Maximize2 } from 'lucide-react';
import { Invoice } from '../types';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';

interface ViewInvoiceModalProps {
  invoice: Invoice;
  onClose: () => void;
  onRefresh?: () => void;
}

function ViewInvoiceModal({ invoice, onClose, onRefresh }: ViewInvoiceModalProps) {
  const { success, error: showError } = useToast();
  const { isValidatorDR, isValidatorDOP, canRejectDR, canRejectDOP, canViewDR, canViewDOP } = usePermission();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionConfirmation, setShowRejectionConfirmation] = useState(false);
  const [rejectionType, setRejectionType] = useState<'dr' | 'dop' | null>(null);
  const [currentInvoice, setCurrentInvoice] = useState(invoice);
  const [rejections, setRejections] = useState<Array<{date: string, raison: string}>>([]);
  const [isRejectSubmitting, setIsRejectSubmitting] = useState(false);
  const [dbStatus, setDbStatus] = useState<string>('');
  
  // Checker les signatures existantes depuis les données de l'invoice
  const [validations, setValidations] = useState({
    dr: invoice.emissionDate || null,
    dop: null,
    dg: null
  });
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationType, setValidationType] = useState<'dr' | 'dop' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingValidations, setIsLoadingValidations] = useState(true);
  const [activeTab, setActiveTab] = useState<'visualization' | 'details'>('visualization');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Vérifier si la facture est rejetée selon le statut réel de la BDD
  const isRejected = dbStatus === 'Rejetée';

  // Vérifier si la facture est "Bon à payer" selon les nouvelles règles
  const isBonAPayer = () => {
    const amount = invoice.amount || 0;
    
    if (amount <= 2500) {
      // Pour les factures de moins de 2500$, DR seul suffit
      return validations.dr ? true : false;
    } else if (validations.dop) {
      // Si le DOP a signé, passe directement à "bon à payer" peu importe le montant
      return true;
    } else {
      // Anciennes règles pour les autres cas
      const totalValidations = (validations.dr ? 1 : 0) + (validations.dop ? 1 : 0);
      if (amount <= 10000) {
        return totalValidations >= 2;
      } else {
        return totalValidations >= 2 && validations.dg;
      }
    }
  };

  // Charger TOUS les champs de la facture depuis la base de données
  useEffect(() => {
    const loadExistingData = async () => {
      setIsLoadingValidations(true);
      try {
        const { data: invoiceData, error } = await supabase
          .from('FACTURES')
          .select('*')
          .eq('Numéro de facture', invoice.invoiceNumber)
          .single();

        if (!error && invoiceData) {
          const data = invoiceData as Record<string, any>;
          setDbStatus(data["Statut"] || '');
          setValidations({
            dr: data["validation DR"] || null,
            dop: data["validation DOP"] || null,
            dg: data["validation DG"] || null
          });
          
          // Charger les rejets (JSON)
          if (data["Rejet"]) {
            try {
              const rejetsData = typeof data["Rejet"] === 'string' ? JSON.parse(data["Rejet"]) : data["Rejet"];
              setRejections(Array.isArray(rejetsData) ? rejetsData : []);
            } catch {
              console.error('Erreur parsing rejets');
            }
          } else {
            setRejections([]);
          }
          
          // Mettre à jour currentInvoice avec tous les champs de la base de données
          setCurrentInvoice({
            ...invoice,
            id: data["ID"] || invoice.id,
            invoiceNumber: data["Numéro de facture"] || invoice.invoiceNumber,
            emissionDate: data["Date emission"],
            receptionDate: data["Date de réception"],
            supplier: data["Fournisseur"] || invoice.supplier,
            supplierCategory: data["Catégorie fournisseur"],
            region: data["Région"] || invoice.region,
            costCenter: data["Centre de coût"],
            manager: data["Gestionnaire"],
            invoiceType: data["Type de facture"],
            chargeCategory: data["Catégorie de charge"] || invoice.chargeCategory,
            fileNumber: data["Numéro de dossier"],
            motif: data["Motif / Description"],
            currency: data["Devise"] || invoice.currency,
            exchangeRate: data["Taux facture"],
            amount: data["Montant"] || invoice.amount,
            comments: data["Commentaires"],
            paymentDelay: data["Délais de paiement"],
            dueDate: data["Échéance"],
            paymentMode: data["Mode de paiement requis"],
            urgencyLevel: data["Niveau urgence"] || invoice.urgencyLevel,
            status: data["Statut"] ? (data["Statut"].toLowerCase().includes('rejet') ? 'rejected' : 'pending') : invoice.status,
            attachedInvoiceUrl: data["Facture attachée"],
            created_by: data["created_by"]
          } as any);
          
          console.log('Toutes les données chargées:', data);
        } else if (error) {
          console.error('Erreur lors du chargement:', error);
        }
      } catch (err) {
        console.error('Erreur générale:', err);
      } finally {
        setIsLoadingValidations(false);
      }
    };

    loadExistingData();
  }, [invoice.invoiceNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleValidation = async (type: 'dr' | 'dop') => {
    setValidationType(type);
    setShowValidationModal(true);
  };

  const confirmValidation = async () => {
    if (!validationType) return;
    
    setIsSubmitting(true);
    
    try {
      // Déterminer le statut selon les nouvelles règles
      let newStatus = '';
      const amount = invoice.amount || 0;
      
      if (validationType === 'dr') {
        // Pour les factures de moins de 2500$, DR seul suffit pour passer à "Validée"
        if (amount <= 2500) {
          newStatus = 'Validée';
        } else {
          newStatus = 'En attente validation DOP';
        }
      } else if (validationType === 'dop') {
        // Si le DOP signe, passe directement à "Validée"
        newStatus = 'Validée';
      }
      
      const updateData: Record<string, any> = {
        "Statut": newStatus
      };

      // Ajouter la date de validation dans les colonnes existantes - format correct
      const currentDate = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
      
      if (validationType === 'dr') {
        updateData["validation DR"] = currentDate;
        updateData["Date emission"] = currentDate;
      } else if (validationType === 'dop') {
        updateData["validation DOP"] = currentDate;
      }

      const { error } = await supabase
        .from('FACTURES')
        .update(updateData)
        .eq('Numéro de facture', currentInvoice.invoiceNumber);

      if (error) {
        showError('Erreur lors de la validation: ' + error.message);
        return;
      }

      // Mettre à jour l'état des validations
      setValidations(prev => ({
        ...prev,
        [validationType]: currentDate
      }));

      // Recharger l'invoice depuis la base de données
      const { data: updatedInvoice, error: fetchError } = await supabase
        .from('FACTURES')
        .select('*')
        .eq('Numéro de facture', currentInvoice.invoiceNumber)
        .single();

      if (!fetchError && updatedInvoice) {
        // Mettre à jour l'invoice courant avec les nouvelles données
        setCurrentInvoice({
          ...currentInvoice,
          emissionDate: (updatedInvoice as Record<string, any>)["Date emission"],
          // Ajouter d'autres champs si nécessaire
        });
      }

      success(`Validation ${validationType.toUpperCase()} enregistrée avec succès!`);
      setShowValidationModal(false);
      setValidationType(null);
    } catch {
      showError('Erreur lors de la validation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Rafraîchir le tableau des données à la fermeture
    if (onRefresh) {
      onRefresh();
    }
    // Émettre l'événement de fermeture de modal pour le rechargement automatique
    window.dispatchEvent(new Event('modalClosed'));
    onClose();
  };

  const handleRejectClick = (type: 'dr' | 'dop') => {
    setRejectionType(type);
    setRejectionReason('');
    setShowRejectionConfirmation(true);
  };

  const handleFullscreen = () => {
    if (!iframeRef.current) return;
    
    if (iframeRef.current.requestFullscreen) {
      iframeRef.current.requestFullscreen();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } else if ((iframeRef.current as any).webkitRequestFullscreen) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (iframeRef.current as any).webkitRequestFullscreen();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } else if ((iframeRef.current as any).mozRequestFullScreen) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (iframeRef.current as any).mozRequestFullScreen();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } else if ((iframeRef.current as any).msRequestFullscreen) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (iframeRef.current as any).msRequestFullscreen();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const confirmReject = async () => {
    setIsRejectSubmitting(true);
    
    try {
      // Créer le nouvel enregistrement de rejet
      const newRejection = {
        date: new Date().toLocaleDateString('fr-FR'),
        raison: rejectionReason,
        type: rejectionType
      };

      // Ajouter au tableau existant
      const updatedRejections = [...rejections, newRejection];

      const { error } = await supabase
        .from('FACTURES')
        .update({
          "Statut": 'Rejetée',
          "Rejet": JSON.stringify(updatedRejections)
        })
        .eq('ID', invoice.id);

      if (error) {
        showError('Erreur lors du rejet: ' + error.message);
        return;
      }

      success('Facture rejetée avec succès!');
      setRejections(updatedRejections);
      setShowRejectionConfirmation(false);
      setRejectionReason('');
      setRejectionType(null);
      
      // Mettre à jour le statut local
      setCurrentInvoice(prev => ({
        ...prev,
        status: 'rejected'
      }));
      
    } catch {
      showError('Erreur lors du rejet');
    } finally {
      setIsRejectSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[95vw] max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-gray-50 border-b px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <FileText className="text-blue-600" size={24} />
            <div>
              <h2 className="text-xl font-bold text-gray-800">Facture {invoice.invoiceNumber}</h2>
              <p className="text-sm text-gray-600">
                {currentInvoice.region && `Région: ${currentInvoice.region} • `}
                Montant: ${(currentInvoice.amount || 0).toFixed(2)} {currentInvoice.currency || 'USD'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="text-gray-500 hover:text-blue-600 transition-colors"
              title="Imprimer"
            >
              <Printer size={24} />
            </button>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-0">
          <div className="flex flex-col lg:flex-row gap-1 h-full">
            {/* Colonne gauche - 70% : Données de la facture */}
            <div className="flex-1 lg:flex-[0.7] flex flex-col h-full">
              {/* Onglets */}
              <div className="flex bg-gray-200">
                <button
                  onClick={() => setActiveTab('visualization')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'visualization'
                      ? 'text-black-600 bg-white'
                      : 'text-gray-600 bg-gray-200'
                  }`}
                >
                  Visualisation de la facture
                </button>
                <button
                  onClick={() => setActiveTab('details')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'details'
                      ? 'text-black-600 bg-white'
                      : 'text-gray-600 bg-gray-200'
                  }`}
                >
                  Détails de la facture
                </button>
              </div>

              {/* Contenu des onglets */}
              <div className=" bg-white flex-1 overflow-y-auto">
                {activeTab === 'visualization' && currentInvoice.attachedInvoiceUrl && (
                  <div className="p-4 h-full">
                    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white relative group h-full">
                      <iframe
                        ref={iframeRef}
                        src={currentInvoice.attachedInvoiceUrl}
                        title="Invoice PDF"
                        className="w-full h-full border-0"
                        allowFullScreen
                      />
                      <button
                        onClick={handleFullscreen}
                        className="absolute top-3 right-3 bg-white/90 hover:bg-white p-2 rounded-lg shadow-lg transition-all opacity-0 group-hover:opacity-100"
                        title="Plein écran"
                      >
                        <Maximize2 size={18} className="text-gray-700" />
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'details' && (
                  <div className="p-4">
                    {/* Tableau groupé par catégories des informations de la facture */}
                    <table className="w-full">
                      <tbody className="divide-y divide-gray-200">
                        {/* INFORMATIONS GÉNÉRALES */}
                        <tr className="bg-gray-100">
                          <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                            📋 Informations générales
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium w-1/2">Numéro de facture:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900 w-1/2">{currentInvoice.invoiceNumber}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Date d'émission:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.emissionDate || '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Date de réception:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.receptionDate}</td>
                        </tr>

                        {/* FOURNISSEUR */}
                        <tr className="bg-gray-100">
                          <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                            🏢 Fournisseur
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Fournisseur:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.supplier}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Catégorie fournisseur:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.supplierCategory || '-'}</td>
                        </tr>

                        {/* LOCALISATION */}
                        <tr className="bg-gray-100">
                          <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                            📍 Localisation & Responsables
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Région:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.region}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Centre de coût:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.costCenter || '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Gestionnaire:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.manager || '-'}</td>
                        </tr>

                        {/* DÉTAILS FACTURE */}
                        <tr className="bg-gray-100">
                          <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                            📄 Détails de la facture
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Type de facture:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.invoiceType || '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Catégorie de charge:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.chargeCategory}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Numéro de dossier:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.fileNumber || '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Motif / Description:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.motif || '-'}</td>
                        </tr>

                        {/* MONTANTS */}
                        <tr className="bg-gray-100">
                          <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                            💰 Montants & Devise
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Devise:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.currency || 'USD'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Taux facture:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.exchangeRate || '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Montant:</td>
                          <td className="py-2 text-xs font-bold text-green-600">
                            ${(currentInvoice.amount || 0).toFixed(2)} {currentInvoice.currency !== 'USD' ? `(${currentInvoice.currency})` : ''}
                          </td>
                        </tr>

                        {/* DÉLAIS & URGENCE */}
                        <tr className="bg-gray-100">
                          <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                            ⏰ Délais & Urgence
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Priorité de paiement :</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.urgencyLevel || '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Date d'échéance:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.dueDate || '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Mode de paiement:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.paymentMode || '-'}</td>
                        </tr>

                        {/* FICHIERS & STATUT */}
                        <tr className="bg-gray-100">
                          <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                            📎 Fichiers & Statut
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Facture attachée:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">
                            {currentInvoice.attachedInvoiceUrl ? (
                              <a href={currentInvoice.attachedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                Visualiser
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Statut actuel:</td>
                          <td className="py-2 text-xs font-semibold">
                            <span className="flex items-center gap-2">
                              {dbStatus === 'Rejetée' ? (
                                <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-[11px] font-semibold">
                                  Rejetée
                                </span>
                              ) : dbStatus === 'Validée' || isBonAPayer() ? (
                                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-[11px] font-semibold">
                                  Bon à payer
                                </span>
                              ) : dbStatus?.includes('En attente validation DR') ? (
                                <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-[11px] font-semibold">
                                  En attente DR
                                </span>
                              ) : dbStatus?.includes('En attente validation DOP') ? (
                                <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-[11px] font-semibold">
                                  En attente DOP
                                </span>
                              ) : (
                                <span className="bg-gray-200 text-gray-800 px-3 py-1 rounded-full text-[11px] font-semibold">
                                  {dbStatus || 'Non défini'}
                                </span>
                              )}
                            </span>
                          </td>
                        </tr>

                        {/* COMMENTAIRES */}
                        <tr className="bg-gray-50">
                          <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                            &#128172; Notes
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Commentaires:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.comments || '-'}</td>
                        </tr>

                        {/* CRÉATEUR */}
                        <tr className="bg-gray-50">
                          <td colSpan={2} className="py-2 px-2 text-xs font-bold text-gray-700 bg-gray-200">
                            &#128100; Créateur
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Créé par:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.created_by || '-'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Colonne droite - 30% : Validations et rejet */}
            <div className="flex-1 lg:flex-[0.3] mt-0">
              {/* Bloc de validation DR, DOP, DG */}
              <div className="bg-gray-0 rounded-lg p-3 mb-3 ">
                <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-blue-600" />
                  Validation
                </h3>
                
                {/* Tableau des validations */}
                {isLoadingValidations ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="animate-spin text-blue-600" size={20} />
                    <span className="ml-2 text-xs text-gray-600">Chargement des validations...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Section DR */}
                    {canViewDR() && (
                      <div className="border-l-4 border-blue-500 pl-3 pr-3 py-2 bg-blue-50 rounded">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-blue-900">En attente validation DR</span>
                          {validations.dr && (
                            <span className="text-xs text-green-600 font-semibold">
                              ✓ Validé le {new Date(validations.dr).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                        {!validations.dr && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleValidation('dr')}
                              disabled={isSubmitting || isRejected || !isValidatorDR()}
                              className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                                isValidatorDR() && !isRejected
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }`}
                              title={!isValidatorDR() ? "Vous n'avez pas la permission de valider" : "Valider"}
                            >
                              {isSubmitting && validationType === 'dr' ? (
                                <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                              ) : (
                                'Valider'
                              )}
                            </button>
                            <button
                              onClick={() => handleRejectClick('dr')}
                              disabled={isSubmitting || isRejected || !canRejectDR()}
                              className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                                canRejectDR() && !isRejected
                                  ? 'bg-red-600 text-white hover:bg-red-700'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }`}
                              title={!canRejectDR() ? "Vous n'avez pas la permission de rejeter" : "Rejeter"}
                            >
                              Rejeter
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Section DOP */}
                    {canViewDOP() && (
                      <div className="border-l-4 border-amber-500 pl-3 pr-3 py-2 bg-amber-50 rounded">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-amber-900">En attente validation DOP</span>
                          {validations.dop && (
                            <span className="text-xs text-green-600 font-semibold">
                              ✓ Validé le {new Date(validations.dop).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                        {!validations.dop && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleValidation('dop')}
                              disabled={isSubmitting || isRejected || !isValidatorDOP()}
                              className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                                isValidatorDOP() && !isRejected
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }`}
                              title={
                                !isValidatorDOP()
                                  ? "Vous n'avez pas la permission de valider"
                                  : "Valider"
                              }
                            >
                              {isSubmitting && validationType === 'dop' ? (
                                <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                              ) : (
                                'Valider'
                              )}
                            </button>
                            <button
                              onClick={() => handleRejectClick('dop')}
                              disabled={isSubmitting || isRejected || !canRejectDOP()}
                              className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                                canRejectDOP() && !isRejected
                                  ? 'bg-red-600 text-white hover:bg-red-700'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }`}
                              title={
                                !canRejectDOP()
                                  ? "Vous n'avez pas la permission de rejeter"
                                  : "Rejeter"
                              }
                            >
                              Rejeter
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}

              {/* Historique des rejets si la facture a été rejetée */}
              {rejections.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 border-l-4 border-red-600">
                  <h3 className="text-base font-semibold text-red-800 mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-600" />
                    Historique des rejets
                  </h3>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-red-200">
                      {rejections.map((rejection, idx) => (
                        <tr key={idx} className="hover:bg-red-100">
                          <td className="py-2">
                            <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-[10px] font-semibold inline-block">
                              {rejection.date}
                            </span>
                          </td>
                          <td className="py-2 text-red-700 px-2">{rejection.raison}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>



        {/* Modal de confirmation pour validation */}
        {showValidationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Confirmation de validation
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Êtes-vous sûr de vouloir valider cette facture au niveau {validationType?.toUpperCase()} ? 
                Cette action est irréversible et mettra à jour le statut de la facture.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowValidationModal(false);
                    setValidationType(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmValidation}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Validation...
                    </>
                  ) : (
                    'Confirmer'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmation pour rejet avec formulaire */}
        {showRejectionConfirmation && rejectionType && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-red-800 mb-4 flex items-center gap-2">
                <AlertTriangle size={20} />
                Rejet au niveau {rejectionType.toUpperCase()}
              </h3>
              <div className="mb-4">
                <label className="text-xs text-red-700 font-medium mb-2 block">Raison du rejet :</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-xs"
                  rows={3}
                  placeholder="Veuillez saisir la raison du rejet..."
                  disabled={isRejectSubmitting}
                />
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Êtes-vous sûr de vouloir rejeter cette facture au niveau {rejectionType === 'dr' ? 'DR' : rejectionType === 'dop' ? 'DOP' : 'DG'} ? Cette action enregistrera le rejet et mettra à jour le statut.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowRejectionConfirmation(false);
                    setRejectionReason('');
                    setRejectionType(null);
                  }}
                  disabled={isRejectSubmitting}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmReject}
                  disabled={isRejectSubmitting || !rejectionReason.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isRejectSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Rejet en cours...
                    </>
                  ) : (
                    'Confirmer le rejet'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ViewInvoiceModal;

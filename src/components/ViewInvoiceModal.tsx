import { X, FileText, AlertTriangle, Loader2, Printer, Maximize2, Pencil, Trash2 } from 'lucide-react';
import { Invoice } from '../types';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';
import { refreshAllData } from '../hooks/useDataRefresh';
import { useAuth } from '../contexts/AuthContext';
import { PDFDocument } from 'pdf-lib';
import EditInvoiceForm from './EditInvoiceForm';
import { appendFactureDeletionAuditLog, appendFactureLogByInvoiceNumber, buildLogActor } from '../services/activityLogService';

interface ViewInvoiceModalProps {
  invoice: Invoice;
  onClose: () => void;
  onRefresh?: () => void;
}

function ViewInvoiceModal({ invoice, onClose, onRefresh }: ViewInvoiceModalProps) {
  const { success, error: showError } = useToast();
  const { agent } = useAuth();
  const { isValidatorDR, isValidatorDOP, canRejectDR, canRejectDOP, canViewDR, canViewDOP, canEdit, canDelete } = usePermission();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionConfirmation, setShowRejectionConfirmation] = useState(false);
  const [rejectionType, setRejectionType] = useState<'dr' | 'dop' | null>(null);
  const [currentInvoice, setCurrentInvoice] = useState(invoice);
  const [rejections, setRejections] = useState<Array<{ date?: string; datetime?: string; raison: string; type?: string; name?: string; email?: string }>>([]);
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
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string>('');
  const [showSignaturePlacementModal, setShowSignaturePlacementModal] = useState(false);
  const [signaturePlacement, setSignaturePlacement] = useState({ x: 62, y: 72, w: 22, h: 7 });
  const [signatureAspectRatio, setSignatureAspectRatio] = useState(3.2);
  const [activePlacementDrag, setActivePlacementDrag] = useState(false);
  const [activePlacementResize, setActivePlacementResize] = useState<null | 'se' | 'nw'>(null);
  const [placementDragOffset, setPlacementDragOffset] = useState({ x: 0, y: 0 });
  const placementAreaRef = useRef<HTMLDivElement>(null);

  const parseValidationData = (value: unknown): { date: string | null; name?: string; email?: string } | null => {
    if (!value) return null;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;

      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
          const date = typeof obj.date === 'string' ? obj.date : null;
          const name = typeof obj.name === 'string' ? obj.name : undefined;
          const email = typeof obj.email === 'string' ? obj.email : undefined;
          if (date) return { date, name, email };
        }
      } catch {
        // Compatibilité: anciennes valeurs stockées en date simple
      }

      return { date: trimmed };
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const date = typeof obj.date === 'string' ? obj.date : null;
      const name = typeof obj.name === 'string' ? obj.name : undefined;
      const email = typeof obj.email === 'string' ? obj.email : undefined;
      if (date) return { date, name, email };
    }

    return null;
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatSingleWord = (value?: string | null) => {
    const text = String(value || '').trim();
    if (!text) return '-';
    if (text.includes(' ')) return text;
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  };

  const getValidationDisplay = (value: unknown) => {
    const parsed = parseValidationData(value);
    if (!parsed?.date) return null;

    const formattedDate = formatDateTime(parsed.date);
    return {
      dateLabel: `✓ Validé le ${formattedDate}`,
      byLabel: parsed.name ? `Par ${parsed.name}` : ''
    };
  };

  // Vérifier si la facture est rejetée selon le statut réel de la BDD
  const isRejected = dbStatus === 'Rejetée';

  // Vérifier si la facture est "Bon à payer" selon les nouvelles règles
  const isBonAPayer = () => Boolean(validations.dop);

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
          setSignatureUrl(data.signature || agent?.signature || '');
          
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

  const getLatestSignatureUrl = async (): Promise<string> => {
    if (!agent?.ID) return signatureUrl || '';
    const { data, error } = await supabase
      .from('AGENTS')
      .select('signature')
      .eq('ID', agent.ID)
      .single();
    if (error) return signatureUrl || '';
    return (data?.signature as string) || signatureUrl || '';
  };

  const getImageAspectRatio = async (url: string): Promise<number> => {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (!img.height) {
          resolve(3.2);
          return;
        }
        resolve(img.width / img.height);
      };
      img.onerror = () => resolve(3.2);
      img.src = url;
    });
  };

  const handlePlacementMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placementAreaRef.current) return;
    e.preventDefault();
    const rect = placementAreaRef.current.getBoundingClientRect();
    const left = (signaturePlacement.x / 100) * rect.width;
    const top = (signaturePlacement.y / 100) * rect.height;
    setPlacementDragOffset({ x: e.clientX - rect.left - left, y: e.clientY - rect.top - top });
    setActivePlacementDrag(true);
  };

  const handlePlacementMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((!activePlacementDrag && !activePlacementResize) || !placementAreaRef.current) return;
    const rect = placementAreaRef.current.getBoundingClientRect();

    if (activePlacementDrag) {
      const maxX = 100 - signaturePlacement.w;
      const maxY = 100 - signaturePlacement.h;
      const x = ((e.clientX - rect.left - placementDragOffset.x) / rect.width) * 100;
      const y = ((e.clientY - rect.top - placementDragOffset.y) / rect.height) * 100;
      setSignaturePlacement((prev) => ({
        ...prev,
        x: Math.max(0, Math.min(maxX, x)),
        y: Math.max(0, Math.min(maxY, y))
      }));
      return;
    }

    const minW = 6;
    const maxW = 55;
    if (activePlacementResize === 'se') {
      const nextW = ((e.clientX - rect.left) / rect.width) * 100 - signaturePlacement.x;
      const clampedW = Math.max(minW, Math.min(maxW, nextW));
      const nextH = Math.max(3.5, clampedW / signatureAspectRatio);
      const maxY = 100 - nextH;
      setSignaturePlacement((prev) => ({
        ...prev,
        w: clampedW,
        h: nextH,
        y: Math.min(prev.y, maxY)
      }));
    } else if (activePlacementResize === 'nw') {
      const rightEdge = signaturePlacement.x + signaturePlacement.w;
      const nextW = rightEdge - ((e.clientX - rect.left) / rect.width) * 100;
      const clampedW = Math.max(minW, Math.min(maxW, nextW));
      const nextH = Math.max(3.5, clampedW / signatureAspectRatio);
      const nextX = rightEdge - clampedW;
      const nextY = signaturePlacement.y + (signaturePlacement.h - nextH);
      setSignaturePlacement((prev) => ({
        ...prev,
        x: Math.max(0, nextX),
        y: Math.max(0, nextY),
        w: clampedW,
        h: nextH
      }));
    }
  };

  const handlePlacementMouseUp = () => {
    setActivePlacementDrag(false);
    setActivePlacementResize(null);
  };

  const buildSignedPdf = async (): Promise<string | null> => {
    if (!currentInvoice.attachedInvoiceUrl || !signatureUrl) return null;

    const [pdfRes, signatureRes] = await Promise.all([
      fetch(currentInvoice.attachedInvoiceUrl),
      fetch(signatureUrl)
    ]);

    if (!pdfRes.ok) throw new Error('Impossible de charger le PDF de la facture.');
    if (!signatureRes.ok) throw new Error('Impossible de charger la signature enregistrée.');

    const pdfBytes = await pdfRes.arrayBuffer();
    const signatureBytes = await signatureRes.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    if (!pages.length) throw new Error('PDF vide.');

    const page = pages[0];
    const pngImage = await pdfDoc.embedPng(signatureBytes);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const boxW = (signaturePlacement.w / 100) * pageWidth;
    const boxH = (signaturePlacement.h / 100) * pageHeight;
    const boxX = (signaturePlacement.x / 100) * pageWidth;
    const boxY = pageHeight - (signaturePlacement.y / 100) * pageHeight - boxH;
    // Rendu "contain" pour reproduire exactement le comportement visuel de l'overlay
    // (object-contain): jamais de déformation, centrage dans la box de placement.
    const imageRatio = pngImage.width / Math.max(pngImage.height, 0.0001);
    const boxRatio = boxW / Math.max(boxH, 0.0001);
    let drawW = boxW;
    let drawH = boxH;
    if (imageRatio > boxRatio) {
      drawH = boxW / imageRatio;
    } else {
      drawW = boxH * imageRatio;
    }
    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxY + (boxH - drawH) / 2;

    page.drawImage(pngImage, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
      opacity: 0.7
    });

    const signedBytes = await pdfDoc.save();
    const signedBlob = new Blob([signedBytes], { type: 'application/pdf' });
    const signedPath = `invoices/signed_${Date.now()}_${currentInvoice.invoiceNumber}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('factures')
      .upload(signedPath, signedBlob, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: urlData } = supabase.storage.from('factures').getPublicUrl(signedPath);
    return urlData.publicUrl;
  };

  const runValidation = async (signedPdfUrl?: string | null) => {
    if (!validationType) return;

    // Règles: DR = 50%, DOP peut valider même sans DR (100%)
    let newStatus = '';

    if (validationType === 'dr') {
      newStatus = 'En attente validation DOP';
    } else if (validationType === 'dop') {
      newStatus = 'Validée';
    }

    const updateData: Record<string, any> = {
      "Statut": newStatus
    };

    // Enregistrer date + nom + email en JSON
    const currentDateTime = new Date().toISOString();
    const validationPayload = JSON.stringify({
      date: currentDateTime,
      name: agent?.Nom || '',
      email: agent?.email || ''
    });

    if (validationType === 'dr') {
      updateData["validation DR"] = validationPayload;
      updateData["Date emission"] = currentDateTime.split('T')[0];
    } else if (validationType === 'dop') {
      updateData["validation DOP"] = validationPayload;
    }
    if (signedPdfUrl) {
      updateData["Facture attachée"] = signedPdfUrl;
    }

    const { error } = await supabase
      .from('FACTURES')
      .update(updateData)
      .eq('Numéro de facture', currentInvoice.invoiceNumber);

    if (error) {
      throw new Error(error.message);
    }

    try {
      const actor = buildLogActor(agent);
      const validationLabel = validationType === 'dr' ? 'Validation DR' : 'Validation DOP';
      const explication = validationType === 'dr'
        ? 'Validation DR enregistrée. La facture passe en attente de validation DOP.'
        : `Validation DOP enregistrée. La facture est validée (bon à payer).${signedPdfUrl ? ' Signature appliquée au PDF.' : ''}`;
      await appendFactureLogByInvoiceNumber(currentInvoice.invoiceNumber, actor, validationLabel, explication);
    } catch (logError) {
      console.error('Erreur journalisation facture (validation):', logError);
    }

    setValidations(prev => ({
      ...prev,
      [validationType]: validationPayload
    }));

    if (signedPdfUrl) {
      setCurrentInvoice((prev) => ({
        ...prev,
        attachedInvoiceUrl: `${signedPdfUrl}?v=${Date.now()}`
      }));
    }
  };

  const confirmValidation = async () => {
    if (!validationType) return;
    
    setIsSubmitting(true);
    
    try {
      const latestSignatureUrl = await getLatestSignatureUrl();
      if (latestSignatureUrl) {
        const ratio = await getImageAspectRatio(latestSignatureUrl);
        setSignatureAspectRatio(ratio);
        setSignaturePlacement((prev) => {
          const nextW = prev.w || 22;
          const nextH = Math.max(3.5, nextW / ratio);
          const maxY = 100 - nextH;
          return {
            ...prev,
            h: nextH,
            y: Math.min(prev.y, maxY)
          };
        });
        setSignatureUrl(latestSignatureUrl);
        setShowValidationModal(false);
        setShowSignaturePlacementModal(true);
        return;
      }

      // Pas de signature configurée: validation normale
      await runValidation(null);
      success(`Validation ${validationType.toUpperCase()} enregistrée avec succès.`);
      refreshAllData();
      setShowValidationModal(false);
      setValidationType(null);
    } catch (e) {
      showError(`Erreur lors de la validation: ${e instanceof Error ? e.message : 'Erreur inconnue'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmPlacementAndValidate = async () => {
    if (!validationType) return;
    setIsSubmitting(true);
    try {
      const signedPdfUrl = await buildSignedPdf();
      await runValidation(signedPdfUrl);
      success(`Validation ${validationType.toUpperCase()} avec signature enregistrée.`);
      refreshAllData();
      setShowSignaturePlacementModal(false);
      setShowValidationModal(false);
      setValidationType(null);
    } catch (e) {
      showError(`Erreur signature/validation: ${e instanceof Error ? e.message : 'Erreur inconnue'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canEditCurrentInvoice = canEdit('factures') || canEdit('factures_ffg');
  const canDeleteCurrentInvoice = canDelete('factures') || canDelete('factures_ffg');

  const handleDeleteInvoice = async () => {
    if (!currentInvoice.id) {
      showError('Impossible de supprimer cette facture.');
      return;
    }

    const confirmed = window.confirm('Voulez-vous vraiment supprimer cette facture ?');
    if (!confirmed) return;

    try {
      try {
        const actor = buildLogActor(agent);
        await appendFactureLogByInvoiceNumber(
          currentInvoice.invoiceNumber,
          actor,
          'Suppression',
          'Facture supprimée depuis la vue détaillée.'
        );
        await appendFactureDeletionAuditLog({
          invoiceNumber: currentInvoice.invoiceNumber,
          invoiceType: currentInvoice.invoiceType || null,
          actor,
          explication: 'Facture supprimée depuis la vue détaillée.',
        });
      } catch (logError) {
        console.error('Erreur journalisation facture (suppression):', logError);
      }

      const { error } = await supabase
        .from('FACTURES')
        .delete()
        .eq('ID', currentInvoice.id);

      if (error) {
        showError(`Erreur suppression: ${error.message}`);
        return;
      }

      success('Facture supprimée avec succès.');
      refreshAllData();
      handleClose();
    } catch {
      showError('Erreur lors de la suppression.');
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

  const getPlacementViewerUrl = (url?: string | null) => {
    if (!url) return '';
    const hash = 'toolbar=0&navpanes=0&scrollbar=0&zoom=page-width';
    return url.includes('#') ? `${url}&${hash}` : `${url}#${hash}`;
  };

  const confirmReject = async () => {
    setIsRejectSubmitting(true);
    
    try {
      // Créer le nouvel enregistrement de rejet
      const newRejection = {
        datetime: new Date().toISOString(),
        raison: rejectionReason,
        type: rejectionType,
        name: agent?.Nom || '',
        email: agent?.email || ''
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

      try {
        const actor = buildLogActor(agent);
        const level = rejectionType ? rejectionType.toUpperCase() : 'N/A';
        await appendFactureLogByInvoiceNumber(
          currentInvoice.invoiceNumber,
          actor,
          'Rejet',
          `Facture rejetée au niveau ${level}. Raison: ${rejectionReason.trim()}`
        );
      } catch (logError) {
        console.error('Erreur journalisation facture (rejet):', logError);
      }

      success('Facture rejetée avec succès!');
      refreshAllData();
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
              <div className="mt-1 flex items-center gap-2">
                {dbStatus === 'Rejetée' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200">
                    Rejetée
                  </span>
                )}
                {(dbStatus === 'Validée' || isBonAPayer()) && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800 border border-green-200">
                    Bon à payer
                  </span>
                )}
              </div>
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
                        src={getPlacementViewerUrl(currentInvoice.attachedInvoiceUrl)}
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
                          <td className="py-2 text-xs font-semibold text-gray-900">{formatSingleWord(currentInvoice.invoiceType)}</td>
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
                          <td className="py-2 text-xs font-semibold text-gray-900">{formatSingleWord(currentInvoice.urgencyLevel)}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Date d'échéance:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{currentInvoice.dueDate || '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-2 text-xs text-gray-600 font-medium">Mode de paiement:</td>
                          <td className="py-2 text-xs font-semibold text-gray-900">{formatSingleWord(currentInvoice.paymentMode)}</td>
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
            <div className="flex-1 lg:flex-[0.3] mt-0 flex flex-col">
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
                          {(() => {
                            const validation = getValidationDisplay(validations.dr);
                            if (!validation) return null;
                            return (
                              <span className="text-[11px] text-green-700 font-semibold text-right leading-tight">
                                <span className="block">{validation.dateLabel}</span>
                                {validation.byLabel && <span className="block text-green-600">{validation.byLabel}</span>}
                              </span>
                            );
                          })()}
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
                          {(() => {
                            const validation = getValidationDisplay(validations.dop);
                            if (!validation) return null;
                            return (
                              <span className="text-[11px] text-green-700 font-semibold text-right leading-tight">
                                <span className="block">{validation.dateLabel}</span>
                                {validation.byLabel && <span className="block text-green-600">{validation.byLabel}</span>}
                              </span>
                            );
                          })()}
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
                <div className="bg-gradient-to-b from-red-50 to-white rounded-lg p-3 border border-red-200 mt-6">
                  <h3 className="text-base font-semibold text-red-800 mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-600" />
                    Historique des rejets
                  </h3>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {rejections.map((rejection, idx) => {
                      const rawDate = rejection.datetime || rejection.date;
                      const by = rejection.name || 'Utilisateur';
                      const level = (rejection.type || '').toUpperCase();

                      return (
                        <div key={idx} className="flex">
                          <div className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="text-[11px] font-semibold text-gray-800">
                                {by}{level ? ` • ${level}` : ''}
                              </div>
                              <div className="text-[10px] text-gray-500 whitespace-nowrap">
                                {formatDateTime(rawDate)}
                              </div>
                            </div>
                            <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words w-full">
                              {rejection.raison}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(canEditCurrentInvoice || canDeleteCurrentInvoice) && (
                <div className="mt-auto pt-3 sticky bottom-0 bg-white/95 backdrop-blur-sm">
                  <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                    <div className="flex items-center gap-2">
                      {canEditCurrentInvoice && (
                        <button
                          onClick={() => setEditModalOpen(true)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md text-white bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 transition-all"
                        >
                          <Pencil size={13} />
                          Modifier
                        </button>
                      )}
                      {canDeleteCurrentInvoice && (
                        <button
                          onClick={handleDeleteInvoice}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md text-white bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 transition-all"
                        >
                          <Trash2 size={13} />
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
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

        {showSignaturePlacementModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Positionner la signature</h3>
              <p className="text-xs text-gray-600 mb-3">
                Défilez/zoomez le document normalement. Faites glisser directement la signature pour la positionner.
              </p>
              <div
                ref={placementAreaRef}
                className="relative border border-gray-300 rounded-lg overflow-hidden h-[65vh] bg-white"
                onMouseMove={handlePlacementMouseMove}
                onMouseUp={handlePlacementMouseUp}
                onMouseLeave={handlePlacementMouseUp}
              >
                <iframe
                  src={getPlacementViewerUrl(currentInvoice.attachedInvoiceUrl)}
                  title="Prévisualisation signature"
                  className="w-full h-full border-0 pointer-events-auto"
                />
                {signatureUrl && (
                  <div
                    onMouseDown={handlePlacementMouseDown}
                    className="absolute cursor-move"
                    onWheel={(e) => {
                      e.preventDefault();
                      const delta = e.deltaY > 0 ? -1 : 1;
                      setSignaturePlacement((prev) => {
                        const nextW = Math.max(6, Math.min(55, prev.w + delta));
                        const nextH = Math.max(3.5, nextW / signatureAspectRatio);
                        const maxY = 100 - nextH;
                        const maxX = 100 - nextW;
                        return {
                          ...prev,
                          w: nextW,
                          h: nextH,
                          x: Math.min(prev.x, maxX),
                          y: Math.min(prev.y, maxY)
                        };
                      });
                    }}
                    style={{
                      left: `${signaturePlacement.x}%`,
                      top: `${signaturePlacement.y}%`,
                      width: `${signaturePlacement.w}%`,
                      height: `${signaturePlacement.h}%`
                    }}
                  >
                    <img src={signatureUrl} alt="signature overlay" className="w-full h-full object-contain opacity-70 pointer-events-none select-none" />
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActivePlacementResize('nw');
                      }}
                      className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full bg-white border border-blue-600 cursor-nwse-resize"
                    />
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActivePlacementResize('se');
                      }}
                      className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-full bg-blue-600 border border-white cursor-nwse-resize"
                    />
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">Taille</label>
                  <input
                    type="range"
                    min={8}
                    max={45}
                    value={signaturePlacement.w}
                    onChange={(e) => {
                      const nextW = Number(e.target.value);
                      setSignaturePlacement((prev) => {
                        const nextH = Math.max(3.5, nextW / signatureAspectRatio);
                        const maxY = 100 - nextH;
                        return {
                          ...prev,
                          w: nextW,
                          h: nextH,
                          y: Math.min(prev.y, maxY)
                        };
                      });
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSignaturePlacementModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
                    disabled={isSubmitting}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={confirmPlacementAndValidate}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
                    Valider avec signature
                  </button>
                </div>
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

        {editModalOpen && (
          <EditInvoiceForm
            invoice={currentInvoice}
            onSubmit={() => {
              setEditModalOpen(false);
              refreshAllData();
              window.dispatchEvent(new Event('modalClosed'));
              handleClose();
            }}
            onCancel={() => setEditModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

export default ViewInvoiceModal;

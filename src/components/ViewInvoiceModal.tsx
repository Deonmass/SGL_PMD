import { X, FileText, AlertTriangle, Loader2, Printer, Maximize2, RotateCw, RotateCcw, Download, Pencil, Trash2, MessagesSquare, Undo2 } from 'lucide-react';
import { Invoice } from '../types';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';
import { refreshAllData } from '../hooks/useDataRefresh';
import { useAuth } from '../contexts/AuthContext';
import { PDFDocument, PDFImage } from 'pdf-lib';
import EditInvoiceForm from './EditInvoiceForm';
import { appendFactureDeletionAuditLog, appendFactureLogByInvoiceNumber, buildLogActor } from '../services/activityLogService';
import { isEntryMiseAJour, isInvoiceEffectivelyRejected } from '../utils/factureRejetHistory';

interface ViewInvoiceModalProps {
  invoice: Invoice;
  onClose: () => void;
  onRefresh?: () => void;
}

/** Entrées JSON colonne Rejet : rejets (validateur) ou mises à jour (édition facture). */
type FactureExchangeEntry = {
  eventType?: string;
  datetime?: string;
  date?: string;
  raison?: string;
  /** Niveau de validation pour un rejet : dr | dop */
  type?: string;
  name?: string;
  email?: string;
};

const exchangeTimestamp = (entry: FactureExchangeEntry) =>
  new Date(entry.datetime || entry.date || 0).getTime();

const extractStatusAndComment = (raison?: string) => {
  const text = (raison || '').trim();
  if (!text) {
    return { status: '-', comment: '-' };
  }

  const normalizedLines = text
    .split('\n')
    .map((line) => line.replace(/^[\s•\-]+\s*/, '').trim())
    .filter(Boolean);

  const statusLine = normalizedLines.find((line) => /statut/i.test(line));
  const commentLine = normalizedLines.find((line) => /(commentaire|raison)/i.test(line));

  const status = statusLine
    ? statusLine.replace(/^(statut)\s*:\s*/i, '').replace(/^["“]|["”]$/g, '').trim() || '-'
    : '-';

  const comment = commentLine
    ? commentLine.replace(/^(commentaire|commentaires|raison)\s*:\s*/i, '').trim() || '-'
    : text;

  return { status, comment };
};

function ViewInvoiceModal({ invoice, onClose, onRefresh }: ViewInvoiceModalProps) {
  const { success, error: showError } = useToast();
  const { agent } = useAuth();
  const { isValidatorDR, isValidatorDOP, canRejectDR, canRejectDOP, canViewDR, canViewDOP, canEdit, canDelete } = usePermission();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionConfirmation, setShowRejectionConfirmation] = useState(false);
  const [rejectionType, setRejectionType] = useState<'dr' | 'dop' | null>(null);
  const [currentInvoice, setCurrentInvoice] = useState(invoice);
  const [rejections, setRejections] = useState<FactureExchangeEntry[]>([]);
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
  const [withdrawSaving, setWithdrawSaving] = useState<null | 'dr' | 'dop'>(null);
  const [isLoadingValidations, setIsLoadingValidations] = useState(true);
  const [activeTab, setActiveTab] = useState<'visualization' | 'details'>('visualization');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewerRotation, setViewerRotation] = useState(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string>('');
  const [showSignaturePlacementModal, setShowSignaturePlacementModal] = useState(false);
  const [signaturePlacement, setSignaturePlacement] = useState({ x: 62, y: 72, w: 22, h: 7 });
  const [signatureAspectRatio, setSignatureAspectRatio] = useState(3.2);
  const [activePlacementDrag, setActivePlacementDrag] = useState(false);
  const [activePlacementResize, setActivePlacementResize] = useState<null | 'se' | 'nw'>(null);
  const [placementDragOffset, setPlacementDragOffset] = useState({ x: 0, y: 0 });
  const placementAreaRef = useRef<HTMLDivElement>(null);
  const modalExportRef = useRef<HTMLDivElement>(null);

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

  const getValidationDetails = (value: unknown) => {
    const parsed = parseValidationData(value);
    return {
      validatedAt: parsed?.date ? formatDateTime(parsed.date) : '-',
      validatedBy: parsed?.name || '-'
    };
  };

  /** True lorsque la validation en base contient une date de signature exploitable */
  const hasValidatorSigned = (value: unknown) => {
    const parsed = parseValidationData(value);
    if (!parsed?.date) return false;
    const t = new Date(parsed.date).getTime();
    return !Number.isNaN(t);
  };

  /** Retrait réservé à l'agent dont l'email (prioritaire) ou le nom correspond à l'enregistrement de signature */
  const isCurrentAgentValidationSigner = (value: unknown) => {
    const parsed = parseValidationData(value);
    if (!parsed?.date) return false;
    const myEmail = String(agent?.email || '')
      .trim()
      .toLowerCase();
    const signedEmail = String(parsed.email || '')
      .trim()
      .toLowerCase();
    if (myEmail && signedEmail && myEmail === signedEmail) return true;
    const myName = String(agent?.Nom || '')
      .trim()
      .toLowerCase();
    const signedName = String(parsed.name || '')
      .trim()
      .toLowerCase();
    if (myName && signedName && myName === signedName) return true;
    return false;
  };

  // Vérifier si la facture est rejetée selon le statut réel de la BDD
  const isRejected = isInvoiceEffectivelyRejected(
    dbStatus,
    rejections.length ? JSON.stringify(rejections) : null
  );

  // Vérifier si la facture est "Bon à payer" selon les nouvelles règles (signature DOP enregistrée)
  const isBonAPayer = () => hasValidatorSigned(validations.dop);

  const loadExistingData = useCallback(async () => {
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

        if (data["Rejet"]) {
          try {
            const rejetsData = typeof data["Rejet"] === 'string' ? JSON.parse(data["Rejet"]) : data["Rejet"];
            setRejections(Array.isArray(rejetsData) ? rejetsData : []);
          } catch {
            console.error('Erreur parsing rejets');
            setRejections([]);
          }
        } else {
          setRejections([]);
        }

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
  }, [invoice.invoiceNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadExistingData();
  }, [loadExistingData]);

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

    const normalizeUrlForFetch = (url: string) => url.split('#')[0];
    const isPdfBytes = (buffer: ArrayBuffer) => {
      const view = new Uint8Array(buffer.slice(0, 5));
      return String.fromCharCode(...view) === '%PDF-';
    };
    const extractFacturesObjectPath = (url: string) => {
      const cleaned = normalizeUrlForFetch(url);
      const marker = '/storage/v1/object/public/factures/';
      const markerIndex = cleaned.indexOf(marker);
      if (markerIndex === -1) return null;
      const start = markerIndex + marker.length;
      const pathWithQuery = cleaned.slice(start);
      const pathOnly = pathWithQuery.split('?')[0];
      return decodeURIComponent(pathOnly);
    };

    const [pdfRes, signatureRes] = await Promise.all([
      fetch(normalizeUrlForFetch(currentInvoice.attachedInvoiceUrl)),
      fetch(normalizeUrlForFetch(signatureUrl))
    ]);

    if (!pdfRes.ok) {
      throw new Error(`Impossible de charger le PDF de la facture (HTTP ${pdfRes.status}).`);
    }
    if (!signatureRes.ok) {
      throw new Error(`Impossible de charger la signature enregistrée (HTTP ${signatureRes.status}).`);
    }

    let pdfBytes = await pdfRes.arrayBuffer();
    if (!isPdfBytes(pdfBytes)) {
      console.warn('[SignatureValidation] Réponse non-PDF via URL facture, tentative fallback Supabase Storage.', {
        invoiceUrl: currentInvoice.attachedInvoiceUrl,
        contentType: pdfRes.headers.get('content-type')
      });

      const objectPath = extractFacturesObjectPath(currentInvoice.attachedInvoiceUrl);
      if (objectPath) {
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from('factures')
          .download(objectPath);
        if (downloadError) {
          throw new Error(`PDF invalide via URL publique et échec fallback storage: ${downloadError.message}`);
        }
        pdfBytes = await fileBlob.arrayBuffer();
      }
    }

    if (!isPdfBytes(pdfBytes)) {
      throw new Error('Le fichier facture récupéré n’est pas un PDF valide. Vérifiez le lien "Facture attachée".');
    }

    const signatureBytes = await signatureRes.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    if (!pages.length) throw new Error('PDF vide.');

    const page = pages[0];
    const signatureContentType = signatureRes.headers.get('content-type')?.toLowerCase() || '';
    let signatureImage: PDFImage;
    if (signatureContentType.includes('jpeg') || signatureContentType.includes('jpg')) {
      signatureImage = await pdfDoc.embedJpg(signatureBytes);
    } else {
      try {
        signatureImage = await pdfDoc.embedPng(signatureBytes);
      } catch {
        // Fallback pour anciennes signatures JPEG sans content-type fiable.
        signatureImage = await pdfDoc.embedJpg(signatureBytes);
      }
    }
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const boxW = (signaturePlacement.w / 100) * pageWidth;
    const boxH = (signaturePlacement.h / 100) * pageHeight;
    const boxX = (signaturePlacement.x / 100) * pageWidth;
    const boxY = pageHeight - (signaturePlacement.y / 100) * pageHeight - boxH;
    // Rendu "contain" pour reproduire exactement le comportement visuel de l'overlay
    // (object-contain): jamais de déformation, centrage dans la box de placement.
    const imageRatio = signatureImage.width / Math.max(signatureImage.height, 0.0001);
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

    page.drawImage(signatureImage, {
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
    setDbStatus(newStatus);

    if (signedPdfUrl) {
      setCurrentInvoice((prev) => ({
        ...prev,
        attachedInvoiceUrl: `${signedPdfUrl}?v=${Date.now()}`
      }));
    }
  };

  /** Facture FFG : statuts avec suffixe " - FFG" comme ailleurs dans l'app */
  const isFfgScopeInvoice = () => {
    const t = String(currentInvoice.invoiceType || '').toLowerCase();
    return t.includes('frais') || t.includes('général') || t.includes('generaux') || t.includes('ffg');
  };

  const statutEnAttenteDr = () =>
    isFfgScopeInvoice() ? 'En attente validation DR - FFG' : 'En attente validation DR';
  const statutEnAttenteDop = () =>
    isFfgScopeInvoice() ? 'En attente validation DOP - FFG' : 'En attente validation DOP';

  const withdrawValidation = async (kind: 'dr' | 'dop') => {
    if (isRejected) {
      showError('Impossible de retirer une validation sur une facture rejetée.');
      return;
    }
    if (kind === 'dr') {
      if (!hasValidatorSigned(validations.dr)) return;
      if (!isCurrentAgentValidationSigner(validations.dr)) {
        showError('Seul le validateur qui a signé peut retirer cette validation DR.');
        return;
      }
      const dopAlso = hasValidatorSigned(validations.dop);
      const msg = dopAlso
        ? 'Retirer la validation DR ? La validation DOP sera également annulée et la facture repassera en « En attente validation DR ».'
        : 'Retirer la validation DR ? La facture repassera en « En attente validation DR ».';
      if (!window.confirm(msg)) return;
    } else {
      if (!hasValidatorSigned(validations.dop)) return;
      if (!isCurrentAgentValidationSigner(validations.dop)) {
        showError('Seul le validateur qui a signé peut retirer cette validation DOP.');
        return;
      }
      if (
        !window.confirm(
          'Retirer la validation DOP ? La facture repassera en attente de validation DOP (ou DR si la validation DR est absente).'
        )
      ) {
        return;
      }
    }

    setWithdrawSaving(kind);
    try {
      const updateData: Record<string, unknown> = {};
      let nextStatus = '';

      if (kind === 'dr') {
        updateData['validation DR'] = null;
        updateData['validation DOP'] = null;
        updateData['Date emission'] = null;
        nextStatus = statutEnAttenteDr();
      } else {
        updateData['validation DOP'] = null;
        nextStatus = hasValidatorSigned(validations.dr) ? statutEnAttenteDop() : statutEnAttenteDr();
      }
      updateData.Statut = nextStatus;

      const { error } = await supabase
        .from('FACTURES')
        .update(updateData)
        .eq('Numéro de facture', currentInvoice.invoiceNumber);

      if (error) throw new Error(error.message);

      try {
        const actor = buildLogActor(agent);
        const label = kind === 'dr' ? 'Retrait validation DR' : 'Retrait validation DOP';
        const expl =
          kind === 'dr'
            ? `Validations DR et DOP effacées. Nouveau statut : ${nextStatus}.`
            : `Validation DOP effacée. Nouveau statut : ${nextStatus}.`;
        await appendFactureLogByInvoiceNumber(currentInvoice.invoiceNumber, actor, label, expl);
      } catch (logError) {
        console.warn('Journalisation retrait validation:', logError);
      }

      setValidations((prev) => ({
        ...prev,
        dr: kind === 'dr' ? null : prev.dr,
        dop: kind === 'dr' || kind === 'dop' ? null : prev.dop
      }));
      setDbStatus(nextStatus);
      if (kind === 'dr') {
        setCurrentInvoice((prev) => ({ ...prev, emissionDate: undefined }));
      }

      await loadExistingData();
      refreshAllData();
      onRefresh?.();
      success(kind === 'dr' ? 'Validation DR retirée.' : 'Validation DOP retirée.');
    } catch (e) {
      showError(`Erreur : ${e instanceof Error ? e.message : 'inconnue'}`);
    } finally {
      setWithdrawSaving(null);
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
      setShowValidationModal(false);
      setValidationType(null);
    } catch (e) {
      showError(`Erreur lors de la validation: ${e instanceof Error ? e.message : 'Erreur inconnue'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmPlacementAndValidate = async () => {
    if (!validationType) {
      console.error('[SignatureValidation] validationType manquant, action annulée.');
      showError('Validation impossible: type de validation introuvable.');
      return;
    }

    if (!currentInvoice.attachedInvoiceUrl) {
      console.error('[SignatureValidation] attachedInvoiceUrl manquant.');
      showError('Validation impossible: facture PDF introuvable.');
      return;
    }

    if (!signatureUrl) {
      console.error('[SignatureValidation] signatureUrl manquant.');
      showError('Validation impossible: signature introuvable. Rechargez votre signature puis réessayez.');
      return;
    }

    console.log('[SignatureValidation] Début validation signée', {
      invoiceNumber: currentInvoice.invoiceNumber,
      validationType,
      attachedInvoiceUrl: currentInvoice.attachedInvoiceUrl,
      signatureUrl
    });

    setIsSubmitting(true);
    try {
      console.log('[SignatureValidation] Génération PDF signé...');
      const signedPdfUrl = await buildSignedPdf();
      console.log('[SignatureValidation] PDF signé généré', { signedPdfUrl });

      console.log('[SignatureValidation] Mise à jour validation...');
      await runValidation(signedPdfUrl);
      console.log('[SignatureValidation] Validation enregistrée.');

      success(`Validation ${validationType.toUpperCase()} avec signature enregistrée.`);
      setShowSignaturePlacementModal(false);
      setShowValidationModal(false);
      setValidationType(null);
    } catch (e) {
      console.error('[SignatureValidation] Echec validation signée:', e);
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

  const rotateViewerRight = () => {
    setViewerRotation((deg) => (deg + 90) % 360);
  };

  const rotateViewerLeft = () => {
    setViewerRotation((deg) => (deg - 90 + 360) % 360);
  };

  const handleDownloadInvoice = () => {
    const url = currentInvoice.attachedInvoiceUrl;
    if (!url) return;

    // Note: l'attribut `download` peut être ignoré selon le navigateur si l'URL est cross-origin.
    // On tente quand même, puis on bascule vers un `open` si nécessaire.
    const fileName = `Facture_${currentInvoice.invoiceNumber || 'download'}.pdf`;
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
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

  const handleExportModalToPdf = () => {
    if (!modalExportRef.current) {
      showError('Aucune donnée à exporter.');
      return;
    }

    const clonedContent = modalExportRef.current.cloneNode(true) as HTMLElement;
    const printWindow = window.open('', '', 'width=1400,height=900');
    if (!printWindow) {
      showError('Impossible d’ouvrir la fenêtre d’export PDF.');
      return;
    }

    const styleSheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join('\n');

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Export PDF - Facture ${currentInvoice.invoiceNumber}</title>
          ${styleSheets}
          <style>
            body { margin: 0; padding: 16px; background: #ffffff; }
            @media print {
              @page { size: A4 landscape; margin: 8mm; }
              body { margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>${clonedContent.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 400);
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
      const newRejection: FactureExchangeEntry = {
        eventType: 'rejet',
        datetime: new Date().toISOString(),
        raison: rejectionReason,
        type: rejectionType || undefined,
        name: agent?.Nom || '',
        email: agent?.email || ''
      };

      const updatedRejections = [...rejections, newRejection];

      const { error } = await supabase
        .from('FACTURES')
        .update({
          "Statut": 'Rejetée',
          "Rejet": JSON.stringify(updatedRejections)
        })
        .eq('ID', currentInvoice.id);

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
      setRejections(updatedRejections);
      setShowRejectionConfirmation(false);
      setRejectionReason('');
      setRejectionType(null);
      
      // Mettre à jour le statut local
      setDbStatus('Rejetée');
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
      <div ref={modalExportRef} className="bg-white rounded-lg shadow-xl w-[95vw] max-w-6xl h-[90vh] flex flex-col overflow-hidden">
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
              onClick={handleExportModalToPdf}
              className="text-gray-500 hover:text-red-600 transition-colors"
              title="Exporter en PDF"
            >
              <FileText size={24} />
            </button>
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
                  <div className="p-4 h-full min-h-[min(70vh,32rem)] flex flex-col">
                    <div className="border border-gray-300 rounded-lg bg-white relative group flex-1 min-h-0 flex items-center justify-center overflow-auto">
                      <div
                        className="transition-transform duration-300 ease-out shrink-0"
                        style={{
                          transform: `rotate(${viewerRotation}deg)`,
                          transformOrigin: 'center center',
                          width: viewerRotation % 180 === 0 ? '100%' : 'min(85vh, 100%)',
                          height: viewerRotation % 180 === 0 ? '100%' : 'min(85vh, 100%)',
                          minHeight: viewerRotation % 180 === 0 ? 'min(50vh,24rem)' : 'min(50vw,36rem)'
                        }}
                      >
                        <iframe
                          ref={iframeRef}
                          src={getPlacementViewerUrl(currentInvoice.attachedInvoiceUrl)}
                          title="Invoice PDF"
                          className="w-full h-full min-h-[min(50vh,24rem)] border-0 block"
                          allowFullScreen
                        />
                      </div>
                      <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={rotateViewerLeft}
                          className="bg-white/90 hover:bg-white p-2 rounded-lg shadow-lg"
                          title="Tourner à gauche (-90°)"
                        >
                          <RotateCcw size={18} className="text-gray-700" />
                        </button>
                        <button
                          type="button"
                          onClick={rotateViewerRight}
                          className="bg-white/90 hover:bg-white p-2 rounded-lg shadow-lg"
                          title="Tourner à droite (+90°)"
                        >
                          <RotateCw size={18} className="text-gray-700" />
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadInvoice}
                          className="bg-white/90 hover:bg-white p-2 rounded-lg shadow-lg"
                          title="Télécharger la facture"
                        >
                          <Download size={18} className="text-gray-700" />
                        </button>
                        <button
                          type="button"
                          onClick={handleFullscreen}
                          className="bg-white/90 hover:bg-white p-2 rounded-lg shadow-lg"
                          title="Plein écran"
                        >
                          <Maximize2 size={18} className="text-gray-700" />
                        </button>
                      </div>
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
            <div className="flex-1 lg:flex-[0.3] mt-0 flex flex-col h-full bg-slate-900 border-l border-slate-800">
              {/* Bloc de validation DR, DOP, DG */}
              <div className="flex-1 overflow-y-auto p-3">
                <h3 className="text-base font-semibold text-slate-100 mb-3">
                  Validation
                </h3>
                
                {/* Tableau des validations */}
                {isLoadingValidations ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="animate-spin text-blue-600" size={20} />
                    <span className="ml-2 text-xs text-slate-300">Chargement des validations...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Section DR */}
                    {canViewDR() && (
                      <div className="border-l-4 border-blue-500 pl-3 pr-3 py-2 bg-slate-800 rounded border border-slate-700">
                        <div className="mb-2">
                          <p className="text-xs font-bold text-blue-300">
                            {hasValidatorSigned(validations.dr)
                              ? 'Validation DR'
                              : 'En attente validation DR'}
                          </p>
                          {hasValidatorSigned(validations.dr) && (() => {
                            const d = getValidationDetails(validations.dr);
                            return (
                              <>
                                <p className="text-[11px] text-emerald-300 font-semibold">
                                  Validé le {d.validatedAt}
                                </p>
                                {d.validatedBy !== '-' && (
                                  <p className="text-[11px] text-emerald-400 font-semibold">Par {d.validatedBy}</p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        {!hasValidatorSigned(validations.dr) && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleValidation('dr')}
                              disabled={isSubmitting || isRejected || withdrawSaving !== null || !isValidatorDR()}
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
                              disabled={isSubmitting || isRejected || withdrawSaving !== null || !canRejectDR()}
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
                        {hasValidatorSigned(validations.dr) && isCurrentAgentValidationSigner(validations.dr) && (
                          <div className="mt-2 pt-2 border-t border-slate-600/40">
                            <button
                              type="button"
                              onClick={() => void withdrawValidation('dr')}
                              disabled={isRejected || isSubmitting || withdrawSaving !== null}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-sky-500/40 bg-slate-800/80 px-2 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-slate-700/90 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Retirer votre validation DR (annule aussi la DOP si elle était enregistrée)"
                            >
                              {withdrawSaving === 'dr' ? (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              ) : (
                                <Undo2 className="h-3.5 w-3.5 shrink-0" />
                              )}
                              Retirer la validation DR
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Section DOP */}
                    {canViewDOP() && (
                      <div className="border-l-4 border-amber-500 pl-3 pr-3 py-2 bg-slate-800 rounded border border-slate-700">
                        <div className="mb-2">
                          <p className="text-xs font-bold text-amber-300">
                            {hasValidatorSigned(validations.dop)
                              ? 'Validation DOP'
                              : 'En attente validation DOP'}
                          </p>
                          {hasValidatorSigned(validations.dop) && (() => {
                            const d = getValidationDetails(validations.dop);
                            return (
                              <>
                                <p className="text-[11px] text-emerald-300 font-semibold">
                                  Validé le {d.validatedAt}
                                </p>
                                {d.validatedBy !== '-' && (
                                  <p className="text-[11px] text-emerald-400 font-semibold">Par {d.validatedBy}</p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        {!hasValidatorSigned(validations.dop) && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleValidation('dop')}
                              disabled={isSubmitting || isRejected || withdrawSaving !== null || !isValidatorDOP()}
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
                              disabled={isSubmitting || isRejected || withdrawSaving !== null || !canRejectDOP()}
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
                        {hasValidatorSigned(validations.dop) && isCurrentAgentValidationSigner(validations.dop) && (
                          <div className="mt-2 pt-2 border-t border-slate-600/40">
                            <button
                              type="button"
                              onClick={() => void withdrawValidation('dop')}
                              disabled={isRejected || isSubmitting || withdrawSaving !== null}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-amber-500/45 bg-slate-800/80 px-2 py-1.5 text-[11px] font-medium text-amber-100 hover:bg-slate-700/90 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Retirer votre validation DOP"
                            >
                              {withdrawSaving === 'dop' ? (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              ) : (
                                <Undo2 className="h-3.5 w-3.5 shrink-0" />
                              )}
                              Retirer la validation DOP
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}

              {rejections.length > 0 && (
                <div className="bg-slate-800/90 rounded-lg p-3 border border-slate-600/60 mt-6">
                  <h3 className="text-base font-semibold text-slate-100 mb-2 flex items-center gap-2 shrink-0">
                    <MessagesSquare size={17} className="text-sky-400" />
                    Historique d&apos;échanges
                  </h3>
                  <div className="space-y-3">
                    {[...rejections]
                      .sort((a, b) => exchangeTimestamp(a) - exchangeTimestamp(b))
                      .map((entry, idx) => {
                        const rawDate = entry.datetime || entry.date;
                        const isUpdate = isEntryMiseAJour(entry as Record<string, unknown>);
                        const by = entry.name || 'Utilisateur';
                        const level = (entry.type || '').toUpperCase();

                        if (isUpdate) {
                          const { status, comment } = extractStatusAndComment(entry.raison);
                          return (
                            <div key={idx} className="flex w-full justify-end">
                              <div className="max-w-[min(92%,20rem)] rounded-2xl rounded-br-md bg-sky-900/50 border border-sky-700/50 px-3 py-2.5 shadow-md ml-auto text-left">
                                <div className="text-[10px] text-sky-200/90 mb-2 leading-snug break-words">
                                  <span className="font-semibold text-sky-50">{by}</span>
                                </div>
                                <div className="text-[11px] text-slate-100 leading-relaxed space-y-1.5">
                                  <p className="break-words">
                                    <span className="font-semibold text-sky-100">Statut:</span> {status}
                                  </p>
                                  <p className="break-words">
                                    <span className="font-semibold text-sky-100">Commentaire:</span>
                                  </p>
                                  <p className="whitespace-pre-wrap break-words text-slate-200/95">{comment}</p>
                                </div>
                                <div className="mt-2 pt-1.5 border-t border-sky-700/40 text-[9px] text-sky-300/80 lowercase">
                                  mise à jour
                                  {level ? ` · ${level.toLowerCase()}` : ''}
                                  {' · '}
                                  {formatDateTime(rawDate)}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={idx} className="flex w-full justify-start">
                            <div className="max-w-[min(92%,20rem)] rounded-2xl rounded-bl-md bg-slate-900 border border-red-900/40 px-3 py-2.5 shadow-md">
                              <div className="text-[10px] text-slate-300 mb-1.5 font-semibold">
                                {by}
                              </div>
                              <p className="text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                                {entry.raison}
                              </p>
                              <div className="mt-2 pt-1.5 border-t border-red-800/40 text-[9px] text-slate-400 lowercase">
                                rejet
                                {level ? ` · ${level.toLowerCase()}` : ''}
                                {' · '}
                                {formatDateTime(rawDate)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              </div>
              {(canEditCurrentInvoice || canDeleteCurrentInvoice) && (
                <div className="mt-auto bg-slate-900 border-t border-slate-800 p-3">
                  <div className="rounded-lg bg-slate-800/70 p-2 border border-slate-700">
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
              void loadExistingData();
              refreshAllData();
            }}
            onCancel={() => setEditModalOpen(false)}
          />
        )}
    </div>
  );
}

export default ViewInvoiceModal;

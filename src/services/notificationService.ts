import { supabase, SUPABASE_URL } from './supabase';

export type InvoiceNotificationType =
  | 'invoice_registered'
  | 'validated_dr'
  | 'validated_dop'
  | 'validated_dg'
  | 'rejected'
  | 'on_hold'
  | 'paid'
  | 'urgent'
  | 'validation_delay'
  | 'partial_payment';

export interface InvoiceNotificationPayload {
  notificationType: InvoiceNotificationType;
  invoice: {
    fournisseur?: string;
    numeroFacture?: string;
    montant?: number | string;
    devise?: string;
    numeroDossier?: string;
    region?: string;
    categorie?: string;
    dateValidation?: string;
    validePar?: string;
    /** Rôle de la personne citée (ex. validePar), affiché après le nom dans l’e-mail */
    valideParRole?: string;
    datePaiement?: string;
    modePaiement?: string;
    referencePaiement?: string;
    motifRejet?: string;
    raisonAttente?: string;
    montantTotal?: number | string;
    montantPaye?: number | string;
    soldeRestant?: number | string;
    echeance?: string;
    ancienneteJours?: number | string;
  };
  createdByEmail?: string | null;
  createdByName?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  /** Rôle métier de l’utilisateur qui déclenche la notification (affiché après son nom) */
  actorRole?: string | null;
  dryRun?: boolean;
}

export interface InvoiceNotificationResult {
  ok: boolean;
  dryRun?: boolean;
  reason?: string;
  error?: string;
  recipients?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export async function sendInvoiceNotification(payload: InvoiceNotificationPayload): Promise<InvoiceNotificationResult> {
  try {
    const projectRef = String(SUPABASE_URL).match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1] ?? 'URL inattendue';
    console.info('[Notification] Appel edge send-invoice-notification', {
      projectRef,
      notificationType: payload.notificationType,
    });

    const { data, error } = await supabase.functions.invoke('send-invoice-notification', {
      body: payload,
    });

    const body = asRecord(data);
    const recipientsFrom = (r: unknown): string[] | undefined =>
      Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : undefined;

    // Erreur HTTP (4xx/5xx) : le corps JSON peut être dans `data` selon la version du client
    if (error) {
      console.warn('[Notification] send-invoice-notification failed:', error.message, body);
      const serverError = body && typeof body.error === 'string' ? body.error : undefined;
      return {
        ok: false,
        error: error.message,
        reason: serverError,
        recipients: recipientsFrom(body?.recipients),
      };
    }

    if (!body) {
      console.warn('[Notification] send-invoice-notification: réponse vide (fonction absente ou CORS ?)');
      return {
        ok: false,
        error: 'Réponse vide du service send-invoice-notification (vérifiez le déploiement de la fonction).',
      };
    }

    if (body.dryRun === true) {
      return {
        ok: false,
        dryRun: true,
        reason: String(body.reason || 'dryRun'),
        recipients: recipientsFrom(body.recipients),
      };
    }

    if (body.success !== true) {
      return {
        ok: false,
        reason: String(body.error || 'notification failed'),
        recipients: recipientsFrom(body.recipients),
      };
    }

    return {
      ok: true,
      recipients: recipientsFrom(body.recipients),
    };
  } catch (err) {
    console.warn('[Notification] Unexpected send-invoice-notification error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'unexpected error' };
  }
}

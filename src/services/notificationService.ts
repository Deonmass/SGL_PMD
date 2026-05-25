import { supabase, SUPABASE_URL } from './supabase';
import {
  isNotificationTriggerEnabled,
  type InvoiceNotificationType,
} from '../constants/notificationConfig';
import { getNotificationParamsForSending } from './notificationParamsService';

export type { InvoiceNotificationType };

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
  /** Envoi ignoré (déclencheur désactivé dans Paramètres → Notifications) */
  skipped?: boolean;
  dryRun?: boolean;
  reason?: string;
  error?: string;
  recipients?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

const SKIPPED_RESULT: InvoiceNotificationResult = {
  ok: true,
  skipped: true,
  reason: 'notification_disabled_by_params',
};

/** Vérifie notification_params (module FACTURE) avant tout appel edge. */
export async function isTriggerEnabledForSending(
  notificationType: InvoiceNotificationType,
): Promise<boolean> {
  const { hasSavedParams, data } = await getNotificationParamsForSending();
  return isNotificationTriggerEnabled(data.matrix, hasSavedParams, notificationType);
}

export async function sendInvoiceNotification(
  payload: InvoiceNotificationPayload,
): Promise<InvoiceNotificationResult> {
  try {
    if (payload.dryRun !== true) {
      const enabled = await isTriggerEnabledForSending(payload.notificationType);
      if (!enabled) {
        console.info(
          '[Notification] Envoi ignoré — déclencheur désactivé dans les paramètres:',
          payload.notificationType,
        );
        return { ...SKIPPED_RESULT };
      }
    }

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

    if (error) {
      console.warn('[Notification] send-invoice-notification failed:', error.message, body);
      const serverError = body && typeof body.error === 'string' ? body.error : undefined;
      if (body?.skipped === true) {
        return { ok: true, skipped: true, reason: String(body.reason || serverError) };
      }
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

    if (body.skipped === true) {
      return {
        ok: true,
        skipped: true,
        reason: String(body.reason || 'notification_disabled_by_params'),
        recipients: recipientsFrom(body.recipients),
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
      const errText = String(body.error || 'notification failed');
      if (errText.includes('No recipients')) {
        return { ok: true, skipped: true, reason: 'no_recipients_for_params' };
      }
      return {
        ok: false,
        reason: errText,
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

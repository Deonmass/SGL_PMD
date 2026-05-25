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

/** Clés canoniques stockées en base (sans doublon profil / rôle). */
export type NotificationRecipientKey =
  | 'emitter'
  | 'actor'
  | 'dr'
  | 'dop'
  | 'dg'
  | 'finance'
  | 'gestionnaire'
  | 'utilisateur'
  | 'administrateur';

export type NotificationRecipientColumn = {
  key: NotificationRecipientKey;
  label: string;
  hint?: string;
};

export type NotificationRecipientGroup = {
  id: string;
  label: string;
  columns: NotificationRecipientColumn[];
};

/** Colonnes classées par thème — libellés complets affichés dans l’interface. */
export const NOTIFICATION_RECIPIENT_GROUPS: NotificationRecipientGroup[] = [
  {
    id: 'action',
    label: 'Participants à l’action',
    columns: [
      {
        key: 'emitter',
        label: 'Émetteur de la facture',
        hint: 'Créateur / enregistreur de la facture',
      },
      {
        key: 'actor',
        label: 'Acteur de l’action',
        hint: 'Personne ayant déclenché l’événement (validation, paiement, etc.)',
      },
    ],
  },
  {
    id: 'validation',
    label: 'Chaîne de validation',
    columns: [
      {
        key: 'dr',
        label: 'Directeur régional',
        hint: 'Agents habilités à valider au niveau DR (région de la facture)',
      },
      {
        key: 'dop',
        label: 'Directeur des opérations',
        hint: 'Agents habilités à valider au niveau DOP',
      },
      {
        key: 'dg',
        label: 'Direction générale',
        hint: 'Direction générale (rôle DG ou habilitation équivalente)',
      },
    ],
  },
  {
    id: 'finance',
    label: 'Paiement',
    columns: [
      {
        key: 'finance',
        label: 'Service Finance',
        hint: 'Agents Finance habilités au paiement des factures',
      },
    ],
  },
  {
    id: 'profils',
    label: 'Filtre par profil utilisateur',
    columns: [
      {
        key: 'gestionnaire',
        label: 'Gestionnaire',
        hint: 'Compte dont le rôle applicatif est Gestionnaire',
      },
      {
        key: 'utilisateur',
        label: 'Utilisateur',
        hint: 'Compte dont le rôle applicatif est Utilisateur',
      },
      {
        key: 'administrateur',
        label: 'Administrateur',
        hint: 'Compte dont le rôle applicatif est Administrateur',
      },
    ],
  },
];

export const NOTIFICATION_RECIPIENT_KEYS: NotificationRecipientKey[] =
  NOTIFICATION_RECIPIENT_GROUPS.flatMap((g) => g.columns.map((c) => c.key));

/** Anciennes clés → clé canonique (migration des données déjà enregistrées). */
export const NOTIFICATION_LEGACY_KEY_ALIASES: Record<string, NotificationRecipientKey> = {
  _emitter: 'emitter',
  _actor: 'actor',
  _regional_validator: 'dr',
  _dg: 'dg',
  _finance: 'finance',
  DR: 'dr',
  DOP: 'dop',
  DG: 'dg',
  Finance: 'finance',
  Gestionnaire: 'gestionnaire',
  Utilisateur: 'utilisateur',
  Administrateur: 'administrateur',
};

export function normalizeRecipientKey(raw: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return trimmed;
  if (NOTIFICATION_LEGACY_KEY_ALIASES[trimmed]) {
    return NOTIFICATION_LEGACY_KEY_ALIASES[trimmed];
  }
  const lower = trimmed.toLowerCase();
  const known = NOTIFICATION_RECIPIENT_KEYS.find((k) => k === lower);
  return known ?? lower;
}

export function normalizeNotificationMatrix(
  matrix: Record<string, Record<string, boolean>>,
): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const [trigger, row] of Object.entries(matrix)) {
    const merged: Record<string, boolean> = {};
    for (const [rawKey, value] of Object.entries(row || {})) {
      const key = normalizeRecipientKey(rawKey);
      if (!key) continue;
      if (rawKey === '_regional_validator') {
        merged.dr = merged.dr !== false && value !== false;
        merged.dop = merged.dop !== false && value !== false;
        continue;
      }
      if (!(key in merged)) merged[key] = value;
      else merged[key] = merged[key] && value;
    }
    out[trigger] = merged;
  }
  return out;
}

export type NotificationTriggerDef = {
  id: InvoiceNotificationType;
  label: string;
  description: string;
};

export const NOTIFICATION_TRIGGERS: NotificationTriggerDef[] = [
  {
    id: 'invoice_registered',
    label: 'Création de facture',
    description: 'Nouvelle facture enregistrée, validation requise',
  },
  {
    id: 'validated_dr',
    label: 'Validation par le directeur régional',
    description: 'Facture validée au niveau DR',
  },
  {
    id: 'validated_dop',
    label: 'Validation par le directeur des opérations',
    description: 'Facture validée au niveau DOP (notification DG possible)',
  },
  {
    id: 'validated_dg',
    label: 'Validation par la direction générale',
    description: 'Facture validée par la direction générale',
  },
  {
    id: 'rejected',
    label: 'Rejet de facture',
    description: 'Facture rejetée lors du processus de validation',
  },
  {
    id: 'on_hold',
    label: 'Mise en attente',
    description: 'Facture temporairement mise en attente',
  },
  {
    id: 'paid',
    label: 'Paiement complet',
    description: 'Paiement intégral de la facture',
  },
  {
    id: 'partial_payment',
    label: 'Paiement partiel',
    description: 'Paiement partiel sur la facture',
  },
  {
    id: 'urgent',
    label: 'Facture urgente',
    description: 'Facture critique nécessitant un traitement urgent',
  },
  {
    id: 'validation_delay',
    label: 'Retard de validation',
    description: 'Facture en attente de validation depuis plusieurs jours',
  },
];

export function buildDefaultNotificationMatrix(): Record<string, Record<string, boolean>> {
  const allOn = (): Record<string, boolean> =>
    Object.fromEntries(NOTIFICATION_RECIPIENT_KEYS.map((k) => [k, true]));

  const paiement = (): Record<string, boolean> => {
    const row = allOn();
    row.dr = false;
    row.dop = false;
    row.dg = false;
    return row;
  };

  return {
    invoice_registered: allOn(),
    validated_dr: allOn(),
    validated_dop: allOn(),
    validated_dg: allOn(),
    rejected: allOn(),
    on_hold: allOn(),
    paid: paiement(),
    partial_payment: paiement(),
    urgent: allOn(),
    validation_delay: allOn(),
  };
}

export const NOTIFICATION_PARAMS_MODULE = 'FACTURE';

/** Matrice vide : tous les envois désactivés (aucune ligne en base). */
export function buildEmptyNotificationMatrix(): Record<string, Record<string, boolean>> {
  const row = (): Record<string, boolean> =>
    Object.fromEntries(NOTIFICATION_RECIPIENT_KEYS.map((k) => [k, false]));
  return Object.fromEntries(NOTIFICATION_TRIGGERS.map((t) => [t.id, row()]));
}

/** Au moins un destinataire activé pour ce déclencheur (sinon pas d’envoi). */
export function isNotificationTriggerEnabled(
  matrix: Record<string, Record<string, boolean>> | null,
  hasSavedParams: boolean,
  triggerId: InvoiceNotificationType,
): boolean {
  if (!hasSavedParams || !matrix) return false;
  const row = matrix[triggerId];
  if (!row) return false;
  return NOTIFICATION_RECIPIENT_KEYS.some((k) => row[k] === true);
}

/** Rôle AGENTS.Role → clé filtre profil (gestionnaire, utilisateur, administrateur). */
export function agentRoleToProfileFilterKey(role: string | null | undefined): string | null {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'gestionnaire') return 'gestionnaire';
  if (r === 'utilisateur') return 'utilisateur';
  if (r === 'administrateur') return 'administrateur';
  return null;
}

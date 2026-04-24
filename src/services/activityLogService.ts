import { supabase } from './supabase';

export interface FactureLogEntry {
  timestamp: string;
  nom: string;
  email: string;
  modification: string;
  explication: string;
}

interface Actor {
  nom: string;
  email: string;
}

const asText = (value: unknown) => String(value ?? '').trim();

export const parseFactureLogs = (raw: unknown): FactureLogEntry[] => {
  if (!raw) return [];

  const normalizeEntry = (entry: Record<string, unknown>): FactureLogEntry | null => {
    const timestamp = asText(entry.timestamp);
    const nom = asText(entry.nom);
    const email = asText(entry.email);
    const modification = asText(entry.modification);
    const explication = asText(entry.explication);
    if (!timestamp || !modification || !explication) return null;
    return {
      timestamp,
      nom: nom || 'Utilisateur inconnu',
      email: email || 'N/A',
      modification,
      explication,
    };
  };

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => (entry && typeof entry === 'object' ? normalizeEntry(entry as Record<string, unknown>) : null))
      .filter((entry): entry is FactureLogEntry => Boolean(entry));
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parseFactureLogs(parsed);
    } catch {
      return [];
    }
  }

  if (raw && typeof raw === 'object') {
    const single = normalizeEntry(raw as Record<string, unknown>);
    return single ? [single] : [];
  }

  return [];
};

const buildEntry = (actor: Actor, modification: string, explication: string): FactureLogEntry => ({
  timestamp: new Date().toISOString(),
  nom: actor.nom || 'Utilisateur inconnu',
  email: actor.email || 'N/A',
  modification,
  explication,
});

export const buildLogActor = (agent?: { Nom?: string | null; email?: string | null }): Actor => ({
  nom: asText(agent?.Nom) || 'Utilisateur inconnu',
  email: asText(agent?.email) || 'N/A',
});

export const appendFactureLogByInvoiceNumber = async (
  invoiceNumber: string,
  actor: Actor,
  modification: string,
  explication: string
) => {
  const safeNumber = asText(invoiceNumber);
  if (!safeNumber) return;

  const { data, error } = await supabase
    .from('FACTURES')
    .select('updated_at')
    .eq('Numéro de facture', safeNumber)
    .single();

  if (error) throw error;

  const logs = parseFactureLogs(data?.updated_at);
  logs.push(buildEntry(actor, modification, explication));

  const { error: updateError } = await supabase
    .from('FACTURES')
    .update({ updated_at: JSON.stringify(logs) })
    .eq('Numéro de facture', safeNumber);

  if (updateError) throw updateError;
};

export const appendFactureLogById = async (
  invoiceId: number | string,
  actor: Actor,
  modification: string,
  explication: string
) => {
  const { data, error } = await supabase
    .from('FACTURES')
    .select('updated_at')
    .eq('ID', invoiceId)
    .single();

  if (error) throw error;

  const logs = parseFactureLogs(data?.updated_at);
  logs.push(buildEntry(actor, modification, explication));

  const { error: updateError } = await supabase
    .from('FACTURES')
    .update({ updated_at: JSON.stringify(logs) })
    .eq('ID', invoiceId);

  if (updateError) throw updateError;
};

export const appendFactureDeletionAuditLog = async (params: {
  invoiceNumber: string;
  invoiceType?: string | null;
  actor: Actor;
  explication: string;
}) => {
  const invoiceNumber = asText(params.invoiceNumber);
  if (!invoiceNumber) return;

  const invoiceTypeRaw = asText(params.invoiceType).toLowerCase();
  const normalizedType = invoiceTypeRaw.includes('frais') ? 'frais-generaux' : 'operationnel';

  const payload = {
    id: `log-delete-${invoiceNumber}-${Date.now()}`,
    NumeroFacture: invoiceNumber,
    datePaiement: new Date().toISOString(),
    referencePaiement: `LOG-SUPP-${Date.now()}`,
    modePaiement: normalizedType,
    typePaiement: 'log_suppression_facture',
    montantFacture: 0,
    montantAutorise: 0,
    montantPaye: 0,
    resteAPayer: 0,
    devise: 'USD',
    compteSGL: '',
    compteFournisseur: '',
    BanqueFournisseur: '',
    BanqueSGL: '',
    fichier: '',
    commentaires: asText(params.explication) || 'Facture supprimée.',
    paiedby: params.actor.email || 'N/A',
    timestamp: new Date().toISOString(),
  };

  const { error } = await supabase.from('PAIEMENTS').insert(payload);
  if (error) throw error;
};

export const buildFactureUpdateExplanation = (
  beforeValues: Record<string, unknown>,
  afterValues: Record<string, unknown>
) => {
  const labels: Record<string, string> = {
    'Date emission': "date d'émission",
    'Date de réception': 'date de réception',
    'Numéro de facture': 'numéro de facture',
    Fournisseur: 'fournisseur',
    'Catégorie fournisseur': 'catégorie fournisseur',
    Région: 'région',
    'Centre de coût': 'centre de coût',
    Gestionnaire: 'gestionnaire',
    'Type de facture': 'type de facture',
    'Catégorie de charge': 'catégorie de charge',
    'Numéro de dossier': 'numéro de dossier',
    'Motif / Description': 'motif / description',
    Devise: 'devise',
    'Taux facture': 'taux facture',
    Montant: 'montant',
    'Niveau urgence': 'niveau urgence',
    'Délais de paiement': 'délais de paiement',
    Échéance: 'échéance',
    'Mode de paiement requis': 'mode de paiement requis',
    'Facture attachée': 'facture attachée',
    Commentaires: 'commentaires',
    Statut: 'statut',
  };

  const changedFields: string[] = [];
  Object.keys(afterValues).forEach((key) => {
    const before = asText(beforeValues[key]);
    const after = asText(afterValues[key]);
    if (before !== after) {
      changedFields.push(labels[key] || key);
    }
  });

  if (!changedFields.length) {
    return "Mise à jour de la facture sans changement détecté sur les champs principaux.";
  }

  return `Mise à jour des champs: ${changedFields.join(', ')}.`;
};

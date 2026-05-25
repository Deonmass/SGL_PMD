import { supabase } from './supabase';
import type { Invoice as GlobalInvoice } from '../types';
import {
  evaluateProvisionSolde,
  mergeChargeSeuils,
  parseChargeSeuils,
  type ChargeSeuils,
  type ProvisionSoldeStatus,
} from '../utils/chargeSeuils';

function mapDbStatutToModalStatus(raw: string): GlobalInvoice['status'] {
  const u = String(raw || '').toUpperCase();
  if (u.includes('PAY') && !u.includes('PARTIEL')) return 'paid';
  if (u.includes('REJET')) return 'rejected';
  if (u.includes('ÉCHU') || u.includes('ECHU')) return 'overdue';
  if (u.includes('BON') && u.includes('PAYER')) return 'bon-a-payer';
  if (u.includes('VALID')) return 'validated';
  return 'pending';
}

export async function fetchInvoiceForView(invoiceNumber: string): Promise<GlobalInvoice | null> {
  const num = invoiceNumber.trim();
  if (!num) return null;

  const { data, error } = await supabase
    .from('FACTURES')
    .select(
      'ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Région", Devise, "Catégorie de charge", "Niveau urgence"',
    )
    .eq('Numéro de facture', num)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const idRaw = row.ID;
  const idNum = typeof idRaw === 'number' ? idRaw : parseInt(String(idRaw || '0'), 10);
  const reg = String(row['Région'] || 'OUEST').toUpperCase();
  const region: GlobalInvoice['region'] =
    reg === 'OUEST' || reg === 'SUD' || reg === 'EST' || reg === 'NORD' ? reg : 'OUEST';
  const urg = String(row['Niveau urgence'] || 'Basse');
  const urgencyLevel: GlobalInvoice['urgencyLevel'] =
    urg === 'Moyenne' || urg === 'Haute' ? urg : 'Basse';

  return {
    id: Number.isNaN(idNum) ? 0 : idNum,
    invoiceNumber: String(row['Numéro de facture'] ?? num),
    supplier: String(row.Fournisseur || ''),
    receptionDate: String(row['Date de réception'] || ''),
    amount: parseFloat(String(row.Montant ?? 0)) || 0,
    currency: 'USD',
    chargeCategory: String(row['Catégorie de charge'] || ''),
    urgencyLevel,
    status: mapDbStatutToModalStatus(String(row.Statut || '')),
    region,
    validations: 0,
    emissionDate: String(row['Date de réception'] || ''),
  };
}

export type ChargeProvisionOperation = 'in' | 'out';

export interface ChargeProvisionRow {
  ID: number;
  Charge: string;
  Date_operation: string;
  Type_operation: ChargeProvisionOperation;
  Numero_facture: string | null;
  Reference: string | null;
  Montant: number;
  Solde: number;
}

/** Normalise le libellé charge pour rapprocher CHARGES et lignes CHARGE_PROVISION */
export function normalizeChargeLabel(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function chargesMatch(selectedCharge: string, movementCharge: string): boolean {
  const a = normalizeChargeLabel(selectedCharge);
  const b = normalizeChargeLabel(movementCharge);
  if (!a || !b) return false;
  if (a === b) return true;
  const compact = (s: string) =>
    s.replace(/\b(de|d|du|la|le|les|l)\b/gi, '').replace(/\s+/g, '').trim();
  return compact(a) === compact(b);
}

export function formatApproReference(id: number, dateOperation?: string): string {
  const d = dateOperation ? new Date(dateOperation) : new Date();
  const year = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  return `APR-${year}-${String(id).padStart(6, '0')}`;
}

export function getApproReference(row: Pick<ChargeProvisionRow, 'ID' | 'Date_operation' | 'Reference'>): string {
  if (row.Reference?.trim()) return row.Reference.trim();
  return formatApproReference(row.ID, row.Date_operation);
}

/** Retrouve le solde d'une charge provisionnée parmi les libellés possibles */
export function findProvisionSolde(
  summaries: ChargeProvisionSummary[],
  ...matchCandidates: string[]
): number | null {
  for (const candidate of matchCandidates) {
    const hit = summaries.find((s) => chargesMatch(candidate, s.charge));
    if (hit) return hit.solde;
  }
  for (const candidate of matchCandidates) {
    const key = normalizeChargeLabel(candidate);
    if (!key) continue;
    const hit = summaries.find((s) => {
      const sk = normalizeChargeLabel(s.charge);
      return sk.includes(key) || key.includes(sk);
    });
    if (hit) return hit.solde;
  }
  return null;
}

export function findProvisionSummary(
  summaries: ChargeProvisionSummary[],
  ...matchCandidates: string[]
): ChargeProvisionSummary | null {
  for (const candidate of matchCandidates) {
    const hit = summaries.find((s) => chargesMatch(candidate, s.charge));
    if (hit) return hit;
  }
  for (const candidate of matchCandidates) {
    const key = normalizeChargeLabel(candidate);
    if (!key) continue;
    const hit = summaries.find((s) => {
      const sk = normalizeChargeLabel(s.charge);
      return sk.includes(key) || key.includes(sk);
    });
    if (hit) return hit;
  }
  return null;
}

function normalizeTypeOperation(raw: unknown): ChargeProvisionOperation | null {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['in', 'appro', 'entree', 'credit'].includes(t)) return 'in';
  if (['out', 'sortie', 'debit', 'depense'].includes(t)) return 'out';
  return null;
}

function mapProvisionRow(row: Record<string, unknown>): ChargeProvisionRow | null {
  const type = normalizeTypeOperation(row.Type_operation);
  if (!type) return null;
  const id = Number(row.ID);
  if (!Number.isFinite(id)) return null;
  return {
    ID: id,
    Charge: String(row.Charge || '').trim(),
    Date_operation: String(row.Date_operation || ''),
    Type_operation: type,
    Numero_facture: row.Numero_facture ? String(row.Numero_facture).trim() : null,
    Reference: row.Reference ? String(row.Reference).trim() : null,
    Montant: parseAmount(row.Montant),
    Solde: parseAmount(row.Solde),
  };
}

export interface ChargeProvisionSummary {
  charge: string;
  solde: number;
  totalIn: number;
  totalOut: number;
  movementCount: number;
  countIn: number;
  countOut: number;
}

function parseAmount(value: unknown): number {
  const n = parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function normalizeAbonnement(value: unknown): string {
  const u = String(value ?? '').trim().toUpperCase();
  return u === 'OUI' ? 'OUI' : 'NON';
}

export function isAbonnementCharge(value: unknown): boolean {
  return normalizeAbonnement(value) === 'OUI';
}

export async function chargeHasAbonnement(designation: string): Promise<boolean> {
  const name = designation.trim();
  if (!name) return false;

  const { data, error } = await supabase
    .from('CHARGES')
    .select('abonnement')
    .eq('designation_Charges', name)
    .maybeSingle();

  if (error) {
    console.error('chargeHasAbonnement:', error);
    return false;
  }

  return isAbonnementCharge((data as { abonnement?: string } | null)?.abonnement);
}

async function fetchAllProvisionRows(): Promise<ChargeProvisionRow[]> {
  const { data, error } = await supabase
    .from('CHARGE_PROVISION')
    .select('*')
    .order('Date_operation', { ascending: false })
    .order('ID', { ascending: false });

  if (error) throw error;

  return (data || [])
    .map((row) => mapProvisionRow(row as Record<string, unknown>))
    .filter((row): row is ChargeProvisionRow => row !== null);
}

async function getMovementRowsForCharge(chargeLabel: string): Promise<ChargeProvisionRow[]> {
  const all = await fetchAllProvisionRows();
  return all
    .filter((m) => chargesMatch(chargeLabel, m.Charge))
    .sort((a, b) => {
      const dateA = new Date(a.Date_operation).getTime();
      const dateB = new Date(b.Date_operation).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.ID - b.ID;
    });
}

async function recalculateSoldesForCharge(chargeLabel: string): Promise<void> {
  const rows = await getMovementRowsForCharge(chargeLabel);
  let running = 0;
  for (const row of rows) {
    if (row.Type_operation === 'in') running += row.Montant;
    else running -= row.Montant;
    const { error } = await supabase
      .from('CHARGE_PROVISION')
      .update({ Solde: running })
      .eq('ID', row.ID);
    if (error) throw error;
  }
}

async function getLastSoldeForCharge(charge: string): Promise<number> {
  const { data, error } = await supabase
    .from('CHARGE_PROVISION')
    .select('Solde')
    .eq('Charge', charge)
    .order('ID', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return parseAmount((data as { Solde?: number } | null)?.Solde);
}

async function sortieExistsForInvoice(charge: string, numeroFacture: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('CHARGE_PROVISION')
    .select('ID')
    .eq('Charge', charge)
    .eq('Type_operation', 'out')
    .eq('Numero_facture', numeroFacture)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export const chargeProvisionService = {
  async getAbonnementChargeNames(): Promise<string[]> {
    const { data, error } = await supabase.from('CHARGES').select('designation_Charges, abonnement');
    if (error) throw error;
    return (data || [])
      .filter((row) => isAbonnementCharge((row as { abonnement?: string }).abonnement))
      .map((row) => String((row as { designation_Charges: string }).designation_Charges || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'fr'));
  },

  async getAllMovements(): Promise<ChargeProvisionRow[]> {
    return fetchAllProvisionRows();
  },

  async getMovementsByCharge(charge: string): Promise<ChargeProvisionRow[]> {
    const all = await this.getAllMovements();
    return all
      .filter((m) => chargesMatch(charge, m.Charge))
      .sort((a, b) => {
        const dateA = new Date(a.Date_operation).getTime();
        const dateB = new Date(b.Date_operation).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return b.ID - a.ID;
      });
  },

  async getSoldeForCharge(chargeDesignation: string): Promise<number> {
    const movements = await this.getMovementsByCharge(chargeDesignation);
    let totalIn = 0;
    let totalOut = 0;
    for (const m of movements) {
      if (m.Type_operation === 'in') totalIn += m.Montant;
      else totalOut += m.Montant;
    }
    return totalIn - totalOut;
  },

  async evaluateInvoiceAgainstProvision(params: {
    chargeDesignation: string;
    seuilsRaw: unknown;
    invoiceAmount: number;
  }): Promise<{
    allowed: boolean;
    status: ProvisionSoldeStatus;
    message?: string;
    solde: number;
    projectedSolde: number;
  }> {
    const designation = params.chargeDesignation.trim();
    const solde = await this.getSoldeForCharge(designation);
    const seuils = mergeChargeSeuils(parseChargeSeuils(params.seuilsRaw));
    const amount = parseAmount(params.invoiceAmount);
    const projectedSolde = solde - amount;
    const evaluation = evaluateProvisionSolde(solde, seuils, amount);
    return {
      allowed: evaluation.status !== 'blocked',
      status: evaluation.status,
      message: evaluation.message,
      solde,
      projectedSolde,
    };
  },

  async getSummaries(): Promise<ChargeProvisionSummary[]> {
    const [abonnementNames, movements] = await Promise.all([
      this.getAbonnementChargeNames(),
      this.getAllMovements(),
    ]);

    const byCharge = new Map<string, ChargeProvisionSummary>();

    for (const name of abonnementNames) {
      byCharge.set(name, {
        charge: name,
        solde: 0,
        totalIn: 0,
        totalOut: 0,
        movementCount: 0,
        countIn: 0,
        countOut: 0,
      });
    }

    for (const m of movements) {
      if (!m.Charge.trim()) continue;
      const canonical =
        abonnementNames.find((name) => chargesMatch(name, m.Charge)) ?? m.Charge.trim();
      const existing = byCharge.get(canonical) || {
        charge: canonical,
        solde: 0,
        totalIn: 0,
        totalOut: 0,
        movementCount: 0,
        countIn: 0,
        countOut: 0,
      };
      existing.movementCount += 1;
      if (m.Type_operation === 'in') {
        existing.totalIn += m.Montant;
        existing.countIn += 1;
      } else {
        existing.totalOut += m.Montant;
        existing.countOut += 1;
      }
      byCharge.set(canonical, existing);
    }

    for (const summary of byCharge.values()) {
      summary.solde = summary.totalIn - summary.totalOut;
    }

    return Array.from(byCharge.values()).sort((a, b) => a.charge.localeCompare(b.charge, 'fr'));
  },

  async recordAppro(params: {
    charge: string;
    dateOperation: string;
    montant: number;
  }): Promise<ChargeProvisionRow> {
    const charge = params.charge.trim();
    const montant = parseAmount(params.montant);
    if (!charge) throw new Error('Charge requise');
    if (montant <= 0) throw new Error('Montant invalide');

    const previousSolde = await getLastSoldeForCharge(charge);
    const newSolde = previousSolde + montant;

    const { data, error } = await supabase
      .from('CHARGE_PROVISION')
      .insert([
        {
          Charge: charge,
          Date_operation: params.dateOperation,
          Type_operation: 'in',
          Numero_facture: null,
          Montant: montant,
          Solde: newSolde,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    const inserted = data as Record<string, unknown>;
    const id = Number(inserted.ID);
    const reference = formatApproReference(id, params.dateOperation);

    const { error: refError } = await supabase
      .from('CHARGE_PROVISION')
      .update({ Reference: reference })
      .eq('ID', id);

    if (refError) {
      console.warn('Référence appro non enregistrée:', refError);
    }

    const mapped = mapProvisionRow({ ...inserted, Reference: reference });
    if (!mapped) throw new Error('Mouvement appro invalide après insertion');
    return mapped;
  },

  async getMovementById(id: number): Promise<ChargeProvisionRow | null> {
    const { data, error } = await supabase.from('CHARGE_PROVISION').select('*').eq('ID', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return mapProvisionRow(data as Record<string, unknown>);
  },

  async updateAppro(params: {
    id: number;
    dateOperation: string;
    montant: number;
  }): Promise<ChargeProvisionRow> {
    const existing = await this.getMovementById(params.id);
    if (!existing || existing.Type_operation !== 'in') {
      throw new Error('Approvisionnement introuvable.');
    }

    const montant = parseAmount(params.montant);
    if (montant <= 0) throw new Error('Montant invalide');

    const { error } = await supabase
      .from('CHARGE_PROVISION')
      .update({
        Date_operation: params.dateOperation,
        Montant: montant,
      })
      .eq('ID', params.id);

    if (error) throw error;
    await recalculateSoldesForCharge(existing.Charge);

    const updated = await this.getMovementById(params.id);
    if (!updated) throw new Error('Approvisionnement introuvable après mise à jour.');
    return updated;
  },

  async deleteAppro(id: number): Promise<void> {
    const existing = await this.getMovementById(id);
    if (!existing || existing.Type_operation !== 'in') {
      throw new Error('Approvisionnement introuvable.');
    }

    const { error } = await supabase.from('CHARGE_PROVISION').delete().eq('ID', id);
    if (error) throw error;
    await recalculateSoldesForCharge(existing.Charge);
  },

  async recordSortieFromInvoice(params: {
    chargeDesignation: string;
    invoiceNumber: string;
    montant: number;
    dateOperation: string;
  }): Promise<{ recorded: boolean; reason?: string }> {
    const charge = params.chargeDesignation.trim();
    const numero = params.invoiceNumber.trim();
    const montant = parseAmount(params.montant);

    if (!charge || !numero || montant <= 0) {
      return { recorded: false, reason: 'données_incomplètes' };
    }

    const hasAbonnement = await chargeHasAbonnement(charge);
    if (!hasAbonnement) {
      return { recorded: false, reason: 'pas_abonnement' };
    }

    if (await sortieExistsForInvoice(charge, numero)) {
      return { recorded: false, reason: 'deja_enregistre' };
    }

    const previousSolde = await getLastSoldeForCharge(charge);
    const newSolde = previousSolde - montant;

    const { error } = await supabase.from('CHARGE_PROVISION').insert([
      {
        Charge: charge,
        Date_operation: params.dateOperation,
        Type_operation: 'out',
        Numero_facture: numero,
        Montant: montant,
        Solde: newSolde,
      },
    ]);

    if (error) throw error;
    return { recorded: true };
  },
};

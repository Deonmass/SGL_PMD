export interface ChargeSeuilLevel {
  montant: number;
  message: string;
}

export interface ChargeSeuils {
  alerte: ChargeSeuilLevel;
  epuisement: ChargeSeuilLevel;
}

export const DEFAULT_EPUisement_MESSAGE =
  "Il n'y a plus d'abonnement pour cette charge. Veuillez approvisionner.";

export const DEFAULT_ALERTE_MESSAGE =
  'Le solde de provision est bas pour cette charge. Pensez à approvisionner.';

export function defaultChargeSeuils(): ChargeSeuils {
  return {
    alerte: { montant: 0, message: DEFAULT_ALERTE_MESSAGE },
    epuisement: { montant: 0, message: DEFAULT_EPUisement_MESSAGE },
  };
}

export function parseChargeSeuils(raw: unknown): ChargeSeuils | null {
  if (raw == null) return null;
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;

  const record = obj as Record<string, unknown>;
  const alerteRaw = record.alerte;
  const epuRaw = record.epuisement ?? record.épuisement;

  const parseLevel = (level: unknown, fallbackMontant: number, fallbackMessage: string): ChargeSeuilLevel => {
    if (!level || typeof level !== 'object') {
      return { montant: fallbackMontant, message: fallbackMessage };
    }
    const l = level as Record<string, unknown>;
    const montant = parseFloat(String(l.montant ?? fallbackMontant));
    const message = String(l.message ?? fallbackMessage).trim() || fallbackMessage;
    return {
      montant: Number.isFinite(montant) ? montant : fallbackMontant,
      message,
    };
  };

  return {
    alerte: parseLevel(alerteRaw, 0, DEFAULT_ALERTE_MESSAGE),
    epuisement: parseLevel(epuRaw, 0, DEFAULT_EPUisement_MESSAGE),
  };
}

export function mergeChargeSeuils(partial?: ChargeSeuils | null): ChargeSeuils {
  const base = defaultChargeSeuils();
  if (!partial) return base;
  return {
    alerte: {
      montant: partial.alerte?.montant ?? base.alerte.montant,
      message: partial.alerte?.message?.trim() || base.alerte.message,
    },
    epuisement: {
      montant: 0,
      message: partial.epuisement?.message?.trim() || base.epuisement.message,
    },
  };
}

export type ProvisionSoldeStatus = 'ok' | 'alert' | 'blocked';

export function evaluateProvisionSolde(
  solde: number,
  seuils: ChargeSeuils,
  invoiceAmount?: number,
): { status: ProvisionSoldeStatus; message?: string } {
  const safeSolde = Number.isFinite(solde) ? solde : 0;
  const seuilsMerged = mergeChargeSeuils(seuils);
  const epuMontant = seuilsMerged.epuisement.montant ?? 0;
  const projected =
    invoiceAmount !== undefined && Number.isFinite(invoiceAmount)
      ? safeSolde - invoiceAmount
      : safeSolde;

  if (safeSolde <= epuMontant || projected <= epuMontant) {
    return { status: 'blocked', message: seuilsMerged.epuisement.message };
  }

  const alertMontant = seuilsMerged.alerte.montant ?? 0;
  if (safeSolde <= alertMontant || projected <= alertMontant) {
    return { status: 'alert', message: seuilsMerged.alerte.message };
  }

  return { status: 'ok' };
}

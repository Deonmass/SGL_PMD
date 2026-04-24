import { supabase } from './supabase';

// COMPTES
export interface Compte {
  id?: number;
  Fournisseur: string;
  Banque: string;
  Compte: string;
  SGL: boolean;
  devise?: string;
}

export const compteService = {
  async getAll() {
    console.log('compteService.getAll() - Début de la requête');
    try {
      const { data, error } = await supabase
        .from('COMPTES')
        .select('*')
        .order('id', { ascending: true });
      
      console.log('Réponse Supabase:', { data, error });
      
      if (error) {
        console.error('Erreur Supabase:', error);
        throw new Error(`Erreur Supabase: ${error.message}`);
      }
      
      console.log('Succès - nombre de comptes:', data?.length || 0);
      return data;
    } catch (err) {
      console.error('Erreur dans compteService.getAll():', err);
      throw err;
    }
  },

  async create(compte: Compte) {
    const { data, error } = await supabase
      .from('COMPTES')
      .insert([compte])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id: number, compte: Partial<Compte>) {
    const { data, error } = await supabase
      .from('COMPTES')
      .update(compte)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('COMPTES')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// FOURNISSEUR
export interface Fournisseur {
  ID?: number;
  Fournisseur: string;
  "Catégorie fournisseur": string;
}

export const fournisseurService = {
  async getAll() {
    const { data, error } = await supabase
      .from('FOURNISSEURS')
      .select('*')
      .order('ID', { ascending: true });
    if (error) throw error;
    return data;
  },

  async create(fournisseur: Fournisseur) {
    const { data, error } = await supabase
      .from('FOURNISSEURS')
      .insert([fournisseur])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id: number, fournisseur: Partial<Fournisseur>) {
    const { data, error } = await supabase
      .from('FOURNISSEURS')
      .update(fournisseur)
      .eq('ID', id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('FOURNISSEURS')
      .delete()
      .eq('ID', id);
    if (error) throw error;
  },
};

// AGENTS
export interface Agent {
  ID?: number;
  Nom: string;
  email: string;
  Role: string;
  REGION: string;
}

export const agentService = {
  async getAll() {
    const { data, error } = await supabase
      .from('AGENTS')
      .select('*')
      .order('ID', { ascending: true });
    if (error) throw error;
    return data;
  },

  async create(agent: Agent) {
    const { data, error } = await supabase
      .from('AGENTS')
      .insert([agent])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id: number, agent: Partial<Agent>) {
    const { data, error } = await supabase
      .from('AGENTS')
      .update(agent)
      .eq('ID', id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('AGENTS')
      .delete()
      .eq('ID', id);
    if (error) throw error;
  },
};

// CHARGES
export interface Charge {
  ID?: number;
  designation_Charges: string;
  Bloquant: string;
  type?: string | null;
}

export const chargeService = {
  async getAll() {
    const { data, error } = await supabase
      .from('CHARGES')
      .select('*')
      .order('ID', { ascending: true });
    if (error) throw error;
    return data;
  },

  async create(charge: Charge) {
    // Valider que Bloquant est en majuscules (OUI ou NON)
    const bloquant = (charge.Bloquant || '').toUpperCase();
    if (!['OUI', 'NON'].includes(bloquant)) {
      throw new Error('Bloquant doit être OUI ou NON');
    }
    
    const payload = {
      designation_Charges: charge.designation_Charges,
      Bloquant: bloquant,
      type: charge.type || null,
    };

    const { data, error } = await supabase
      .from('CHARGES')
      .insert([payload])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id: number, charge: Partial<Charge>) {
    const updateData: Partial<Charge> = {};

    if (charge.designation_Charges !== undefined) {
      updateData.designation_Charges = charge.designation_Charges;
    }

    if (charge.Bloquant !== undefined) {
      const bloquant = charge.Bloquant.toUpperCase();
      if (!['OUI', 'NON'].includes(bloquant)) {
        throw new Error('Bloquant doit être OUI ou NON');
      }
      updateData.Bloquant = bloquant;
    }

    if (charge.type !== undefined) {
      updateData.type = charge.type || null;
    }
    
    const { data, error } = await supabase
      .from('CHARGES')
      .update(updateData)
      .eq('ID', id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('CHARGES')
      .delete()
      .eq('ID', id);
    if (error) throw error;
  },
};

const normalizeInvoiceType = (value?: string | null) => {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (normalized === 'frais-generaux' || normalized === 'frais generaux') {
    return 'frais-generaux';
  }
  if (normalized === 'operationnel' || normalized === 'operationel') {
    return 'operationnel';
  }
  return normalized;
};

const matchesInvoiceType = (invoiceType: string | undefined, value?: string | null) => {
  if (!invoiceType) return true;
  return normalizeInvoiceType(value) === normalizeInvoiceType(invoiceType);
};

const getYearBounds = (year?: string) => {
  if (!year) return null;
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
};

// CENTRE_DE_COUT
export interface CentreDeCout {
  ID?: number;
  Designation: string;
  REGION: string;
}

export const centreDeCoutService = {
  async getAll() {
    const { data, error } = await supabase
      .from('CENTRE_DE_COUT')
      .select('*')
      .order('ID', { ascending: true });
    if (error) throw error;
    return data;
  },

  async create(centre: CentreDeCout) {
    const { data, error } = await supabase
      .from('CENTRE_DE_COUT')
      .insert([centre])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id: number, centre: Partial<CentreDeCout>) {
    const { data, error } = await supabase
      .from('CENTRE_DE_COUT')
      .update(centre)
      .eq('ID', id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('CENTRE_DE_COUT')
      .delete()
      .eq('ID', id);
    if (error) throw error;
  },
};

// CAISSES
export interface Caisse {
  ID?: number;
  Designation: string;
  Region: string;
  Date_creation?: string;
}

export const caisseService = {
  async getAll() {
    const { data, error } = await supabase
      .from('CAISSES')
      .select('*')
      .order('ID', { ascending: true });
    if (error) throw error;
    return data;
  },

  async create(caisse: Caisse) {
    const { data, error } = await supabase
      .from('CAISSES')
      .insert([caisse])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id: number, caisse: Partial<Caisse>) {
    const { data, error } = await supabase
      .from('CAISSES')
      .update(caisse)
      .eq('ID', id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('CAISSES')
      .delete()
      .eq('ID', id);
    if (error) throw error;
  },

  async getRegions() {
    return ['OUEST', 'EST', 'SUD', 'NORD'];
  },
};

// DASHBOARD STATISTICS
export interface DashboardStats {
  totalMontant: number;
  totalFactures: number;
  nonPayeeMontant: number;
  nonPayeeCount: number;
  bonAPayerMontant: number;
  bonAPayerCount: number;
  enAttenteValidationMontant: number;
  enAttenteValidationCount: number;
  payeeMontant: number;
  payeeCount: number;
  partiellementPayeeMontantTotal: number;
  partiellementPayeeMontantPaye: number;
  partiellementPayeeReste: number;
  partiellementPayeeCount: number;
  rejeteeMontant: number;
  rejeteeCount: number;
  echueMontant: number;
  echueeCount: number;
}

export interface TopSupplier {
  fournisseur: string;
  montantTotal: number;
  nombreFactures: number;
}

export interface Invoice {
  ID: number;
  "Numéro de facture": string;
  Fournisseur: string;
  Montant: number;
  Statut: string;
  "Date de réception": string;
}

export interface MonthlyInvoiceStats {
  month: string;
  monthNumber: number;
  totalRecu: number;
  totalPaye: number;
  totalReste: number;
  nombreFactures: number;
  nombreFacturesPayees: number;
  nombreFacturesNonPayees: number;
}

export const dashboardService = {
  // Get all dashboard statistics
  async getDashboardStats(year?: string, region?: string | null, invoiceType?: string): Promise<DashboardStats> {
    try {
      let facturesQuery = supabase
        .from('FACTURES')
        .select('ID, Montant, "Statut", "Date de réception", "Échéance", "validation DR", "validation DOP","validation DG", "Numéro de facture", "Région", "Type de facture"');

      const yearBounds = getYearBounds(year);
      if (yearBounds) {
        facturesQuery = facturesQuery
          .gte('"Date de réception"', yearBounds.start)
          .lte('"Date de réception"', yearBounds.end);
      }
      if (region) {
        facturesQuery = facturesQuery.eq('"Région"', region);
      }
      if (invoiceType) {
        facturesQuery = facturesQuery.eq('"Type de facture"', invoiceType);
      }

      const { data: factures, error } = await facturesQuery;
      
      if (error) throw error;

      // Get all payments
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');
      
      if (paiementsError) throw paiementsError;

      console.log(' [Dashboard] **DEBUG** Appel getDashboardStats avec: year=', year, ', region=', region);
      console.log('📊 [Dashboard] Factures brutes de la BD:', factures?.length || 0);
      if (factures && factures.length > 0) {
        console.log('📊 [Dashboard] Exemple facture 1:', {
          id: factures[0].ID,
          region: factures[0]['Région'],
          montant: factures[0].Montant,
          statut: factures[0]['Statut']
        });
      }
      console.log('📊 [Dashboard] Paiements chargés:', paiements?.length || 0);
      
      // Debug: Log unique regions in database
      if (factures) {
        const uniqueRegions = [...new Set(factures.map((f: any) => f['Région']).filter(Boolean))];
        console.log('📊 [Dashboard] Régions uniques dans la BD:', uniqueRegions);
        if (region) {
          console.log('📊 [Dashboard] Cherchant la région:', `"${region}"`, 'qui a', region?.length, 'caractères');
          const sample = factures.find((f: any) => f['Région']);
          if (sample) {
            console.log('📊 [Dashboard] Exemple de région BD:', `"${sample['Région']}"`, 'qui a', sample['Région']?.length, 'caractères');
          }
        }
      }

      // Créer une map des paiements directement
      const facturesAvecPaiements = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture;
          const paid = parseFloat(p.montantPaye) || 0;
          const existing = facturesAvecPaiements.get(invoiceNumber) || 0;
          facturesAvecPaiements.set(invoiceNumber, existing + paid);
        });
      }

      const stats: DashboardStats = {
        totalMontant: 0,
        totalFactures: 0,
        nonPayeeMontant: 0,
        nonPayeeCount: 0,
        bonAPayerMontant: 0,
        bonAPayerCount: 0,
        enAttenteValidationMontant: 0,
        enAttenteValidationCount: 0,
        payeeMontant: 0,
        payeeCount: 0,
        partiellementPayeeMontantTotal: 0,
        partiellementPayeeMontantPaye: 0,
        partiellementPayeeReste: 0,
        partiellementPayeeCount: 0,
        rejeteeMontant: 0,
        rejeteeCount: 0,
        echueMontant: 0,
        echueeCount: 0,
      };

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let processedCount = 0;

      if (factures) {
        factures.forEach((facture: any) => {
          const montant = parseFloat(facture.Montant) || 0;
          const statut = facture.Statut?.toLowerCase() || '';
          const invoiceNumber = facture['Numéro de facture'];
          const isRejeted = statut.includes('rejet');

          processedCount++;
          
          // Check if invoice is overdue
          let isOverdue = false;
          if (facture['Échéance']) {
            const dueDate = new Date(facture['Échéance']);
            isOverdue = dueDate < today;
          }

          // FACTURE REJETÉE - Exclude from all other calculations
          if (isRejeted) {
            stats.rejeteeMontant += montant;
            stats.rejeteeCount += 1;
            return; // Skip other calculations for rejected invoices
          }

          stats.totalMontant += montant;
          stats.totalFactures += 1;

          // FACTURE ÉCHUE - Count separately but also in other totals
          if (isOverdue) {
            stats.echueMontant += montant;
            stats.echueeCount += 1;
          }

          const totalPaid = facturesAvecPaiements.get(invoiceNumber) || 0;
          const reste = montant - totalPaid;

          // Add all paid amounts (including partial payments)
          stats.payeeMontant += totalPaid;
          
          if (totalPaid > 0) {
            stats.payeeCount += 1;
          }

          // Add all unpaid amounts (including remaining from partial payments)
          if (reste > 0) {
            stats.nonPayeeMontant += reste;
            if (totalPaid === 0) {
              stats.nonPayeeCount += 1;
            }
          }

          // Track partial payment details separately
          if (totalPaid > 0 && totalPaid < montant) {
            // Facture Payée Partiellement
            stats.partiellementPayeeMontantTotal += montant;
            stats.partiellementPayeeMontantPaye += totalPaid;
            stats.partiellementPayeeReste += reste;
            stats.partiellementPayeeCount += 1;
          }

          // Check validation rules for unpaid amounts
          if (totalPaid < montant) {
            const drValidated = facture['validation DR'] != null && String(facture['validation DR']).trim() !== '';
            const dopValidated = facture['validation DOP'] != null && String(facture['validation DOP']).trim() !== '';
            
            // Règle demandée: seule validation DOP rend la facture validée
            const isValidated = dopValidated;
            
            if (isValidated) {
              // Bon à Payer (validated but unpaid) - add the unpaid amount
              stats.bonAPayerMontant += reste;
              if (totalPaid === 0) {
                stats.bonAPayerCount += 1;
              }
            } else {
              // En attente de validation (not validated) - add the unpaid amount
              stats.enAttenteValidationMontant += reste;
              if (totalPaid === 0) {
                stats.enAttenteValidationCount += 1;
              }
            }
          }
        });
      }

      console.log('📊 [Dashboard] Stats finales:', {
        totalMontant: stats.totalMontant,
        totalFactures: stats.totalFactures,
        nonPayeeMontant: stats.nonPayeeMontant,
        bonAPayerMontant: stats.bonAPayerMontant,
        payeeMontant: stats.payeeMontant,
        partiellementPayeeMontantTotal: stats.partiellementPayeeMontantTotal,
        echueMontant: stats.echueMontant,
      });

      console.log('📊 [Dashboard] Factures traitées après filtrage:', processedCount, '| Total montant:', stats.totalMontant);

      return stats;
    } catch (err) {
      console.error('Erreur dans dashboardService.getDashboardStats():', err);
      throw err;
    }
  },

  // Get non-paid invoices (not validated)
  async getNonPayeeInvoices(year?: string, region?: string): Promise<Invoice[]> {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "validation DR", "validation DOP", "validation DG", "Facture attachée", "Catégorie de charge", "Niveau urgence", "Région", Devise, "Échéance", "Délais de paiement"');
      
      if (error) throw error;

      // Get all payments
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');
      
      if (paiementsError) throw paiementsError;

      // Create map of payments by invoice number
      const facturesAvecPaiements = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paidAmount = parseFloat(p.montantPaye) || 0;
          const existing = facturesAvecPaiements.get(invoiceNumber) || 0;
          facturesAvecPaiements.set(invoiceNumber, existing + paidAmount);
        });
      }

      return (factures || []).filter((f: any) => {
        const receptionDate = new Date(f['Date de réception']);
        
        // Filter by year if provided
        if (year) {
          if (receptionDate.getFullYear().toString() !== year) {
            return false;
          }
        }

        // Filter by region if provided
        if (region) {
          if (f.Région !== region) {
            return false;
          }
        }

        const montant = parseFloat(f.Montant) || 0;
        const statut = f.Statut?.toLowerCase() || '';
        
        // Exclude rejected invoices
        if (statut.includes('rejet')) return false;

        // Calculate unpaid amount
        const totalPaid = facturesAvecPaiements.get(f['Numéro de facture']) || 0;
        const reste = montant - totalPaid;

        // Return invoices with unpaid amount > 0
        return reste > 0;
      });
    } catch (err) {
      console.error('Erreur dans getNonPayeeInvoices():', err);
      throw err;
    }
  },

  // Get bon à payer invoices (validated but unpaid)
  async getBonAPayerInvoices(year?: string, region?: string): Promise<Invoice[]> {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "validation DR", "validation DOP", "validation DG", "Facture attachée", "Catégorie de charge", "Niveau urgence", "Région", Devise, "Échéance", "Délais de paiement"');
      
      if (error) throw error;

      // Get all payments
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');
      
      if (paiementsError) throw paiementsError;

      // Create map of payments by invoice number
      const facturesAvecPaiements = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paidAmount = parseFloat(p.montantPaye) || 0;
          const existing = facturesAvecPaiements.get(invoiceNumber) || 0;
          facturesAvecPaiements.set(invoiceNumber, existing + paidAmount);
        });
      }

      return (factures || []).filter((f: any) => {
        const receptionDate = new Date(f['Date de réception']);
        
        // Filter by year if provided
        if (year) {
          if (receptionDate.getFullYear().toString() !== year) {
            return false;
          }
        }

        // Filter by region if provided
        if (region) {
          if (f['Région'] !== region) {
            return false;
          }
        }

        const montant = parseFloat(f.Montant) || 0;
        const statut = f.Statut?.toLowerCase() || '';
        
        // Exclude rejected invoices
        if (statut.includes('rejet')) return false;

        // Calculate unpaid amount
        const totalPaid = facturesAvecPaiements.get(f['Numéro de facture']) || 0;
        const reste = montant - totalPaid;

        // Only consider invoices with unpaid amount
        if (reste <= 0) return false;

        // Convert validation fields to boolean
        const drValidated = f['validation DR'] != null && String(f['validation DR']).trim() !== '';
        const dopValidated = f['validation DOP'] != null && String(f['validation DOP']).trim() !== '';
        
        // Règle demandée: seule validation DOP rend la facture validée
        const isValidated = dopValidated;
        
        // Return VALIDATED invoices with unpaid amount (Bon à Payer)
        return isValidated;
      });
    } catch (err) {
      console.error('Erreur dans getBonAPayerInvoices():', err);
      throw err;
    }
  },

  async getEnAttenteValidationInvoices(year?: string, region?: string): Promise<Invoice[]> {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "validation DR", "validation DOP", "validation DG", "Facture attachée", "Catégorie de charge", "Niveau urgence", "Région", Devise, "Échéance", "Délais de paiement"');
      
      if (error) throw error;

      // Get all payments
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');
      
      if (paiementsError) throw paiementsError;

      // Create map of payments by invoice number
      const facturesAvecPaiements = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paidAmount = parseFloat(p.montantPaye) || 0;
          const existing = facturesAvecPaiements.get(invoiceNumber) || 0;
          facturesAvecPaiements.set(invoiceNumber, existing + paidAmount);
        });
      }

      return (factures || []).filter((f: any) => {
        const receptionDate = new Date(f['Date de réception']);
        
        // Filter by year if provided
        if (year) {
          if (receptionDate.getFullYear().toString() !== year) {
            return false;
          }
        }

        // Filter by region if provided
        if (region) {
          if (f['Région'] !== region) {
            return false;
          }
        }

        const montant = parseFloat(f.Montant) || 0;
        const statut = f.Statut?.toLowerCase() || '';
        
        // Exclude rejected invoices
        if (statut.includes('rejet')) return false;

        // Calculate unpaid amount
        const totalPaid = facturesAvecPaiements.get(f['Numéro de facture']) || 0;
        const reste = montant - totalPaid;

        // Only consider invoices with unpaid amount
        if (reste <= 0) return false;

        // Convert validation fields to boolean
        const drValidated = f['validation DR'] != null && String(f['validation DR']).trim() !== '';
        const dopValidated = f['validation DOP'] != null && String(f['validation DOP']).trim() !== '';
        
        // Règle demandée: seule validation DOP rend la facture validée
        const isValidated = dopValidated;
        
        // Return NON-VALIDATED invoices with unpaid amount (En attente de validation)
        return !isValidated;
      });
    } catch (err) {
      console.error('Erreur dans getEnAttenteValidationInvoices():', err);
      throw err;
    }
  },

  // Get fully paid invoices (have at least one payment)
  async getPayeeInvoices(year?: string, region?: string): Promise<Invoice[]> {
    try {
      console.log('=== DEBUG GETPAYEEINVOICES ===');
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Facture attachée", "Catégorie de charge", "Niveau urgence", "Région", Devise, "Échéance", "Délais de paiement"');
      
      if (error) throw error;

      // Charger les paiements
      const { data: paiements } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');

      // Créer une map des paiements
      const facturesAvecPaiements = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture;
          const paid = parseFloat(p.montantPaye) || 0;
          const existing = facturesAvecPaiements.get(invoiceNumber) || 0;
          facturesAvecPaiements.set(invoiceNumber, existing + paid);
        });
      }

      console.log('=== FILTRAGE FACTURES DEBUG ===');
      console.log('Nombre total de factures:', factures?.length || 0);
      
      return (factures || []).filter((f: any) => {
        const receptionDate = new Date(f['Date de réception']);
        const invoiceNumber = f['Numéro de facture'];
        const totalPaid = facturesAvecPaiements.get(invoiceNumber) || 0;
        
        console.log(`Facture: ${invoiceNumber}, totalPaid=${totalPaid}, statut=${f.Statut}, région=${f['Région']}`);
        
        // Filter by year if provided
        if (year) {
          if (receptionDate.getFullYear().toString() !== year) {
            console.log(`  -> Exclue (année): ${receptionDate.getFullYear()} != ${year}`);
            return false;
          }
        }

        // Filter by region if provided
        if (region) {
          if (f['Région'] !== region) {
            console.log(`  -> Exclue (région): ${f['Région']} != ${region}`);
            return false;
          }
        }

        const statut = f.Statut?.toLowerCase() || '';
        
        // Exclude rejected invoices
        if (statut.includes('rejet')) {
          console.log(`  -> Exclue (rejetée): ${f.Statut}`);
          return false;
        }
        
        // Return invoices that have at least one payment (paid amount > 0)
        if (totalPaid > 0) {
          console.log(`  -> INCLUE (payée): ${invoiceNumber}, totalPaid=${totalPaid}`);
          return true;
        } else {
          console.log(`  -> Exclue (non payée): ${invoiceNumber}, totalPaid=${totalPaid}`);
          return false;
        }
      });
    } catch (err) {
      console.error('Erreur dans getPayeeInvoices():', err);
      throw err;
    }
  },

  // Get partially paid invoices
  async getPartiellementPayeeInvoices(year?: string, region?: string): Promise<Invoice[]> {
    try {
      console.log('=== DEBUG GETPARTIELLEMENTPAYEEINVOICES ===');
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Facture attachée", "Catégorie de charge", "Niveau urgence", "Région", Devise, "Échéance", "Délais de paiement"');
      
      if (error) throw error;

      // Charger les paiements
      const { data: paiements } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');

      // Créer une map des paiements
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture;
          const paid = parseFloat(p.montantPaye) || 0;
          const existing = paymentMap.get(invoiceNumber) || 0;
          paymentMap.set(invoiceNumber, existing + paid);
        });
      }

      console.log('=== FILTRAGE FACTURES PARTIELLES DEBUG ===');
      console.log('Nombre total de factures:', factures?.length || 0);
      
      return (factures || []).filter((f: any) => {
        const receptionDate = new Date(f['Date de réception']);
        const montant = parseFloat(f.Montant) || 0;
        const statut = f.Statut?.toLowerCase() || '';
        const invoiceNumber = f['Numéro de facture'];
        const totalPaid = paymentMap.get(invoiceNumber) || 0;
        
        console.log(`Facture partielle: ${invoiceNumber}, montant=${montant}, totalPaid=${totalPaid}, statut=${f.Statut}, région=${f['Région']}`);
        
        // Filter by year if provided
        if (year) {
          if (receptionDate.getFullYear().toString() !== year) {
            console.log(`  -> Exclue (année): ${receptionDate.getFullYear()} != ${year}`);
            return false;
          }
        }

        // Filter by region if provided
        if (region) {
          if (f['Région'] !== region) {
            console.log(`  -> Exclue (région): ${f['Région']} != ${region}`);
            return false;
          }
        }
        
        // Exclude rejected invoices
        if (statut.includes('rejet')) {
          console.log(`  -> Exclue (rejetée): ${f.Statut}`);
          return false;
        }
        
        // Check if partially paid (paid > 0 but < total amount)
        if (totalPaid > 0 && totalPaid < montant) {
          console.log(`  -> INCLUE (partiellement payée): ${invoiceNumber}, totalPaid=${totalPaid}/${montant}`);
          return true;
        } else if (totalPaid >= montant) {
          console.log(`  -> Exclue (totalement payée): ${invoiceNumber}, totalPaid=${totalPaid}>=${montant}`);
          return false;
        } else {
          console.log(`  -> Exclue (non payée): ${invoiceNumber}, totalPaid=${totalPaid}`);
          return false;
        }
      });
    } catch (err) {
      console.error('Erreur dans getPartiellementPayeeInvoices():', err);
      throw err;
    }
  },

  // Get rejected invoices
  async getRejeteesInvoices(year?: string, region?: string): Promise<Invoice[]> {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Facture attachée", "Catégorie de charge", "Niveau urgence", "Région", Devise, "Échéance", "Délais de paiement"');
      
      if (error) throw error;

      return (factures || []).filter((f: any) => {
        const receptionDate = new Date(f['Date de réception']);
        
        // Filter by year if provided
        if (year) {
          if (receptionDate.getFullYear().toString() !== year) {
            return false;
          }
        }

        // Filter by region if provided
        if (region) {
          if (f['Région'] !== region) {
            return false;
          }
        }

        const statut = f.Statut?.toLowerCase() || '';
        return statut.includes('rejet');
      });
    } catch (err) {
      console.error('Erreur dans getRejeteesInvoices():', err);
      throw err;
    }
  },

  // Get overdue invoices (past due date)
  async getOverdueInvoices(year?: string, region?: string): Promise<Invoice[]> {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Échéance", "Facture attachée", "Catégorie de charge", "Délais de paiement", "Région"');
      
      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return (factures || []).filter((f: any) => {
        const receptionDate = new Date(f['Date de réception']);
        
        // Filter by year if provided
        if (year) {
          if (receptionDate.getFullYear().toString() !== year) {
            return false;
          }
        }

        // Filter by region if provided
        if (region) {
          if (f['Région'] !== region) {
            return false;
          }
        }

        const statut = f.Statut?.toLowerCase() || '';
        
        // Exclude rejected invoices
        if (statut.includes('rejet')) return false;
        
        // Check if due date is in the past
        if (f['Échéance']) {
          const dueDate = new Date(f['Échéance']);
          return dueDate < today;
        }
        
        return false;
      });
    } catch (err) {
      console.error('Erreur dans getOverdueInvoices():', err);
      throw err;
    }
  },

  // Get top supplier by total invoice amount
  async getTopSupplier(year?: string, region?: string | null, invoiceType?: string): Promise<TopSupplier | null> {
    try {
      let query = supabase
        .from('FACTURES')
        .select('Fournisseur, Montant, "Date de réception", "Région", "Type de facture"');

      const yearBounds = getYearBounds(year);
      if (yearBounds) {
        query = query
          .gte('"Date de réception"', yearBounds.start)
          .lte('"Date de réception"', yearBounds.end);
      }
      if (region) {
        query = query.eq('"Région"', region);
      }
      if (invoiceType) {
        query = query.eq('"Type de facture"', invoiceType);
      }

      const { data: filtered, error } = await query;
      if (error) throw error;

      if (!filtered || filtered.length === 0) return null;

      // Group by supplier
      const supplierMap = new Map<string, { montant: number; count: number }>();
      
      filtered.forEach((facture: any) => {
        const fournisseur = facture.Fournisseur || 'Unknown';
        const montant = parseFloat(facture.Montant) || 0;
        
        const existing = supplierMap.get(fournisseur) || { montant: 0, count: 0 };
        existing.montant += montant;
        existing.count += 1;
        supplierMap.set(fournisseur, existing);
      });

      // Find top supplier
      let topSupplier: TopSupplier | null = null;
      let maxAmount = 0;

      supplierMap.forEach((data, fournisseur) => {
        if (data.montant > maxAmount) {
          maxAmount = data.montant;
          topSupplier = {
            fournisseur,
            montantTotal: data.montant,
            nombreFactures: data.count,
          };
        }
      });

      return topSupplier;
    } catch (err) {
      console.error('Erreur dans dashboardService.getTopSupplier():', err);
      throw err;
    }
  },

  // Get blocking charges with their invoices
  async getBlockingChargesStats(year?: string, region?: string | null, invoiceType?: string) {
    try {
      // Get all blocking charges
      const { data: charges, error: chargesError } = await supabase
        .from('CHARGES')
        .select('ID, designation_Charges, Bloquant')
        .eq('Bloquant', 'OUI');

      if (chargesError) throw chargesError;

      if (!charges || charges.length === 0) {
        return [];
      }

      // Get all invoices
      let facturesQuery = supabase
        .from('FACTURES')
        .select('ID, "Catégorie de charge", Montant, "Date de réception", "Région", "Numéro de facture", "Type de facture"');

      const yearBounds = getYearBounds(year);
      if (yearBounds) {
        facturesQuery = facturesQuery
          .gte('"Date de réception"', yearBounds.start)
          .lte('"Date de réception"', yearBounds.end);
      }
      if (region) {
        facturesQuery = facturesQuery.eq('"Région"', region);
      }
      if (invoiceType) {
        facturesQuery = facturesQuery.eq('"Type de facture"', invoiceType);
      }

      const { data: factures, error: facturesError } = await facturesQuery;
      if (facturesError) throw facturesError;

      // Get all payments
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');
      
      if (paiementsError) throw paiementsError;

      // Create map of payments by invoice number
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paidAmount = parseFloat(p.montantPaye) || 0;
          const existing = paymentMap.get(invoiceNumber) || 0;
          paymentMap.set(invoiceNumber, existing + paidAmount);
        });
      }

      // Data already filtered at query level.
      let filtered = factures || [];
      console.log('📊 [Charges] Avant filtrage: ', filtered.length, 'factures');

      // Map charges with their invoices
      const chargesStats = charges.map((charge: any) => {
        const invoicesForCharge = filtered.filter((f: any) => 
          f['Catégorie de charge']?.toLowerCase() === charge.designation_Charges.toLowerCase()
        );

        let totalAmount = 0;
        let totalPaid = 0;
        let totalUnpaid = 0;

        invoicesForCharge.forEach((f: any) => {
          const montant = parseFloat(f.Montant) || 0;
          const paid = paymentMap.get(f['Numéro de facture']) || 0;
          const unpaid = montant - paid;

          totalAmount += montant;
          totalPaid += paid;
          totalUnpaid += unpaid;
        });

        return {
          id: charge.ID,
          designation: charge.designation_Charges,
          nombreFactures: invoicesForCharge.length,
          montantTotal: totalAmount,
          montantPaye: totalPaid,
          montantNonPaye: totalUnpaid,
        };
      });

      console.log('📊 [Charges] Stats:', chargesStats);
      return chargesStats;
    } catch (err) {
      console.error('Erreur dans getBlockingChargesStats():', err);
      throw err;
    }
  },

  // Get invoices by urgency level
  async getInvoicesByUrgency(year?: string, region?: string | null, invoiceType?: string) {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, Montant, "Niveau urgence", "Date de réception", "Région", "Type de facture"');

      if (error) throw error;

      const urgencyStats = {
        urgentes: { montant: 0, count: 0 },
        prioritaires: { montant: 0, count: 0 },
        normales: { montant: 0, count: 0 },
      };

      if (factures) {
        factures.forEach((f: any) => {
          // Filter by year if provided
          if (year) {
            const receptionDate = new Date(f['Date de réception']);
            if (receptionDate.getFullYear().toString() !== year) {
              return;
            }
          }
          // Filter by region if provided
          if (region) {
            if (f['Région'] !== region) {
              return;
            }
          }
          if (!matchesInvoiceType(invoiceType, f['Type de facture'])) {
            return;
          }

          const montant = parseFloat(f.Montant) || 0;
          const urgency = f['Niveau urgence']?.toLowerCase() || '';

          if (urgency.includes('haute') || urgency.includes('urgent')) {
            urgencyStats.urgentes.montant += montant;
            urgencyStats.urgentes.count += 1;
          } else if (urgency.includes('moyenne') || urgency.includes('priorit')) {
            urgencyStats.prioritaires.montant += montant;
            urgencyStats.prioritaires.count += 1;
          } else if (urgency.includes('basse') || urgency.includes('normal')) {
            urgencyStats.normales.montant += montant;
            urgencyStats.normales.count += 1;
          }
        });
      }

      console.log('📊 [Urgency] Stats:', urgencyStats);
      return urgencyStats;
    } catch (err) {
      console.error('Erreur dans getInvoicesByUrgency():', err);
      throw err;
    }
  },

  async getInvoicesByAge(year?: string, region?: string | null, invoiceType?: string) {
    try {
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('ID, Montant, "Date de réception", "Numéro de facture", "Région", "Type de facture"');

      if (facturesError) throw facturesError;

      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, datePaiement');

      if (paiementsError) throw paiementsError;

      // Create map of invoice numbers with their last payment date
      const paymentMap = new Map<string, string>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paymentDate = p.datePaiement;
          
          // Keep only the latest payment date for each invoice
          const existing = paymentMap.get(invoiceNumber);
          if (!existing || new Date(paymentDate) > new Date(existing)) {
            paymentMap.set(invoiceNumber, paymentDate);
          }
        });
      }

      const today = new Date();
      const ageStats = {
        zero30: { montant: 0, count: 0 },
        thirty60: { montant: 0, count: 0 },
        sixty90: { montant: 0, count: 0 },
        plus90: { montant: 0, count: 0 },
      };

      if (factures) {
        factures.forEach((f: any) => {
          const receptionDate = new Date(f['Date de réception']);
          
          // Filter by year if provided
          if (year) {
            if (receptionDate.getFullYear().toString() !== year) {
              return;
            }
          }

          // Filter by region if provided
          if (region) {
            if (f['Région'] !== region) {
              return;
            }
          }
          if (!matchesInvoiceType(invoiceType, f['Type de facture'])) {
            return;
          }

          const montant = parseFloat(f.Montant) || 0;
          const invoiceNumber = f['Numéro de facture'];
          
          // Use last payment date if exists, otherwise use today
          const referenceDate = paymentMap.has(invoiceNumber) 
            ? new Date(paymentMap.get(invoiceNumber)!)
            : today;

          // Calculate days between reception and reference date
          const diffTime = referenceDate.getTime() - receptionDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays <= 30) {
            ageStats.zero30.montant += montant;
            ageStats.zero30.count += 1;
          } else if (diffDays <= 60) {
            ageStats.thirty60.montant += montant;
            ageStats.thirty60.count += 1;
          } else if (diffDays <= 90) {
            ageStats.sixty90.montant += montant;
            ageStats.sixty90.count += 1;
          } else {
            ageStats.plus90.montant += montant;
            ageStats.plus90.count += 1;
          }
        });
      }

      console.log('📊 [Age] Stats:', ageStats);
      return ageStats;
    } catch (err) {
      console.error('Erreur dans getInvoicesByAge():', err);
      throw err;
    }
  },

  // Get invoice breakdown by supplier and age
  async getSupplierAgeBreakdown(year?: string, region?: string | null, invoiceType?: string) {
    try {
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('ID, Montant, "Date de réception", Fournisseur, "Numéro de facture", "Région", "Type de facture"');

      if (facturesError) throw facturesError;

      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, datePaiement');

      if (paiementsError) throw paiementsError;

      // Create map of invoice numbers with their last payment date
      const paymentMap = new Map<string, string>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paymentDate = p.datePaiement;
          
          const existing = paymentMap.get(invoiceNumber);
          if (!existing || new Date(paymentDate) > new Date(existing)) {
            paymentMap.set(invoiceNumber, paymentDate);
          }
        });
      }

      const today = new Date();
      const supplierBreakdown = new Map<string, { nonEchu: number; zero30: number; thirty60: number; sixty90: number; plus90: number; total: number }>();

      if (factures) {
        factures.forEach((f: any) => {
          const receptionDate = new Date(f['Date de réception']);
          
          // Filter by year if provided
          if (year) {
            if (receptionDate.getFullYear().toString() !== year) {
              return;
            }
          }

          // Filter by region if provided
          if (region) {
            if (f['Région'] !== region) {
              return;
            }
          }
          if (!matchesInvoiceType(invoiceType, f['Type de facture'])) {
            return;
          }

          const montant = parseFloat(f.Montant) || 0;
          const fournisseur = f.Fournisseur || 'Unknown';
          const invoiceNumber = f['Numéro de facture'];
          
          // Initialize supplier if not exists
          if (!supplierBreakdown.has(fournisseur)) {
            supplierBreakdown.set(fournisseur, { nonEchu: 0, zero30: 0, thirty60: 0, sixty90: 0, plus90: 0, total: 0 });
          }

          const supplier = supplierBreakdown.get(fournisseur)!;
          supplier.total += montant;

          // Calculate age from reception date
          const referenceDate = paymentMap.has(invoiceNumber) 
            ? new Date(paymentMap.get(invoiceNumber)!)
            : today;

          const diffTime = referenceDate.getTime() - receptionDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays <= 30) {
            supplier.zero30 += montant;
          } else if (diffDays <= 60) {
            supplier.thirty60 += montant;
          } else if (diffDays <= 90) {
            supplier.sixty90 += montant;
          } else {
            supplier.plus90 += montant;
          }
        });
      }

      // Convert to array and sort by total
      const result = Array.from(supplierBreakdown.entries())
        .map(([fournisseur, breakdown]) => ({
          fournisseur,
          ...breakdown
        }))
        .sort((a, b) => b.total - a.total);

      console.log('📊 [Supplier Age] Result:', result);
      return result;
    } catch (err) {
      console.error('Erreur dans getSupplierAgeBreakdown():', err);
      throw err;
    }
  },

  // Get invoice statistics by region
  async getStatisticsByRegion(year?: string) {
    try {
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('ID, Montant, "Région", Statut, "Date de réception", "Échéance"');

      if (facturesError) throw facturesError;

      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('montantFacture, montantPaye, datePaiement');

      if (paiementsError) throw paiementsError;

      // Create map of invoice amounts with their payment info
      const paymentMap = new Map<number, { totalPaid: number; lastPaymentDate: string }>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const amount = parseFloat(p.montantFacture) || 0;
          const paid = parseFloat(p.montantPaye) || 0;
          const paymentDate = p.datePaiement;

          const existing = paymentMap.get(amount) || { totalPaid: 0, lastPaymentDate: '' };
          existing.totalPaid += paid;
          if (!existing.lastPaymentDate || new Date(paymentDate) > new Date(existing.lastPaymentDate)) {
            existing.lastPaymentDate = paymentDate;
          }
          paymentMap.set(amount, existing);
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const regionStats = new Map<string, {
        nonPayee: { count: number; montant: number };
        echues: { count: number; montant: number };
        resteAPayer: { count: number; montant: number };
        payees: { count: number; montant: number };
      }>();

      if (factures) {
        factures.forEach((f: any) => {
          const receptionDate = new Date(f['Date de réception']);
          
          // Filter by year if provided
          if (year) {
            if (receptionDate.getFullYear().toString() !== year) {
              return;
            }
          }

          const region = f['Région'] || 'Unknown';
          const montant = parseFloat(f.Montant) || 0;
          const statut = f.Statut || '';

          if (!regionStats.has(region)) {
            regionStats.set(region, {
              nonPayee: { count: 0, montant: 0 },
              echues: { count: 0, montant: 0 },
              resteAPayer: { count: 0, montant: 0 },
              payees: { count: 0, montant: 0 },
            });
          }

          const stats = regionStats.get(region)!;
          const paymentInfo = paymentMap.get(montant) || { totalPaid: 0, lastPaymentDate: '' };
          const totalPaid = paymentInfo.totalPaid;
          const remaining = montant - totalPaid;

          // Factures Non Payée: not validated
          if (statut !== 'Validé') {
            stats.nonPayee.count += 1;
            stats.nonPayee.montant += montant;
          }
          // Factures Échues: overdue (past due date)
          else if (f['Échéance']) {
            const dueDate = new Date(f['Échéance']);
            dueDate.setHours(0, 0, 0, 0);
            if (dueDate < today) {
              stats.echues.count += 1;
              stats.echues.montant += montant;
            }
          }
          // Factures Payées: fully paid
          if (totalPaid >= montant) {
            stats.payees.count += 1;
            stats.payees.montant += montant;
          }
          // Reste à payer: unpaid or partially paid
          if (remaining > 0) {
            stats.resteAPayer.count += 1;
            stats.resteAPayer.montant += remaining;
          }
        });
      }

      // Convert to array and sort by region name
      const result = Array.from(regionStats.entries())
        .map(([region, stats]) => ({ region, ...stats }))
        .sort((a, b) => a.region.localeCompare(b.region));

      console.log('📊 [Region] Stats:', result);
      return result;
    } catch (err) {
      console.error('Erreur dans getStatisticsByRegion():', err);
      throw err;
    }
  },

  // Get bulletin de liquidation statistics
  async getBulletinStats(year?: string, region?: string) {
    try {
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('ID, Montant, "Catégorie de charge", Fournisseur, Statut, "Date de réception", "Numéro de facture", "Région"');

      if (facturesError) throw facturesError;

      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');

      if (paiementsError) throw paiementsError;

      // Create map of invoice numbers with their total paid amounts
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);
        });
      }

      // Filter only "Bulletin de liquidation" invoices and by year if provided
      let bulletinInvoices = (factures || []).filter((f: any) => {
        const categorie = f['Catégorie de charge'] || '';
        return categorie === 'Bulletin de liquidation';
      });

      if (year) {
        bulletinInvoices = bulletinInvoices.filter((f: any) => {
          const receptionDate = new Date(f['Date de réception']);
          return receptionDate.getFullYear().toString() === year;
        });
      }

      // Filter by region if provided
      if (region) {
        bulletinInvoices = bulletinInvoices.filter((f: any) => {
          return f['Région'] === region;
        });
      }

      // Calculate stats
      let totalMontant = 0;
      let totalPaid = 0;
      let totalUnpaid = 0;
      let totalRejected = 0;
      const supplierMap = new Map<string, {
        totalMontant: number;
        totalPaid: number;
        totalUnpaid: number;
        totalRejected: number;
        count: number;
      }>();

      bulletinInvoices.forEach((f: any) => {
        const montant = parseFloat(f.Montant) || 0;
        const fournisseur = f.Fournisseur || 'Unknown';
        const statut = f.Statut || '';
        const invoiceNumber = f['Numéro de facture'];

        // Initialize supplier if not exists
        if (!supplierMap.has(fournisseur)) {
          supplierMap.set(fournisseur, {
            totalMontant: 0,
            totalPaid: 0,
            totalUnpaid: 0,
            totalRejected: 0,
            count: 0,
          });
        }

        const supplier = supplierMap.get(fournisseur)!;
        const paidAmount = paymentMap.get(invoiceNumber) || 0;
        const unpaidAmount = montant - paidAmount;

        totalMontant += montant;
        supplier.totalMontant += montant;
        supplier.count += 1;

        // Check if rejected
        if (statut.toLowerCase().includes('rejet')) {
          totalRejected += montant;
          supplier.totalRejected += montant;
        } else {
          if (paidAmount >= montant) {
            totalPaid += montant;
            supplier.totalPaid += montant;
          } else if (paidAmount > 0) {
            supplier.totalPaid += paidAmount;
            supplier.totalUnpaid += unpaidAmount;
            totalPaid += paidAmount;
            totalUnpaid += unpaidAmount;
          } else {
            totalUnpaid += montant;
            supplier.totalUnpaid += montant;
          }
        }
      });

      const bulletinStats = {
        totalMontant,
        totalPaid,
        totalUnpaid,
        totalRejected,
      };

      const supplierBreakdown = Array.from(supplierMap.entries())
        .map(([fournisseur, data]) => ({
          fournisseur,
          ...data,
        }))
        .sort((a, b) => b.totalMontant - a.totalMontant);

      console.log('📊 [Bulletin] Stats:', { bulletinStats, supplierBreakdown });
      return { bulletinStats, supplierBreakdown };
    } catch (err) {
      console.error('Erreur dans getBulletinStats():', err);
      throw err;
    }
  },

  // Get top 10 suppliers with unpaid invoices
  async getTop10SuppliersWithUnpaidInvoices(year?: string, region?: string, month: string = 'all') {
    try {
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('Fournisseur, Montant, "Numéro de facture", "Date de réception", "Région"');

      if (facturesError) throw facturesError;

      const { data: paiements } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');

      // Create map of invoice numbers with their total paid amounts
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);
        });
      }

      // Group by supplier and count unpaid invoices
      const supplierMap = new Map<string, { count: number; montant: number }>();

      if (factures) {
        factures.forEach((f: any) => {
          const receptionDate = new Date(f['Date de réception']);
          
          // Filter by year if provided
          if (year) {
            if (receptionDate.getFullYear().toString() !== year) {
              return;
            }
          }

          // Filter by region if provided
          if (region) {
            const factureRegion = f['Région'] || 'Unknown';
            if (factureRegion !== region) {
              return;
            }
          }

          // Filter by month if provided
          if (month && month !== 'all') {
            const invoiceMonth = String(receptionDate.getMonth() + 1).padStart(2, '0');
            if (invoiceMonth !== month) {
              return;
            }
          }

          const montant = parseFloat(f.Montant) || 0;
          const fournisseur = f.Fournisseur || 'Unknown';
          const invoiceNumber = f['Numéro de facture'];
          const totalPaid = paymentMap.get(invoiceNumber) || 0;
          const remaining = montant - totalPaid;

          // Only count if there's still amount to pay
          if (remaining > 0.01) {
            const existing = supplierMap.get(fournisseur) || { count: 0, montant: 0 };
            existing.count += 1;
            existing.montant += remaining;
            supplierMap.set(fournisseur, existing);
          }
        });
      }

      // Convert to array, sort by count descending, and take top 10
      const top10 = Array.from(supplierMap.entries())
        .map(([fournisseur, data]) => ({
          fournisseur,
          nombreFactures: data.count,
          montantNonPaye: data.montant,
        }))
        .sort((a, b) => b.nombreFactures - a.nombreFactures)
        .slice(0, 10);

      return top10;
    } catch (err) {
      console.error('Erreur dans getTop10SuppliersWithUnpaidInvoices():', err);
      throw err;
    }
  },

  // Get invoices by urgency with details
  async getInvoicesByUrgencyDetailed(urgencyLevel: string, year?: string, invoiceType?: string): Promise<Invoice[]> {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Niveau urgence", "Facture attachée", "Échéance", "Catégorie de charge", "Délais de paiement", "Type de facture"');

      if (error) throw error;

      return (factures || []).filter((f: any) => {
        const receptionDate = new Date(f['Date de réception']);
        
        // Filter by year if provided
        if (year) {
          if (receptionDate.getFullYear().toString() !== year) {
            return false;
          }
        }
        if (!matchesInvoiceType(invoiceType, f['Type de facture'])) {
          return false;
        }

        const urgency = f['Niveau urgence']?.toLowerCase() || '';
        const urgencyMap: { [key: string]: string[] } = {
          urgentes: ['haute', 'urgent'],
          prioritaires: ['moyenne', 'priorit'],
          normales: ['basse', 'normal'],
        };

        const keywords = urgencyMap[urgencyLevel] || [];
        return keywords.some(k => urgency.includes(k));
      });
    } catch (err) {
      console.error('Erreur dans getInvoicesByUrgencyDetailed():', err);
      throw err;
    }
  },

  // Get invoices by charge category (for operational impact)
  async getInvoicesByChargeCategory(designation: string, year?: string, region?: string | null): Promise<Invoice[]> {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Catégorie de charge", "Facture attachée", "Niveau urgence", "Région", Devise, "Échéance", "Délais de paiement"');

      if (error) throw error;

      return ((factures || [])
        .filter((f: any) => {
          const receptionDate = new Date(f['Date de réception']);
          
          // Filter by year if provided
          if (year) {
            if (receptionDate.getFullYear().toString() !== year) {
              return false;
            }
          }

          // Filter by region if provided
          if (region) {
            if (f['Région'] !== region) {
              return false;
            }
          }

          const categorie = f['Catégorie de charge']?.toLowerCase() || '';
          return categorie.includes(designation.toLowerCase());
        }) as any);
    } catch (err) {
      console.error('Erreur dans getInvoicesByChargeCategory():', err);
      throw err;
    }
  },

  // Get invoices filtered by age range (0-30, 31-60, 61-90, +90 jours)
  async getInvoicesByAgeRange(
    ageRange: 'zero30' | 'thirty60' | 'sixty90' | 'plus90',
    year?: string,
    supplier?: string,
    region?: string | null,
    invoiceType?: string
  ): Promise<Invoice[]> {
    try {
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Catégorie de charge", "Facture attachée", "Niveau urgence", "Région", Devise, "Échéance", "Délais de paiement", "Type de facture"');

      if (facturesError) throw facturesError;

      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, datePaiement');

      if (paiementsError) throw paiementsError;

      // Create map of invoice numbers with their last payment date
      const paymentMap = new Map<string, string>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paymentDate = p.datePaiement;
          
          const existing = paymentMap.get(invoiceNumber);
          if (!existing || new Date(paymentDate) > new Date(existing)) {
            paymentMap.set(invoiceNumber, paymentDate);
          }
        });
      }

      const today = new Date();
      const filtered = (factures || []).filter((f: any) => {
        const receptionDate = new Date(f['Date de réception']);
        
        // Filter by year if provided
        if (year) {
          if (receptionDate.getFullYear().toString() !== year) {
            return false;
          }
        }

        // Filter by supplier if provided
        if (supplier && f.Fournisseur !== supplier) {
          return false;
        }

        // Filter by region if provided
        if (region && f['Région'] !== region) {
          return false;
        }
        if (!matchesInvoiceType(invoiceType, f['Type de facture'])) {
          return false;
        }

        const invoiceNumber = f['Numéro de facture'];
        
        // Calculate age from reception date using payment date or today
        const referenceDate = paymentMap.has(invoiceNumber) 
          ? new Date(paymentMap.get(invoiceNumber)!)
          : today;

        const diffTime = referenceDate.getTime() - receptionDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Filter by age range
        if (ageRange === 'zero30') return diffDays <= 30;
        if (ageRange === 'thirty60') return diffDays > 30 && diffDays <= 60;
        if (ageRange === 'sixty90') return diffDays > 60 && diffDays <= 90;
        if (ageRange === 'plus90') return diffDays > 90;
        
        return false;
      });

      return filtered as any;
    } catch (err) {
      console.error('Erreur dans getInvoicesByAgeRange():', err);
      throw err;
    }
  },

  // Get top 10 suppliers with PAID invoices
  async getTop10SuppliersWithPaidInvoices(year?: string, region?: string) {
    try {
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('Fournisseur, Montant, "Numéro de facture", "Date de réception", "Région"');

      if (facturesError) throw facturesError;

      const { data: paiements } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');

      // Create map of invoice numbers with their total paid amounts
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);
        });
      }

      // Group by supplier and count PAID invoices
      const supplierMap = new Map<string, { count: number; montant: number }>();

      if (factures) {
        factures.forEach((f: any) => {
          const receptionDate = new Date(f['Date de réception']);
          
          // Filter by year if provided
          if (year) {
            if (receptionDate.getFullYear().toString() !== year) {
              return;
            }
          }

          // Filter by region if provided
          if (region && region !== 'all') {
            const factureRegion = f['Région'] || 'Unknown';
            if (factureRegion !== region) {
              return;
            }
          }

          const montant = parseFloat(f.Montant) || 0;
          const fournisseur = f.Fournisseur || 'Unknown';
          const invoiceNumber = f['Numéro de facture'];
          const totalPaid = paymentMap.get(invoiceNumber) || 0;

          // Only count if FULLY paid
          if (totalPaid >= montant - 0.01) {
            const existing = supplierMap.get(fournisseur) || { count: 0, montant: 0 };
            existing.count += 1;
            existing.montant += montant;
            supplierMap.set(fournisseur, existing);
          }
        });
      }

      // Convert to array, sort by count descending, and take top 10
      const top10 = Array.from(supplierMap.entries())
        .map(([fournisseur, data]) => ({
          fournisseur,
          nombreFactures: data.count,
          montantNonPaye: data.montant,
        }))
        .sort((a, b) => b.nombreFactures - a.nombreFactures)
        .slice(0, 10);

      return top10;
    } catch (err) {
      console.error('Erreur dans getTop10SuppliersWithPaidInvoices():', err);
      throw err;
    }
  },

  // Get monthly invoice statistics for the year
  async getMonthlyInvoiceStats(year: string, region?: string | null): Promise<MonthlyInvoiceStats[]> {
    try {
      let facturesQuery = supabase
        .from('FACTURES')
        .select('ID, Montant, "Statut", "Date de réception", "Numéro de facture", "Région"');

      const yearBounds = getYearBounds(year);
      if (yearBounds) {
        facturesQuery = facturesQuery
          .gte('"Date de réception"', yearBounds.start)
          .lte('"Date de réception"', yearBounds.end);
      }
      if (region) {
        facturesQuery = facturesQuery.eq('"Région"', region);
      }

      const { data: factures, error: facturesError } = await facturesQuery;
      if (facturesError) throw facturesError;

      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye, datePaiement');

      if (paiementsError) throw paiementsError;

      // Create map of invoice numbers with their payment info
      const paymentMap = new Map<string, { totalPaid: number; paymentDate: string }>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paid = parseFloat(p.montantPaye) || 0;
          const paymentDate = p.datePaiement;
          
          const existing = paymentMap.get(invoiceNumber) || { totalPaid: 0, paymentDate: '' };
          existing.totalPaid += paid;
          
          // Keep the first payment date
          if (!existing.paymentDate) {
            existing.paymentDate = paymentDate;
          }
          
          paymentMap.set(invoiceNumber, existing);
        });
      }

      // Initialize monthly data for all 12 months
      const monthlyData = new Map<number, {
        totalRecu: number;
        totalPaye: number;
        totalReste: number;
        nombreFactures: number;
        nombreFacturesPayees: number;
        nombreFacturesNonPayees: number;
      }>();
      for (let i = 1; i <= 12; i++) {
        monthlyData.set(i, {
          totalRecu: 0,
          totalPaye: 0,
          totalReste: 0,
          nombreFactures: 0,
          nombreFacturesPayees: 0,
          nombreFacturesNonPayees: 0,
        });
      }

      // Process invoices
      if (factures) {
        factures.forEach((f: any) => {
          const receptionDate = new Date(f['Date de réception']);
          
          const receptionMonth = receptionDate.getMonth() + 1;
          const montant = parseFloat(f.Montant) || 0;
          const invoiceNumber = f['Numéro de facture'];
          const statut = f.Statut?.toLowerCase() || '';
          
          // Skip rejected invoices
          if (statut.includes('rejet')) {
            return;
          }

          // Add to total received for this month
          const monthData = monthlyData.get(receptionMonth)!;
          monthData.totalRecu += montant;
          monthData.nombreFactures += 1;

          // Get payment info
          const paymentInfo = paymentMap.get(invoiceNumber);
          if (paymentInfo) {
            const paymentDate = new Date(paymentInfo.paymentDate);
            
            // If payment date is in the same year
            if (paymentDate.getFullYear().toString() === year) {
              const paymentMonth = paymentDate.getMonth() + 1;
              const paymentMonthData = monthlyData.get(paymentMonth)!;
              paymentMonthData.totalPaye += paymentInfo.totalPaid;
              paymentMonthData.nombreFacturesPayees += 1;
            } else if (new Date(paymentInfo.paymentDate).getFullYear() < parseInt(year)) {
              // If payment was in a previous year, count it in January
              const paymentMonthData = monthlyData.get(1)!;
              paymentMonthData.totalPaye += paymentInfo.totalPaid;
              paymentMonthData.nombreFacturesPayees += 1;
            }
          }
        });
      }

      // Calculate remaining amounts and convert to array
      const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
      const result: MonthlyInvoiceStats[] = [];

      for (let i = 1; i <= 12; i++) {
        const data = monthlyData.get(i)!;
        data.nombreFacturesNonPayees = Math.max(0, data.nombreFactures - data.nombreFacturesPayees);
        result.push({
          month: monthNames[i - 1],
          monthNumber: i,
          totalRecu: Math.round(data.totalRecu),
          totalPaye: Math.round(data.totalPaye),
          totalReste: Math.round(data.totalRecu - data.totalPaye),
          nombreFactures: data.nombreFactures,
          nombreFacturesPayees: data.nombreFacturesPayees,
          nombreFacturesNonPayees: data.nombreFacturesNonPayees,
        });
      }

      console.log('📊 [Monthly] Stats:', result);
      return result;
    } catch (err) {
      console.error('Erreur dans getMonthlyInvoiceStats():', err);
      throw err;
    }
  },

  // Get invoices for a specific supplier with payment status filter
  async getSupplierInvoicesByStatus(supplier: string, status: 'unpaid' | 'paid', year?: string): Promise<Invoice[]> {
    try {
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Facture attachée"');

      if (facturesError) throw facturesError;

      const { data: paiements } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');

      // Create map of invoice numbers with their total paid amounts
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);
        });
      }

      return (factures || []).filter((f: any) => {
        const receptionDate = new Date(f['Date de réception']);
        
        // Filter by year if provided
        if (year) {
          if (receptionDate.getFullYear().toString() !== year) {
            return false;
          }
        }

        // Filter by supplier
        if (f.Fournisseur !== supplier) {
          return false;
        }

        const montant = parseFloat(f.Montant) || 0;
        const invoiceNumber = f['Numéro de facture'];
        const totalPaid = paymentMap.get(invoiceNumber) || 0;

        // Filter by payment status
        if (status === 'paid') {
          return totalPaid >= montant - 0.01;
        } else {
          return totalPaid < montant - 0.01;
        }
      });
    } catch (err) {
      console.error('Erreur dans getSupplierInvoicesByStatus():', err);
      throw err;
    }
  },

  // Get all cost centers with their invoice statistics
  async getCostCentersWithStats(year?: string, invoiceType?: string) {
    try {
      // Load all cost centers from CENTRE_DE_COUT table
      const { data: costCenters, error: centersError } = await supabase
        .from('CENTRE_DE_COUT')
        .select('Designation')
        .order('Designation', { ascending: true });

      if (centersError) throw centersError;

      // Load all invoices
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('ID, "Centre de coût", Montant, "Date de réception", "Numéro de facture", "Type de facture"');

      if (facturesError) throw facturesError;

      // Load all payments
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');
      
      if (paiementsError) throw paiementsError;

      // Create map of payments by invoice number
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paidAmount = parseFloat(p.montantPaye) || 0;
          const existing = paymentMap.get(invoiceNumber) || 0;
          paymentMap.set(invoiceNumber, existing + paidAmount);
        });
      }

      // Create map to store statistics for each cost center
      const statsMap = new Map<string, { montant: number; nombreFactures: number; montantPaye: number; montantNonPaye: number }>();

      // Initialize with all cost centers (showing 0 if no invoices)
      if (costCenters) {
        costCenters.forEach((center: any) => {
          statsMap.set(center.Designation, { montant: 0, nombreFactures: 0, montantPaye: 0, montantNonPaye: 0 });
        });
      }

      // Calculate statistics from invoices
      if (factures) {
        factures.forEach((invoice: any) => {
          const receptionDate = new Date(invoice['Date de réception']);
          
          // Filter by year if provided
          if (year) {
            if (receptionDate.getFullYear().toString() !== year) {
              return;
            }
          }
          if (!matchesInvoiceType(invoiceType, invoice['Type de facture'])) {
            return;
          }

          const costCenter = invoice['Centre de coût'] || 'Non spécifié';
          const montant = parseFloat(invoice.Montant) || 0;
          const paid = paymentMap.get(invoice['Numéro de facture']) || 0;
          const unpaid = montant - paid;

          if (statsMap.has(costCenter)) {
            const existing = statsMap.get(costCenter)!;
            existing.montant += montant;
            existing.nombreFactures += 1;
            existing.montantPaye += paid;
            existing.montantNonPaye += unpaid;
          } else {
            // If cost center doesn't exist in master table but has invoices, add it
            statsMap.set(costCenter, {
              montant,
              nombreFactures: 1,
              montantPaye: paid,
              montantNonPaye: unpaid,
            });
          }
        });
      }

      // Convert to array and sort by montant descending
      const result = Array.from(statsMap.entries()).map(([centre, stats]) => ({
        centre,
        montant: stats.montant,
        nombreFactures: stats.nombreFactures,
        montantPaye: stats.montantPaye,
        montantNonPaye: stats.montantNonPaye,
      })).sort((a, b) => b.montant - a.montant);

      console.log('📊 [Cost Centers] Stats:', result);
      return result;
    } catch (err) {
      console.error('Erreur dans getCostCentersWithStats():', err);
      throw err;
    }
  },

  // Get invoices for a specific cost center
  async getInvoicesByCostCenter(costCenter: string, year?: string, invoiceType?: string): Promise<Invoice[]> {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('ID, "Numéro de facture", Fournisseur, Montant, "Statut", "Date de réception", "Catégorie de charge", "Facture attachée", "Niveau urgence", "Région", Devise, "Échéance", "Délais de paiement", "Centre de coût", "Type de facture"');

      if (error) throw error;

      return ((factures || [])
        .filter((f: any) => {
          const receptionDate = new Date(f['Date de réception']);
          
          // Filter by year if provided
          if (year) {
            if (receptionDate.getFullYear().toString() !== year) {
              return false;
            }
          }
          if (!matchesInvoiceType(invoiceType, f['Type de facture'])) {
            return false;
          }

          const centre = f['Centre de coût'] || 'Non spécifié';
          return centre === costCenter;
        }) as any);
    } catch (err) {
      console.error('Erreur dans getInvoicesByCostCenter():', err);
      throw err;
    }
  },

  // Get all unique regions
  async getRegions(): Promise<string[]> {
    try {
      const { data: factures, error } = await supabase
        .from('FACTURES')
        .select('Région');

      if (error) throw error;

      const regions = new Set<string>();
      if (factures) {
        factures.forEach((f: any) => {
          if (f.Région) {
            regions.add(f.Région);
          }
        });
      }

      return Array.from(regions).sort();
    } catch (err) {
      console.error('Erreur dans getRegions():', err);
      throw err;
    }
  },

  // Get cost centers filtered by region
  async getCostCentersWithStatsByRegion(region: string | null, year?: string, invoiceType?: string) {
    try {
      // Load cost centers from CENTRE_DE_COUT table, filtered by region
      let query = supabase
        .from('CENTRE_DE_COUT')
        .select('ID, Designation, REGION')
        .order('Designation', { ascending: true });

      // Filter by region if provided
      if (region) {
        query = query.eq('REGION', region);
      }

      const { data: costCenters, error: centersError } = await query;

      if (centersError) throw centersError;

      // Load all invoices
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('ID, "Centre de coût", Montant, "Date de réception", "Région", "Numéro de facture", "Type de facture"');

      if (facturesError) throw facturesError;

      // Load all payments
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');
      
      if (paiementsError) throw paiementsError;

      // Create map of payments by invoice number
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture; // Utiliser directement la colonne NumeroFacture
          const paidAmount = parseFloat(p.montantPaye) || 0;
          const existing = paymentMap.get(invoiceNumber) || 0;
          paymentMap.set(invoiceNumber, existing + paidAmount);
        });
      }

      // Create map to store statistics for each cost center
      const statsMap = new Map<string, { montant: number; nombreFactures: number; montantPaye: number; montantNonPaye: number }>();

      // Initialize with all cost centers (showing 0 if no invoices)
      if (costCenters) {
        costCenters.forEach((center: any) => {
          statsMap.set(center.Designation, { montant: 0, nombreFactures: 0, montantPaye: 0, montantNonPaye: 0 });
        });
      }

      // Calculate statistics from invoices
      if (factures) {
        factures.forEach((invoice: any) => {
          const receptionDate = new Date(invoice['Date de réception']);
          
          // Filter by year if provided
          if (year) {
            if (receptionDate.getFullYear().toString() !== year) {
              return;
            }
          }

          // Filter by region if provided
          if (region) {
            const invoiceRegion = invoice['Région'] || '';
            if (invoiceRegion !== region) {
              return;
            }
          }
          if (!matchesInvoiceType(invoiceType, invoice['Type de facture'])) {
            return;
          }

          const costCenter = invoice['Centre de coût'] || 'Non spécifié';
          const montant = parseFloat(invoice.Montant) || 0;
          const paid = paymentMap.get(invoice['Numéro de facture']) || 0;
          const unpaid = montant - paid;

          if (statsMap.has(costCenter)) {
            const existing = statsMap.get(costCenter)!;
            existing.montant += montant;
            existing.nombreFactures += 1;
            existing.montantPaye += paid;
            existing.montantNonPaye += unpaid;
          } else {
            // If cost center doesn't exist in master table but has invoices, add it
            statsMap.set(costCenter, {
              montant,
              nombreFactures: 1,
              montantPaye: paid,
              montantNonPaye: unpaid,
            });
          }
        });
      }

      // Convert to array and sort by montant descending
      const result = Array.from(statsMap.entries()).map(([centre, stats]) => ({
        centre,
        montant: stats.montant,
        nombreFactures: stats.nombreFactures,
        montantPaye: stats.montantPaye,
        montantNonPaye: stats.montantNonPaye,
      })).sort((a, b) => b.montant - a.montant);

      console.log('📊 [Cost Centers by Region] Stats:', result);
      return result;
    } catch (err) {
      console.error('Erreur dans getCostCentersWithStatsByRegion():', err);
      throw err;
    }
  }
};

// ORDRE_PAIEMENT
export interface OrdoPaiement {
  ID?: number;
  NumeroFacture?: string;
  Date_ordre: string;
  facture: string;
  Statut: string;
}

export const ordoPaiementService = {
  // Get or create order for today
  async getOrCreateOrdreForToday(): Promise<OrdoPaiement> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check if order exists for today
      const { data: existingOrder, error: selectError } = await supabase
        .from('ORDRE_PAIEMENT')
        .select('*')
        .eq('Date_ordre', today)
        .single();
      
      if (selectError && selectError.code !== 'PGRST116') {
        // PGRST116 means no rows returned, which is expected
        throw selectError;
      }
      
      if (existingOrder) {
        return existingOrder;
      }
      
      // Create new order for today
      const { data: newOrder, error: insertError } = await supabase
        .from('ORDRE_PAIEMENT')
        .insert([{
          Date_ordre: today,
          facture: '', // Will be updated when invoices are added
          Statut: 'pending'
        }])
        .select()
        .single();
      
      if (insertError) throw insertError;
      return newOrder;
    } catch (err) {
      console.error('Erreur dans getOrCreateOrdreForToday():', err);
      throw err;
    }
  },

  // Add invoice to today's payment order
  async addInvoiceToOrdre(invoice: Invoice): Promise<void> {
    try {
      // Get or create order for today
      const order = await this.getOrCreateOrdreForToday();
      
      // Prepare invoice JSON data with both English and French property names
      const invoiceJson = JSON.stringify({
        // English names
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplier: invoice.supplier,
        amount: invoice.amount,
        currency: invoice.currency,
        receptionDate: invoice.receptionDate,
        dueDate: invoice.dueDate,
        fileNumber: invoice.fileNumber,
        chargeCategory: invoice.chargeCategory,
        region: invoice.region,
        urgencyLevel: invoice.urgencyLevel,
        status: invoice.status,
        validations: invoice.validations,
        file: invoice.file,
        // French names
        'ID': invoice.id,
        'Numéro de facture': invoice.invoiceNumber,
        'Fournisseur': invoice.supplier,
        'Montant': invoice.amount,
        'Devise': invoice.currency,
        'Date de réception': invoice.receptionDate,
        'Échéance': invoice.dueDate,
        'Numéro de dossier': invoice.fileNumber,
        'Catégorie de charge': invoice.chargeCategory,
        'Région': invoice.region,
        'Niveau urgence': invoice.urgencyLevel,
        'Statut': invoice.status,
        'Facture attachée': invoice.file,
        'Centre de coût': invoice.costCenter,
        'Gestionnaire': invoice.manager,
        'Délais de paiement': 0,
        'Payé': 'Non'
      });
      
      // Get existing facture data
      let existingFactures: any[] = [];
      if (order.facture && order.facture.trim()) {
        try {
          existingFactures = JSON.parse(order.facture);
          if (!Array.isArray(existingFactures)) {
            existingFactures = [existingFactures];
          }
        } catch {
          existingFactures = [];
        }
      }
      
      // Add new invoice if not already present
      const invoiceExists = existingFactures.some((f: any) => f.id === invoice.id || f['ID'] === invoice.id);
      if (!invoiceExists) {
        existingFactures.push(JSON.parse(invoiceJson));
      }
      
      // Update order with new factures array
      const { error: updateError } = await supabase
        .from('ORDRE_PAIEMENT')
        .update({
          facture: JSON.stringify(existingFactures),
          NumeroFacture: existingFactures.map((f: any) => f.invoiceNumber || f['Numéro de facture']).join(', ')
        })
        .eq('ID', order.ID);
      
      if (updateError) throw updateError;
      
      console.log('✓ Facture ajoutée à l\'ordre de paiement du jour:', invoice.invoiceNumber);
    } catch (err) {
      console.error('Erreur dans addInvoiceToOrdre():', err);
      throw err;
    }
  },

  // Get today's payment order
  async getTodayOrdre(): Promise<OrdoPaiement | null> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('ORDRE_PAIEMENT')
        .select('*')
        .eq('Date_ordre', today)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data || null;
    } catch (err) {
      console.error('Erreur dans getTodayOrdre():', err);
      throw err;
    }
  },

  // Get all orders
  async getAll(): Promise<OrdoPaiement[]> {
    try {
      const { data, error } = await supabase
        .from('ORDRE_PAIEMENT')
        .select('*')
        .order('Date_ordre', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Erreur dans ordoPaiementService.getAll():', err);
      throw err;
    }
  },

  // Update order status
  async updateStatus(id: number, status: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('ORDRE_PAIEMENT')
        .update({ Statut: status })
        .eq('ID', id);
      
      if (error) throw error;
    } catch (err) {
      console.error('Erreur dans updateStatus():', err);
      throw err;
    }
  },

  // Get all invoice IDs in today's payment order
  async getInvoicesInTodayOrdre(): Promise<number[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('ORDRE_PAIEMENT')
        .select('facture')
        .eq('Date_ordre', today)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      if (!data || !data.facture) {
        return [];
      }
      
      try {
        const factures = JSON.parse(data.facture);
        if (Array.isArray(factures)) {
          return factures.map((f: any) => f.id).filter((id: any) => id !== undefined);
        }
        return [];
      } catch {
        return [];
      }
    } catch (err) {
      console.error('Erreur dans getInvoicesInTodayOrdre():', err);
      return [];
    }
  },

  // Get parsed invoices from an order
  getInvoicesFromOrder(order: OrdoPaiement): Invoice[] {
    try {
      if (!order.facture) {
        return [];
      }
      
      let factures: any[] = [];
      
      // Try to parse as JSON array
      try {
        const parsed = JSON.parse(order.facture);
        factures = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // If JSON.parse fails, return empty array
        console.warn('Could not parse facture JSON:', order.facture);
        return [];
      }

      // Map the parsed data back to Invoice type with default values for missing fields
      return factures.map((f: any) => {
        const invoice: any = {
          // English property names (for Invoice type)
          id: f.id ?? f.ID ?? 0,
          invoiceNumber: f.invoiceNumber ?? f['Numéro de facture'] ?? '',
          supplier: f.supplier ?? f.Fournisseur ?? '',
          receptionDate: f.receptionDate ?? f['Date de réception'] ?? f['Date réception'] ?? '',
          amount: parseFloat(f.amount) || parseFloat(f.Montant) || 0,
          currency: (f.currency ?? f.Devise ?? f.Currency ?? 'USD') as 'USD' | 'CDF' | 'EUR',
          chargeCategory: f.chargeCategory ?? f['Catégorie de charge'] ?? '',
          urgencyLevel: (f.urgencyLevel ?? f['Niveau urgence'] ?? f['Niveau d\'urgence'] ?? 'Basse') as 'Basse' | 'Moyenne' | 'Haute',
          status: (f.status ?? f.Statut ?? 'pending') as 'pending' | 'validated' | 'paid' | 'rejected' | 'overdue' | 'bon-a-payer',
          region: (f.region ?? f.Région ?? 'OUEST') as 'OUEST' | 'SUD' | 'EST' | 'NORD',
          file: f.file ?? f['Facture attachée'] ?? undefined,
          fileNumber: f.fileNumber ?? f['Numéro de dossier'] ?? undefined,
          dueDate: f.dueDate ?? f.Échéance ?? undefined,
          costCenter: f.costCenter ?? f['Centre de coût'] ?? undefined,
          manager: f.manager ?? f.Gestionnaire ?? undefined,
          validations: f.validations ?? 0,
          
          // French property names (for InvoiceDetailModal compatibility)
          'Numéro de facture': f.invoiceNumber ?? f['Numéro de facture'] ?? '',
          'ID': f.id ?? f.ID ?? 0,
          'Fournisseur': f.supplier ?? f.Fournisseur ?? '',
          'Date de réception': f.receptionDate ?? f['Date de réception'] ?? f['Date réception'] ?? '',
          'Montant': (parseFloat(f.amount) || parseFloat(f.Montant) || 0),
          'Devise': (f.currency ?? f.Devise ?? f.Currency ?? 'USD') as 'USD' | 'CDF' | 'EUR',
          'Catégorie de charge': f.chargeCategory ?? f['Catégorie de charge'] ?? '',
          'Niveau urgence': (f.urgencyLevel ?? f['Niveau urgence'] ?? f['Niveau d\'urgence'] ?? 'Basse') as 'Basse' | 'Moyenne' | 'Haute',
          'Statut': (f.status ?? f.Statut ?? 'pending') as 'pending' | 'validated' | 'paid' | 'rejected' | 'overdue' | 'bon-a-payer',
          'Région': (f.region ?? f.Région ?? 'OUEST') as 'OUEST' | 'SUD' | 'EST' | 'NORD',
          'Facture attachée': f.file ?? f['Facture attachée'] ?? undefined,
          'Numéro de dossier': f.fileNumber ?? f['Numéro de dossier'] ?? undefined,
          'Échéance': f.dueDate ?? f.Échéance ?? undefined,
          'Centre de coût': f.costCenter ?? f['Centre de coût'] ?? undefined,
          'Gestionnaire': f.manager ?? f.Gestionnaire ?? undefined,
          'Délais de paiement': f.delaisPayment ?? f['Délais de paiement'] ?? 0
        };
        
        return invoice;
      });
    } catch (err) {
      console.error('Erreur dans getInvoicesFromOrder():', err);
      return [];
    }
  },

  // Update invoice paid status in an order
  async updateInvoicePaidStatus(ordoPaiementId: number, invoiceNumber: string, montantPaye: number): Promise<void> {
    try {
      // Get the current order
      const { data: order, error: fetchError } = await supabase
        .from('ORDRE_PAIEMENT')
        .select('facture')
        .eq('ID', ordoPaiementId)
        .single();
      
      if (fetchError || !order) {
        throw new Error('Ordre de paiement non trouvé');
      }

      // Parse the facture JSON
      let factures: any[] = [];
      try {
        const parsed = JSON.parse(order.facture);
        factures = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        console.error('Erreur parsing facture JSON:', order.facture);
        return;
      }

      // Find and update the invoice
      let updated = false;
      const updatedFactures = factures.map((f: any) => {
        if (f.invoiceNumber === invoiceNumber || f['Numéro de facture'] === invoiceNumber) {
          updated = true;
          return {
            ...f,
            Payé: 'Oui',
            paid: true,
            montantPaye: montantPaye
          };
        }
        return f;
      });

      if (updated) {
        // Update the order with the new facture JSON
        const { error: updateError } = await supabase
          .from('ORDRE_PAIEMENT')
          .update({ facture: JSON.stringify(updatedFactures) })
          .eq('ID', ordoPaiementId);
        
        if (updateError) {
          throw new Error('Erreur lors de la mise à jour de l\'ordre de paiement: ' + updateError.message);
        }
        
        console.log(`✓ Facture ${invoiceNumber} marquée comme payée dans l'ordre ${ordoPaiementId}`);
      }
    } catch (err) {
      console.error('Erreur dans updateInvoicePaidStatus():', err);
      throw err;
    }
  }
};

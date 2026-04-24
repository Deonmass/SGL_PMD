export type InvoiceStatus = 'pending' | 'validated' | 'paid' | 'rejected' | 'overdue' | 'bon-a-payer';
export type Currency = 'USD' | 'CDF' | 'EUR';
export type UrgencyLevel = 'Basse' | 'Moyenne' | 'Haute';

export interface Invoice {
  id: number;
  invoiceNumber: string;
  supplier: string;
  receptionDate: string;
  amount: number;
  currency: Currency;
  chargeCategory: string; // Correspond à la colonne FACTURES."Catégorie de charge"
  urgencyLevel: UrgencyLevel;
  status: InvoiceStatus;
  region: 'OUEST' | 'SUD' | 'EST' | 'NORD';
  file?: string;
  validations?: number;
  
  // Champs supplémentaires pour le formulaire complet
  emissionDate?: string;
  supplierCategory?: string;
  costCenter?: string;
  manager?: string;
  invoiceType?: string;
  fileNumber?: string;
  motif?: string;
  exchangeRate?: number;
  paymentDelay?: string | number;
  dueDate?: string;
  paymentMode?: string;
  attachedInvoiceUrl?: string;
  comments?: string;
  created_by?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export interface Agent {
  ID: number;
  Nom: string;
  email: string;
  Role: string;
  REGION: string;
  signature?: string | null;
  Derniere_connexion: string | null;
  statut: 'Actif' | 'Inactif';
  Mot_de_passe?: string;
  permission?: Record<string, unknown>;
  Date_creation?: string;
}

export interface StatData {
  label: string;
  value: number;
  currency: string;
  color: string;
  bgColor: string;
}

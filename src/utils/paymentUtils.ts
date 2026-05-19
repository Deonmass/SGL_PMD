import { supabase } from '../services/supabase';

export interface PaymentInfo {
  invoiceNumber: string;
  totalPaid: number;
  hasPayment: boolean;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
}

/**
 * Charge les informations de paiement pour une facture spécifique
 * @param invoiceNumber - Numéro de la facture
 * @returns Promise<PaymentInfo> - Informations de paiement
 */
export async function getPaymentInfo(invoiceNumber: string): Promise<PaymentInfo> {
  try {
    const { data: paiements, error } = await supabase
      .from('PAIEMENTS')
      .select('montantPaye')
      .eq('NumeroFacture', invoiceNumber);

    if (error) {
      console.error('Erreur lors du chargement des paiements:', error);
      return {
        invoiceNumber,
        totalPaid: 0,
        hasPayment: false,
        isFullyPaid: false,
        isPartiallyPaid: false
      };
    }

    const totalPaid = (paiements || []).reduce((sum, p) => {
      return sum + (parseFloat(p.montantPaye) || 0);
    }, 0);

    const hasPayment = totalPaid > 0;

    return {
      invoiceNumber,
      totalPaid,
      hasPayment,
      isFullyPaid: false, // Sera déterminé en fonction du montant de la facture
      isPartiallyPaid: hasPayment
    };
  } catch (err) {
    console.error('Erreur dans getPaymentInfo:', err);
    return {
      invoiceNumber,
      totalPaid: 0,
      hasPayment: false,
      isFullyPaid: false,
      isPartiallyPaid: false
    };
  }
}

/**
 * Charge les informations de paiement pour plusieurs factures
 * @param invoiceNumbers - Tableau des numéros de facture
 * @returns Promise<Map<string, PaymentInfo>> - Map des informations de paiement
 */
export async function getPaymentsInfo(invoiceNumbers: string[]): Promise<Map<string, PaymentInfo>> {
  try {
    const { data: paiements, error } = await supabase
      .from('PAIEMENTS')
      .select('NumeroFacture, montantPaye')
      .in('NumeroFacture', invoiceNumbers);

    if (error) {
      console.error('Erreur lors du chargement des paiements multiples:', error);
      return new Map();
    }

    const paymentMap = new Map<string, PaymentInfo>();

    // Initialiser toutes les factures sans paiement
    invoiceNumbers.forEach(invoiceNumber => {
      paymentMap.set(invoiceNumber, {
        invoiceNumber,
        totalPaid: 0,
        hasPayment: false,
        isFullyPaid: false,
        isPartiallyPaid: false
      });
    });

    // Ajouter les informations de paiement
    if (paiements) {
      paiements.forEach((p: any) => {
        const invoiceNumber = p.NumeroFacture;
        const paidAmount = parseFloat(p.montantPaye) || 0;
        
        if (invoiceNumber && paymentMap.has(invoiceNumber)) {
          const current = paymentMap.get(invoiceNumber)!;
          current.totalPaid += paidAmount;
          current.hasPayment = current.totalPaid > 0;
          current.isPartiallyPaid = current.totalPaid > 0;
        }
      });
    }

    return paymentMap;
  } catch (err) {
    console.error('Erreur dans getPaymentsInfo:', err);
    return new Map();
  }
}

/**
 * Charge tous les paiements et retourne une map des montants payés par facture
 * @returns Promise<Map<string, number>> - Map des montants payés
 */
export async function getAllPaymentsMap(): Promise<Map<string, number>> {
  try {
    console.log('=== CHARGEMENT TOUS LES PAIEMENTS ===');
    const { data: paiements, error } = await supabase
      .from('PAIEMENTS')
      .select('NumeroFacture, montantPaye');

    if (error) {
      console.error('Erreur lors du chargement de tous les paiements:', error);
      return new Map();
    }

    console.log('Nombre de paiements trouvés:', paiements?.length || 0);

    const paymentMap = new Map<string, number>();
    
    if (paiements) {
      paiements.forEach((p: any) => {
        const invoiceNumber = p.NumeroFacture;
        const paidAmount = parseFloat(p.montantPaye) || 0;
        
        console.log(`Paiement: NumeroFacture="${invoiceNumber}", montant=${paidAmount}`);
        
        if (invoiceNumber && paidAmount > 0) {
          const existing = paymentMap.get(invoiceNumber) || 0;
          paymentMap.set(invoiceNumber, existing + paidAmount);
        }
      });
    }
    
    console.log('Factures avec paiements finales:', Array.from(paymentMap.keys()));
    return paymentMap;
  } catch (err) {
    console.error('Erreur dans getAllPaymentsMap:', err);
    return new Map();
  }
}

/**
 * Vérifie si une facture a des paiements
 * @param invoiceNumber - Numéro de la facture
 * @returns Promise<boolean> - True si la facture a des paiements
 */
export async function hasPayment(invoiceNumber: string): Promise<boolean> {
  const paymentInfo = await getPaymentInfo(invoiceNumber);
  return paymentInfo.hasPayment;
}

/**
 * Calcule le statut de paiement d'une facture
 * @param invoiceNumber - Numéro de la facture
 * @param invoiceAmount - Montant de la facture
 * @returns Promise<{
 *   hasPayment: boolean;
 *   isFullyPaid: boolean;
 *   isPartiallyPaid: boolean;
 *   remainingAmount: number;
 * }>
 */
export async function getPaymentStatus(invoiceNumber: string, invoiceAmount: number): Promise<{
  hasPayment: boolean;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
  remainingAmount: number;
}> {
  const paymentInfo = await getPaymentInfo(invoiceNumber);
  
  return {
    hasPayment: paymentInfo.hasPayment,
    isFullyPaid: paymentInfo.totalPaid >= invoiceAmount,
    isPartiallyPaid: paymentInfo.hasPayment && paymentInfo.totalPaid < invoiceAmount,
    remainingAmount: Math.max(0, invoiceAmount - paymentInfo.totalPaid)
  };
}

import { useAuth } from '../contexts/AuthContext';

export function usePermission() {
  const { agent } = useAuth();

  // Fonction pour rechercher récursivement dans l'objet permissions
  const searchPermissionRecursive = (obj: any, targetKey: string, targetAction: string): boolean => {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    // Chercher la clé en ignorant la casse
    for (const key in obj) {
      if (key.toLowerCase() === targetKey.toLowerCase()) {
        const value = obj[key];
        if (typeof value === 'object' && value !== null) {
          // Chercher l'action dans ce sous-objet
          for (const actionKey in value) {
            if (actionKey.toLowerCase() === targetAction.toLowerCase()) {
              return value[actionKey] === true;
            }
          }
        }
      }

      // Récursion pour les sous-objets
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const result = searchPermissionRecursive(obj[key], targetKey, targetAction);
        if (result) {
          return true;
        }
      }
    }

    return false;
  };

  // Parse des permissions
  const getPermissions = () => {
    if (!agent?.permission) {
      console.warn('No permission data found for agent:', agent);
      return null;
    }
    try {
      let perms = agent.permission;
      if (typeof perms === 'string') {
        perms = JSON.parse(perms);
      }
      return perms;
    } catch (err) {
      console.error('Error parsing permissions:', err, 'Raw permission:', agent.permission);
      return null;
    }
  };

  // Vérifier une permission spécifique
  const hasPermission = (menu: string, action: string): boolean => {
    const perms = getPermissions();
    if (!perms) return false;
    return searchPermissionRecursive(perms, menu, action);
  };

  // Vérifier si l'utilisateur peut voir un menu
  const canView = (menu: string): boolean => {
    return hasPermission(menu, 'voir');
  };

  // Vérifier si l'utilisateur peut créer
  const canCreate = (menu: string): boolean => {
    return hasPermission(menu, 'creer');
  };

  // Vérifier si l'utilisateur peut modifier
  const canEdit = (menu: string): boolean => {
    return hasPermission(menu, 'modifier');
  };

  // Vérifier si l'utilisateur peut supprimer
  const canDelete = (menu: string): boolean => {
    return hasPermission(menu, 'supprimer');
  };

  // Vérifier si l'utilisateur peut valider
  const canValidate = (menu: string): boolean => {
    return hasPermission(menu, 'valider');
  };

  // Vérifier si c'est un validateur DR
  const isValidatorDR = (region?: string): boolean => {
    return hasPermission('factures_pending_dr', 'valider');
  };

  // Vérifier si c'est un validateur DOP
  const isValidatorDOP = (): boolean => {
    return hasPermission('factures_pending_dop', 'valider');
  };

  // Vérifier si l'utilisateur peut rejeter au niveau DR
  const canRejectDR = (): boolean => {
    return hasPermission('factures_pending_dr', 'rejeter');
  };

  // Vérifier si l'utilisateur peut rejeter au niveau DOP
  const canRejectDOP = (): boolean => {
    return hasPermission('factures_pending_dop', 'rejeter');
  };

  // Vérifier si l'utilisateur peut voir les validations DR
  const canViewDR = (): boolean => {
    return hasPermission('factures_pending_dr', 'voir');
  };

  // Vérifier si l'utilisateur peut voir les validations DOP
  const canViewDOP = (): boolean => {
    return hasPermission('factures_pending_dop', 'voir');
  };

  // Vérifier si un onglet de factures est visible selon la région
  const canViewInvoiceTab = (tabId: string): boolean => {
    // D'abord vérifier si l'utilisateur a la permission de voir les factures
    if (!hasPermission('factures', 'voir')) {
      return false;
    }

    // Pour les onglets de validation, vérifier soit la permission "voir" spécifique soit les permissions de validateur
    if (tabId === 'factures-pending') {
      return hasPermission('factures_pending_dr', 'voir') || isValidatorDR(agent?.REGION || '');
    }
    if (tabId === 'factures-ffg-pending') {
      return hasPermission('factures_ffg_pending_dr', 'voir') || isValidatorDR(agent?.REGION || '');
    }
    // Si c'est un onglet DOP, vérifier soit la permission "voir" soit dop_tout
    if (tabId === 'factures-pending-dop') {
      return hasPermission('factures_pending_dop', 'voir') || isValidatorDOP();
    }
    if (tabId === 'factures-ffg-pending-dop') {
      return hasPermission('factures_ffg_pending_dop', 'voir') || isValidatorDOP();
    }
    // Les autres onglets sont visibles si l'utilisateur a accès aux factures
    return hasPermission('factures', 'voir');
  };

  // Obtenir toutes les permissions
  const getAllPermissions = () => {
    return getPermissions();
  };

  // Vérifier si l'utilisateur peut marquer une facture comme payée
  const canMarkAsPaid = (scope: 'operationnel' | 'frais-generaux' = 'operationnel'): boolean => {
    const paymentOrderMenu = scope === 'frais-generaux' ? 'factures_ffg_payment_order' : 'factures_payment_order';
    const invoiceMenu = scope === 'frais-generaux' ? 'factures_ffg' : 'factures';
    return hasPermission(paymentOrderMenu, 'marquer_payee') || hasPermission(invoiceMenu, 'marquer_payee');
  };

  const canEstablishPaymentOrder = (scope: 'operationnel' | 'frais-generaux' = 'operationnel'): boolean => {
    const validatedMenu = scope === 'frais-generaux' ? 'factures_ffg_validated' : 'factures_validated';
    const paymentOrderMenu = scope === 'frais-generaux' ? 'factures_ffg_payment_order' : 'factures_payment_order';
    const invoiceMenu = scope === 'frais-generaux' ? 'factures_ffg' : 'factures';
    return hasPermission(validatedMenu, 'establir_op') ||
      hasPermission(paymentOrderMenu, 'establir_op') ||
      hasPermission(invoiceMenu, 'establir_op');
  };

  return {
    hasPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canValidate,
    isValidatorDR,
    isValidatorDOP,
    canRejectDR,
    canRejectDOP,
    canViewDR,
    canViewDOP,
    canMarkAsPaid,
    canEstablishPaymentOrder,
    canViewInvoiceTab,
    getAllPermissions
  };
}

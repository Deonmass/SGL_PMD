import { useCallback, useEffect } from 'react';

/**
 * Émetteur d'événements pour mettre à jour les données à travers l'application
 * Permet de dire aux composants de se mettre à jour sans prop drilling
 */
class DataRefreshEmitter {
  private listeners: Map<string, Set<() => void>> = new Map();

  /**
   * S'abonner à un événement de rafraîchissement
   */
  subscribe(eventName: string, callback: () => void): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName)!.add(callback);

    // Retourner une fonction de désinscription
    return () => {
      this.listeners.get(eventName)?.delete(callback);
    };
  }

  /**
   * Émettre un événement de rafraîchissement
   */
  emit(eventName: string) {
    console.log(`🔄 Émission de l'événement: ${eventName}`);
    this.listeners.get(eventName)?.forEach((callback) => {
      try {
        callback();
      } catch (err) {
        console.error(`Erreur lors du rafraîchissement ${eventName}:`, err);
      }
    });
  }

  /**
   * Émettre plusieurs événements à la fois
   */
  emitMultiple(eventNames: string[]) {
    eventNames.forEach((name) => this.emit(name));
  }
}

export const dataRefreshEmitter = new DataRefreshEmitter();

/**
 * Hook pour écouter les événements de rafraîchissement
 */
export function useDataRefresh(eventName: string, callback: () => void) {
  // Utiliser useCallback pour éviter les modifications inutiles
  const memoizedCallback = useCallback(callback, [callback]);

  useEffect(() => {
    const unsubscribe = dataRefreshEmitter.subscribe(eventName, memoizedCallback);
    return unsubscribe;
  }, [eventName, memoizedCallback]);
}

/**
 * Hook pour rafraîchir plusieurs événements
 */
export function useDataRefreshMultiple(
  eventNames: string[],
  callback: () => void
) {
  const memoizedCallback = useCallback(callback, [callback]);

  useEffect(() => {
    const unsubscribes = eventNames.map((eventName) =>
      dataRefreshEmitter.subscribe(eventName, memoizedCallback)
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [eventNames, memoizedCallback]);
}

// Événements disponibles
export const REFRESH_EVENTS = {
  // Dashboard
  DASHBOARD_STATS: 'dashboard_stats',
  DASHBOARD_INVOICES: 'dashboard_invoices',
  
  // Invoices
  INVOICES_LIST: 'invoices_list',
  INVOICES_DETAIL: 'invoices_detail',
  
  // Payments
  PAYMENTS_LIST: 'payments_list',
  PAYMENTS_DETAIL: 'payments_detail',
  
  // Validation
  VALIDATION_DATA: 'validation_data',
  
  // Parameters
  SUPPLIERS: 'suppliers',
  CHARGES: 'charges',
  AGENTS: 'agents',
  COST_CENTERS: 'cost_centers',
  CAISSES: 'caisses',
  COMPTES: 'comptes',
  
  // Generic
  ALL: 'all_data',
};

/**
 * Rafraîchir les données du dashboard
 */
export function refreshDashboard() {
  dataRefreshEmitter.emitMultiple([
    REFRESH_EVENTS.DASHBOARD_STATS,
    REFRESH_EVENTS.DASHBOARD_INVOICES,
  ]);
}

/**
 * Rafraîchir toutes les données
 */
export function refreshAllData() {
  dataRefreshEmitter.emit(REFRESH_EVENTS.ALL);
  // Émettre aussi les événements spécifiques
  Object.values(REFRESH_EVENTS).forEach((event) => {
    if (event !== REFRESH_EVENTS.ALL) {
      dataRefreshEmitter.emit(event);
    }
  });
}

/**
 * Rafraîchir les données quand un modal se ferme
 */
export function onModalClose(eventsToRefresh: string[] = []) {
  if (eventsToRefresh.length === 0) {
    refreshAllData();
  } else {
    dataRefreshEmitter.emitMultiple(eventsToRefresh);
  }
}

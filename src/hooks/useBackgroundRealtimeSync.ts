import { useCallback, useRef } from 'react';
import { useRealtimeDataMultiple } from './useRealtimeData';
import { refreshAllData } from './useDataRefresh';

/**
 * Synchronisation globale en arrière-plan:
 * - écoute les tables critiques (FACTURES, PAIEMENTS)
 * - propage un refresh global dans l'application
 * - debounce pour éviter les rafraîchissements en rafale
 */
export function useBackgroundRealtimeSync() {
  const debounceRef = useRef<number | null>(null);

  const scheduleGlobalRefresh = useCallback(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      refreshAllData();
    }, 250);
  }, []);

  useRealtimeDataMultiple([
    {
      name: 'FACTURES',
      options: {
        onInsert: scheduleGlobalRefresh,
        onUpdate: scheduleGlobalRefresh,
        onDelete: scheduleGlobalRefresh,
      },
    },
    {
      name: 'PAIEMENTS',
      options: {
        onInsert: scheduleGlobalRefresh,
        onUpdate: scheduleGlobalRefresh,
        onDelete: scheduleGlobalRefresh,
      },
    },
  ]);
}

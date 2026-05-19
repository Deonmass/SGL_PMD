import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';

interface RealtimeOptions {
  onInsert?: () => void;
  onUpdate?: () => void;
  onDelete?: () => void;
}

/**
 * Hook pour écouter les changements en temps réel dans les tables Supabase
 * et exécuter des callbacks lors de modifications
 */
export function useRealtimeData(
  tableName: string,
  options: RealtimeOptions = {}
) {
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    // S'abonner aux changements de la table
    subscriptionRef.current = supabase
      .channel(`public:${tableName}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: tableName,
        },
        () => {
          console.log(`✓ Nouveau ${tableName} détecté`);
          options.onInsert?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: tableName,
        },
        () => {
          console.log(`✓ ${tableName} modifié détecté`);
          options.onUpdate?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: tableName,
        },
        () => {
          console.log(`✓ ${tableName} supprimé détecté`);
          options.onDelete?.();
        }
      )
      .subscribe();

    return () => {
      // Désabonner quand le composant se démonte
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [tableName, options]);
}

/**
 * Hook pour écouter plusieurs tables en même temps
 */
export function useRealtimeDataMultiple(
  tables: { name: string; options?: RealtimeOptions }[]
) {
  const subscriptionsRef = useRef<any[]>([]);

  useEffect(() => {
    subscriptionsRef.current = tables.map(({ name, options = {} }) => {
      return supabase
        .channel(`public:${name}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: name,
          },
          (payload: any) => {
            console.log(`✓ Changement détecté dans ${name}:`, payload.eventType);
            
            if (payload.eventType === 'INSERT') {
              options.onInsert?.();
            } else if (payload.eventType === 'UPDATE') {
              options.onUpdate?.();
            } else if (payload.eventType === 'DELETE') {
              options.onDelete?.();
            }
          }
        )
        .subscribe();
    });

    return () => {
      // Désabonner tous
      subscriptionsRef.current.forEach((subscription) => {
        supabase.removeChannel(subscription);
      });
    };
  }, [tables]);
}

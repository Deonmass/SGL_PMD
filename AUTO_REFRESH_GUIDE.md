# Guide de Rafraîchissement Automatique des Données

## 🎯 Vue d'ensemble

Le système de rafraîchissement automatique fonctionne en deux modes:

1. **Temps réel Supabase Realtime** - Écoute les changements directement dans la base de données
2. **Événements d'application** - Système d'émetteur d'événements pour rafraîchir manuellement depuis le code

---

## 📡 1. Temps Réel Supabase (Automatique)

### Comment ça marche

- Le Dashboard écoute automatiquement les tables `FACTURES` et `PAIEMENTS`
- Quand il y a un INSERT/UPDATE/DELETE, les données se rafraîchissent automatiquement
- **Zéro code à ajouter** - c'est transparent!

### Utilisation dans vos composants

```tsx
import { useRealtimeData } from '../hooks/useRealtimeData';

function MyComponent() {
  // Écouter une seule table
  useRealtimeData('FACTURES', {
    onInsert: () => console.log('Nouvelle facture!'),
    onUpdate: () => console.log('Facture modifiée!'),
    onDelete: () => console.log('Facture supprimée!'),
  });

  return <div>Composant avec écoute temps réel</div>;
}
```

### Écouter plusieurs tables

```tsx
import { useRealtimeDataMultiple } from '../hooks/useRealtimeData';

function MyComponent() {
  useRealtimeDataMultiple([
    {
      name: 'FACTURES',
      options: {
        onUpdate: () => loadFacures(),
      },
    },
    {
      name: 'PAIEMENTS',
      options: {
        onInsert: () => loadPayments(),
      },
    },
  ]);

  return <div>...</div>;
}
```

---

## 🔄 2. Rafraîchissement Manuel (Événements d'Application)

### Événements disponibles

```tsx
import { REFRESH_EVENTS } from '../hooks/useDataRefresh';

// Événements:
REFRESH_EVENTS.DASHBOARD_STATS         // Stats du dashboard
REFRESH_EVENTS.DASHBOARD_INVOICES      // Factures du dashboard
REFRESH_EVENTS.INVOICES_LIST          // Liste des factures
REFRESH_EVENTS.INVOICES_DETAIL        // Détail d'une facture
REFRESH_EVENTS.PAYMENTS_LIST          // Liste des paiements
REFRESH_EVENTS.PAYMENTS_DETAIL        // Détail d'un paiement
REFRESH_EVENTS.VALIDATION_DATA        // Données de validation
REFRESH_EVENTS.SUPPLIERS              // Fournisseurs
REFRESH_EVENTS.CHARGES                // Charges
REFRESH_EVENTS.AGENTS                 // Agents
REFRESH_EVENTS.COST_CENTERS           // Centres de coûts
REFRESH_EVENTS.CAISSES                // Caisses
REFRESH_EVENTS.COMPTES                // Comptes
REFRESH_EVENTS.ALL                    // Tout rafraîchir
```

### Écouter un événement de rafraîchissement

```tsx
import { useDataRefresh, REFRESH_EVENTS } from '../hooks/useDataRefresh';

function MyComponent() {
  // S'abonner à un événement
  useDataRefresh(REFRESH_EVENTS.PAYMENTS_LIST, () => {
    console.log('Les paiements ont été modifiés!');
    loadPayments();
  });

  return <div>Composant qui réagit aux changements</div>;
}
```

### Émettre un événement de rafraîchissement

```tsx
import { refreshAllData, dataRefreshEmitter, REFRESH_EVENTS } from '../hooks/useDataRefresh';

// Rafraîchir uniquement les stats du dashboard
dataRefreshEmitter.emit(REFRESH_EVENTS.DASHBOARD_STATS);

// Rafraîchir plusieurs événements
dataRefreshEmitter.emitMultiple([
  REFRESH_EVENTS.DASHBOARD_STATS,
  REFRESH_EVENTS.PAYMENTS_LIST,
]);

// Rafraîchir tout
refreshAllData();
```

---

## 🎯 3. Quand un Modal se Ferme

### Exemple: PaiementModal

Quand un utilisateur ajoute un paiement et ferme le modal, les données doivent se rafraîchir.

```tsx
import { refreshAllData } from '../hooks/useDataRefresh';

function PaiementModal({ invoice, onClose, onSuccess }) {
  const handleClose = useCallback(() => {
    // Rafraîchir les données avant de fermer
    refreshAllData();
    // Puis fermer le modal
    onClose();
  }, [onClose]);

  // Utiliser handleClose au lieu de onClose
  return (
    <button onClick={handleClose}>Fermer</button>
  );
}
```

---

## 📋 Checklist: Ajouter le Rafraîchissement à un Modal

- [ ] Importer `refreshAllData` depuis `../hooks/useDataRefresh`
- [ ] Créer un wrapper `handleClose` qui appelle `refreshAllData()` puis `onClose()`
- [ ] Remplacer tous les `onClick={onClose}` par `onClick={handleClose}`
- [ ] Remplacer tous les `onClose()` par `refreshAllData(); onClose();` dans les callbacks
- [ ] Tester que les données se rafraîchissent après l'action

---

## 🔧 Modaux qui doivent être mis à jour

1. ✅ **PaiementModal** - FAIT
2. ❌ **InvoiceDetailModal** - À faire
3. ❌ **ViewInvoiceModal** - À faire
4. ❌ **EditInvoiceForm** - À faire
5. ❌ **Top10SuppliersModal** - À faire
6. ❌ **AgentModal** - À faire
7. ❌ **FournisseurModal** - À faire
8. ❌ **ChargeModal** - À faire
9. ❌ **CompteModal** - À faire
10. ❌ **CaisseModal** - À faire
11. ❌ **CentreDeCoutModal** - À faire

---

## 🧪 Test du Système

### Tester le temps réel

1. Ouvrir deux onglets du navigateur avec l'application
2. Ajouter une nouvelle facture dans l'onglet 1
3. Vérifier que le dashboard de l'onglet 2 se rafraîchit automatiquement
4. Vérifier la console pour les logs de rafraîchissement

### Tester les événements manuels

1. Ajouter un paiement dans un modal
2. Fermer le modal
3. Vérifier que le dashboard se rafraîchit
4. Vérifier la console pour `🔄 Émission de l'événement`

---

## 🐛 Dépannage

### Les données ne se rafraîchissent pas automatiquement

- ✅ Vérifier que Realtime est activé dans Supabase
- ✅ Vérifier les logs dans la console (chercher "✓ Changement détecté")
- ✅ Vérifier que le composant n'est pas démontés trop tôt

### Les données ne se rafraîchissent pas après fermer un modal

- ✅ Vérifier que `handleClose` est utilisé au lieu de `onClose`
- ✅ Vérifier que `refreshAllData()` est appelé avant `onClose()`
- ✅ Vérifier les logs de rafraîchissement dans la console

### Trop de rafraîchissements

- ✅ Utiliser des événements spécifiques au lieu de `refreshAllData()`
- ✅ Exemple: `dataRefreshEmitter.emit(REFRESH_EVENTS.PAYMENTS_LIST)` au lieu de `refreshAllData()`

---

## 📚 Ressources

- `src/hooks/useRealtimeData.ts` - Hooks pour le temps réel
- `src/hooks/useDataRefresh.ts` - Système d'événements
- `src/pages/Dashboard.tsx` - Exemple complet d'implémentation

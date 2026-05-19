# Configuration de la base de données Supabase

## Instructions pour configurer la base de données

### 1. Exécuter les tables SQL

Vous avez deux options pour créer les tables dans votre base de données Supabase :

#### Option A: Via l'éditeur SQL Supabase (Recommandé)
1. Allez sur votre dashboard Supabase
2. Cliquez sur "SQL Editor" dans le menu latéral
3. Copiez-collez le contenu du fichier `database/migrate.sql`
4. Cliquez sur "Run" pour exécuter le script

#### Option B: Via psql (si vous avez accès direct)
```bash
psql -h votre-host.supabase.co -U postgres -d postgres -f database/migrate.sql
```

### 2. Vérifier la configuration

Après avoir exécuté le script, vérifiez que les tables ont été créées :

1. Dans le dashboard Supabase, allez dans "Table Editor"
2. Vous devriez voir les tables suivantes :
   - `FACTURES`
   - `FOURNISSEURS`
   - `AGENTS`
   - `CENTRE_DE_COUT`
   - `CHARGES`

### 3. Configuration des variables d'environnement

Assurez-vous que votre fichier `.env.local` contient les variables Supabase :

```env
VITE_SUPABASE_URL=votre_url_supabase
VITE_SUPABASE_ANON_KEY=votre_cle_anon_supabase
```

### 4. Tester l'application

Lancez l'application avec :
```bash
npm run dev
```

Les champs suivants devraient maintenant charger les données depuis la base de données :
- **Fournisseur** : Suggestions depuis la table `FOURNISSEURS`
- **Centre de coût** : Options depuis la table `CENTRE_DE_COUT`
- **Gestionnaire** : Options depuis la table `AGENTS`
- **Catégorie de charge** : Options depuis la table `CHARGES`

### 5. Fonctionnalités implémentées

- Champ Fournisseur avec suggestions et bouton d'ajout
- Catégorie fournisseur auto-remplie
- Masquage du numéro de dossier pour "Frais généraux"
- Drag & drop pour les factures attachées
- Niveau d'urgence (Urgent, Prioritaire, Normal)
- Connexion réelle à Supabase

### 6. Dépannage

Si les données ne chargent pas :
1. Vérifiez la console du navigateur pour les erreurs
2. Assurez-vous que les variables d'environnement sont correctes
3. Vérifiez que les tables existent dans Supabase
4. Vérifiez les permissions RLS (Row Level Security) sur les tables

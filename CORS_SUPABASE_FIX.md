# Résolution de l'erreur CORS avec Supabase

## Erreur
```
Blocage d'une requête multiorigine (Cross-Origin Request) : 
Raison : échec de la requête CORS
```

## Causes possibles

### 1. **Variables d'environnement manquantes (⚠️ À vérifier EN PREMIER)**

Assurez-vous que votre fichier `.env.local` à la racine du projet contient:

```env
VITE_SUPABASE_URL=https://jnszixuanhfwwpncpjji.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Comment obtenir ces clés :**
1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet
3. Settings → API → URL et anon key (copier-coller les valeurs)
4. Redémarrez le serveur de développement (`npm run dev`)

### 2. **Politiques RLS manquantes ou mal configurées**

Supabase utilise **Row Level Security (RLS)** pour contrôler l'accès aux données.

#### Solution :
1. Allez sur votre dashboard Supabase
2. Cliquez sur **SQL Editor** 
3. Cliquez sur **New Query**
4. Copiez-collez le contenu du fichier `database/migrate.sql`
5. Cliquez sur **Run** (ou `Ctrl + Enter`)

Le script va :
- ✅ Activer RLS sur toutes les tables
- ✅ Créer les politiques de sécurité
- ✅ Permettre l'accès en lecture/écriture à tous les utilisateurs (y compris anonymes)

#### Alternative : Configuration manuelle dans l'UI Supabase

Pour chaque table (`FACTURES`, `PAIEMENTS`, etc.) :

1. Sélectionnez la table dans Table Editor
2. Cliquez sur **RLS** (en bas à gauche)
3. Cliquez sur **Enable RLS**
4. Créez 3 nouvelles politiques :

**Politique 1 : SELECT (Lecture)**
```sql
CREATE POLICY "allow_read" ON public."PAIEMENTS"
  FOR SELECT USING (true);
```

**Politique 2 : INSERT (Insertion)**
```sql
CREATE POLICY "allow_insert" ON public."PAIEMENTS"
  FOR INSERT WITH CHECK (true);
```

**Politique 3 : UPDATE (Mise à jour)**
```sql
CREATE POLICY "allow_update" ON public."PAIEMENTS"
  FOR UPDATE USING (true) WITH CHECK (true);
```

### 3. **Vérifier les logs du navigateur**

1. Appuyez sur `F12` pour ouvrir les DevTools
2. Allez à **Console**
3. Vérifiez si les messages affichent :
   - ✓ Configuration Supabase chargée correctement
   - ✗ ERREUR CONFIG SUPABASE (variables manquantes)

### 4. **CORS dans Supabase Dashboard**

Vérifiez les paramètres CORS dans Supabase :

1. Settings → API
2. Cherchez **CORS Configuration**
3. Assurez-vous que votre URL locale est autorisée (par ex: `http://localhost:5173`)

Ou laissez vide pour permettre toutes les origines durant le développement.

## Checklist pour résoudre

- [ ] Vérifier que `.env.local` existe à la racine du projet
- [ ] Vérifier que `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont présents
- [ ] Redémarrer le serveur (`npm run dev`)
- [ ] Exécuter le script `database/migrate.sql` dans Supabase SQL Editor
- [ ] Activer RLS sur toutes les tables
- [ ] Créer les politiques de sécurité (SELECT, INSERT, UPDATE)
- [ ] Rafraîchir la page du navigateur (`Ctrl + F5`)

## Si le problème persiste

1. Ouvrez la console du navigateur (`F12`)
2. Copiez le message d'erreur exact
3. Vérifiez que la table `PAIEMENTS` existe dans Supabase
4. Vérifiez que RLS est **activé** sur la table
5. Vérifiez que la politique SELECT permet l'accès avec `USING (true)`

## Architecture de sécurité Supabase

```
┌─────────────────┐
│  Client Browser │
│  (localhost)    │
└────────┬────────┘
         │ CORS autorisé ✓
         ↓
┌─────────────────────────────────┐
│  Supabase API                   │
│  (jnszixuanhfwwpncpjji)        │
└────────┬────────────────────────┘
         │ Anon Key validée ✓
         ↓
┌─────────────────────────────────┐
│  RLS Policies (Sécurité)        │
│  - allow_read (SELECT)          │
│  - allow_insert (INSERT)        │
│  - allow_update (UPDATE)        │
└────────┬────────────────────────┘
         │ Politique autorisée ✓
         ↓
┌─────────────────────────────────┐
│  Table PAIEMENTS                │
│  (données publiques)            │
└─────────────────────────────────┘
```

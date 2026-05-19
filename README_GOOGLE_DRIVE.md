# Configuration Google Drive pour le stockage des factures

## Instructions pour configurer l'intégration Google Drive

### 1. Créer un projet Google Cloud

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créez un nouveau projet ou sélectionnez un projet existant
3. Activez l'API Google Drive:
   - Allez dans "APIs & Services" > "Library" (ou "Bibliothèque" en français)
   - Dans la barre de recherche, tapez "Google Drive API"
   - Cliquez sur "Google Drive API" dans les résultats
   - Cliquez sur "Activer" (ou "Enable")
   - Si vous ne trouvez pas, essayez de chercher simplement "Drive"

### 2. Créer des identifiants OAuth 2.0

1. Allez dans "APIs & Services" > "Credentials"
2. Cliquez sur "Create Credentials" > "OAuth client ID"
3. Configurez:
   - **Application type**: Web application
   - **Name**: SGL Invoice System
   - **Authorized JavaScript origins**: `http://localhost:5173` (votre URL de développement)
   - **Authorized redirect URIs**: `http://localhost:5173` (même URL)
4. Cliquez sur "Create"
5. Notez le **Client ID** qui sera généré

### 3. Configurer les variables d'environnement

Ajoutez ces variables à votre fichier `.env.local`:
q
```env
# Google Drive Configuration
VITE_GOOGLE_CLIENT_ID=votre_client_id_ic
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173
VITE_GOOGLE_DRIVE_ACCESS_TOKEN=votre_token_pour_service_account
```

### 4. Options d'authentification

#### Option A: Token de service (Recommandée pour production)
1. Créez un Service Account dans Google Cloud Console
2. Partagez un dossier Google Drive avec ce service account
3. Obtenez un token d'accès et configurez `VITE_GOOGLE_DRIVE_ACCESS_TOKEN`

#### Option B: OAuth 2.0 (Pour développement)
1. Utilisez le flow OAuth 2.0 intégré
2. Les utilisateurs seront redirigés vers Google pour s'authentifier
3. Le token sera stocké dans le localStorage

### 5. Créer un dossier pour les factures

1. Créez un dossier dans Google Drive nommé "Factures SGL"
2. Partagez ce dossier avec le service account (si utilisé)
3. Notez l'ID du dossier dans l'URL Google Drive:
   - URL: `https://drive.google.com/drive/folders/1ABC123XYZ...`
   - ID du dossier: `1ABC123XYZ...`

### 6. Tester l'intégration

1. Lancez l'application: `npm run dev`
2. Allez sur le formulaire de facture
3. Essayez d'uploader un fichier via drag & drop
4. Vérifiez que le fichier apparaît dans Google Drive

### 7. Fonctionnalités implémentées

- **Upload automatique** vers Google Drive
- **Drag & drop** avec feedback visuel
- **Lien direct** vers le fichier sur Google Drive
- **Gestion des erreurs** avec messages clairs
- **Support des formats**: PDF, JPG, JPEG, PNG
- **Taille maximale**: 10MB par fichier

### 8. Sécurité

- Les tokens sont stockés dans les variables d'environnement
- Les fichiers uploadés sont rendus publiquement accessibles
- Le service n'a accès qu'aux fichiers uploadés par l'application

### 9. Dépannage

**Erreur "Google Drive n'est pas configuré"**:
- Vérifiez que `VITE_GOOGLE_DRIVE_ACCESS_TOKEN` est configuré
- Vérifiez que le token est valide et n'a pas expiré

**Erreur d'upload**:
- Vérifiez la connexion internet
- Vérifiez que le fichier ne dépasse pas 10MB
- Vérifiez que le format est supporté

**Erreur de permissions**:
- Vérifiez que le service account a accès au dossier Google Drive
- Vérifiez que l'API Google Drive est activée

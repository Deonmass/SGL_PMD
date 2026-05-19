// Service pour l'intégration avec Google Drive API

interface GoogleDriveFile {
  id: string;
  name: string;
  webViewLink: string;
  webContentLink: string;
}

interface UploadResponse {
  success: boolean;
  fileId?: string;
  fileName?: string;
  webViewLink?: string;
  error?: string;
}

class GoogleDriveService {
  private API_BASE_URL = 'https://www.googleapis.com/upload/drive/v3/files';
  private METADATA_URL = 'https://www.googleapis.com/drive/v3/files';

  /**
   * Upload un fichier vers Google Drive
   * @param file Le fichier à uploader
   * @param folderId L'ID du dossier Google Drive (optionnel)
   * @returns Promise avec les informations du fichier uploadé
   */
  async uploadFile(file: File, folderId?: string): Promise<UploadResponse> {
    try {
      // Vérifier si nous avons un token d'accès
      const accessToken = this.getAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Token d\'accès Google Drive non configuré' };
      }

      // Créer les métadonnées du fichier
      const metadata = {
        name: file.name,
        parents: folderId ? [folderId] : undefined
      };

      // Convertir les métadonnées en JSON
      const metadataBlob = new Blob([JSON.stringify(metadata)], {
        type: 'application/json'
      });

      // Créer le multipart body
      const form = new FormData();
      form.append('metadata', metadataBlob);
      form.append('file', file);

      // Faire la requête d'upload
      const response = await fetch(
        `${this.API_BASE_URL}?uploadType=multipart&fields=id,name,webViewLink,webContentLink`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: form
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return { 
          success: false, 
          error: `Erreur upload: ${response.status} - ${errorData.error?.message || 'Erreur inconnue'}` 
        };
      }

      const data: GoogleDriveFile = await response.json();

      // Rendre le fichier publiquement accessible
      await this.makeFilePublic(data.id, accessToken);

      return {
        success: true,
        fileId: data.id,
        fileName: data.name,
        webViewLink: data.webViewLink
      };

    } catch (error) {
      console.error('Erreur upload Google Drive:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erreur inconnue lors de l\'upload' 
      };
    }
  }

  /**
   * Rend un fichier publiquement accessible
   * @param fileId L'ID du fichier
   * @param accessToken Le token d'accès
   */
  private async makeFilePublic(fileId: string, accessToken: string): Promise<void> {
    try {
      await fetch(
        `${this.METADATA_URL}/${fileId}/permissions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        }
      );
    } catch (error) {
      console.warn('Impossible de rendre le fichier public:', error);
    }
  }

  /**
   * Récupère le token d'accès depuis le localStorage ou les variables d'environnement
   */
  private getAccessToken(): string | null {
    // Priorité au localStorage (pour les tokens utilisateur)
    const tokenFromStorage = localStorage.getItem('google_drive_access_token');
    if (tokenFromStorage) return tokenFromStorage;

    // Sinon, essayer les variables d'environnement (pour les tokens service)
    const envToken = import.meta.env.VITE_GOOGLE_DRIVE_ACCESS_TOKEN;
    if (envToken) return envToken;

    return null;
  }

  /**
   * Vérifie si le service est configuré
   */
  isConfigured(): boolean {
    return !!this.getAccessToken();
  }

  /**
   * Initie le flow d'authentification OAuth 2.0
   * @returns L'URL d'authentification
   */
  getAuthUrl(): string {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI || window.location.origin;
    const scope = 'https://www.googleapis.com/auth/drive.file';
    
    if (!clientId) {
      throw new Error('VITE_GOOGLE_CLIENT_ID non configuré');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope,
      response_type: 'token',
      access_type: 'offline',
      prompt: 'consent'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Extrait le token d'accès depuis l'URL de callback OAuth
   * @param url L'URL de callback
   */
  handleAuthCallback(url: string): void {
    const hashParams = new URLSearchParams(url.split('#')[1]);
    const accessToken = hashParams.get('access_token');
    
    if (accessToken) {
      localStorage.setItem('google_drive_access_token', accessToken);
      window.location.hash = '';
    }
  }
}

export const googleDriveService = new GoogleDriveService();

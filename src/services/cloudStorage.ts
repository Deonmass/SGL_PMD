// Service pour l'intégration avec Google Cloud Storage via Supabase Storage

import { supabase } from './supabase';

interface UploadResponse {
  success: boolean;
  fileUrl?: string;
  fileName?: string;
  path?: string;
  error?: string;
}

class CloudStorageService {
  private bucketName = 'factures'; // Bucket name in Supabase Storage

  /**
   * Upload un fichier vers Google Cloud Storage (via Supabase Storage)
   * @param file Le fichier à uploader
   * @returns Promise avec l'URL publique du fichier uploadé
   */
  async uploadFile(file: File): Promise<UploadResponse> {
    try {
      // Vérifier que le fichier n'est pas vide
      if (!file || file.size === 0) {
        return { success: false, error: 'Le fichier est vide' };
      }

      // Générer un nom unique pour éviter les conflits
      const timestamp = new Date().getTime();
      const randomString = Math.random().toString(36).substring(2, 8);
      const originalName = file.name.replace(/\s+/g, '_'); // Remplacer les espaces
      const fileName = `${timestamp}_${randomString}_${originalName}`;
      
      // Créer le chemin du fichier dans le bucket
      const filePath = `invoices/${fileName}`;

      // Uploader le fichier sur Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from(this.bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type
        });

      if (uploadError) {
        return {
          success: false,
          error: `Erreur upload: ${uploadError.message}`
        };
      }

      // Obtenir l'URL publique du fichier
      const { data: publicData } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      const fileUrl = publicData.publicUrl;

      return {
        success: true,
        fileUrl,
        fileName: file.name,
        path: filePath
      };

    } catch (error) {
      console.error('Erreur upload Cloud Storage:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue lors de l\'upload'
      };
    }
  }

  /**
   * Extrait le chemin objet dans le bucket `factures` depuis une URL publique Supabase Storage.
   */
  pathFromFacturesPublicUrl(url: string): string | null {
    const cleaned = url.split('#')[0];
    const marker = '/storage/v1/object/public/factures/';
    const markerIndex = cleaned.indexOf(marker);
    if (markerIndex === -1) return null;
    const pathOnly = cleaned.slice(markerIndex + marker.length).split('?')[0];
    try {
      return decodeURIComponent(pathOnly);
    } catch {
      return pathOnly;
    }
  }

  /**
   * Supprime la pièce jointe facture dans le bucket `factures` si l'URL pointe vers ce bucket.
   * @returns true si rien à supprimer ou suppression OK, false si erreur storage
   */
  async deleteInvoiceAttachmentByUrl(url: string | null | undefined): Promise<boolean> {
    const path = url ? this.pathFromFacturesPublicUrl(String(url)) : null;
    if (!path) return true;
    return this.deleteFile(path);
  }

  /**
   * Supprime un fichier du Cloud Storage
   * @param filePath Le chemin du fichier à supprimer
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      const { error } = await supabase.storage
        .from(this.bucketName)
        .remove([filePath]);

      if (error) {
        console.error('Erreur suppression fichier:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Erreur générale suppression:', error);
      return false;
    }
  }

  /**
   * Récupère l'URL publique d'un fichier
   * @param filePath Le chemin du fichier
   */
  getPublicUrl(filePath: string): string {
    const { data } = supabase.storage
      .from(this.bucketName)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  /**
   * Vérifie si le service est configuré
   */
  isConfigured(): boolean {
    // Supabase est toujours configuré comme le bucket existe
    return true;
  }
}

export const cloudStorageService = new CloudStorageService();

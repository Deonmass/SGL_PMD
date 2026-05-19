import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../hooks/useToast';
import { Client, clientService } from '../../services/tableService';
import { CLIENT_LOGISTICS_CATEGORIES } from '../../constants/clientCategories';
import CountryAutocompleteField from '../fields/CountryAutocompleteField';

interface ClientModalProps {
  isOpen: boolean;
  client?: Client;
  initialNom?: string;
  onClose: () => void;
  onSave: (client: Client) => void;
}

const emptyClient = (): Client => ({
  nom: '',
  pays_sige: '',
  categorie: '',
  statut: true,
  adresse_facturation: '',
});

export default function ClientModal({
  isOpen,
  client,
  initialNom = '',
  onClose,
  onSave,
}: ClientModalProps) {
  const { success, error: showError } = useToast();
  const { canCreate, canEdit } = usePermission();
  const [formData, setFormData] = useState<Client>(emptyClient());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (client) {
      setFormData({
        nom: client.nom ?? '',
        pays_sige: client.pays_sige ?? '',
        categorie: client.categorie ?? '',
        statut: client.statut ?? true,
        adresse_facturation: client.adresse_facturation ?? '',
      });
    } else {
      setFormData({ ...emptyClient(), nom: initialNom });
    }
    setError('');
  }, [client, initialNom, isOpen]);

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setError('');

    const nom = String(formData.nom || '').trim();
    if (!nom) {
      setError('Le nom du client est obligatoire.');
      return;
    }

    if (client?.id) {
      if (!canEdit('factures')) {
        setError('Vous n\'avez pas la permission de modifier un client.');
        return;
      }
    } else if (!canCreate('factures')) {
      setError('Vous n\'avez pas la permission de créer un client.');
      return;
    }

    setLoading(true);
    try {
      const payload: Client = {
        nom,
        pays_sige: formData.pays_sige?.trim() || null,
        categorie: formData.categorie?.trim() || null,
        statut: formData.statut ?? true,
        adresse_facturation: formData.adresse_facturation?.trim() || null,
      };

      const saved = client?.id
        ? await clientService.update(client.id, payload)
        : await clientService.create(payload);

      success(client?.id ? 'Client mis à jour.' : 'Client enregistré dans la base.');
      onSave(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-modal-title"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden
        onClick={handleClose}
      />
      <div
        className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="client-modal-title" className="text-xl font-bold text-gray-900">
            {client?.id ? 'Modifier le client' : 'Nouveau client'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" onClick={(e) => e.stopPropagation()}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input
              type="text"
              value={formData.nom ?? ''}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
            <select
              value={formData.categorie ?? ''}
              onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              disabled={loading}
            >
              <option value="">-- Sélectionner un type --</option>
              {CLIENT_LOGISTICS_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <CountryAutocompleteField
            value={formData.pays_sige ?? ''}
            onChange={(pays) => setFormData({ ...formData, pays_sige: pays })}
            disabled={loading}
            label="Pays SIGE"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse de facturation</label>
            <textarea
              value={formData.adresse_facturation ?? ''}
              onChange={(e) => setFormData({ ...formData, adresse_facturation: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={formData.statut !== false}
              onChange={(e) => setFormData({ ...formData, statut: e.target.checked })}
              disabled={loading}
            />
            Client actif
          </label>

          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 text-white font-medium rounded-lg bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500 hover:from-indigo-600 hover:via-blue-600 hover:to-cyan-600 shadow-md hover:shadow-cyan-500/40 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 transition-all duration-300"
            >
              {loading && <Loader2 size={16} className="animate-spin shrink-0" />}
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

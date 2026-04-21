import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { Fournisseur, fournisseurService } from '../../services/tableService';

interface FournisseurModalProps {
  isOpen: boolean;
  fournisseur?: Fournisseur;
  onClose: () => void;
  onSave: () => void;
}

export default function FournisseurModal({ isOpen, fournisseur, onClose, onSave }: FournisseurModalProps) {
  const { canCreate, canEdit } = usePermission();
  const [formData, setFormData] = useState<Fournisseur>(
    fournisseur || { Fournisseur: '', "Catégorie fournisseur": '' }
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (fournisseur) {
      setFormData(fournisseur);
    } else {
      setFormData({ Fournisseur: '', "Catégorie fournisseur": '' });
    }
  }, [fournisseur]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Vérification des permissions
    if (fournisseur?.ID) {
      if (!canEdit('fournisseurs')) {
        setError('Vous n\'avez pas la permission de modifier des fournisseurs.');
        return;
      }
    } else {
      if (!canCreate('fournisseurs')) {
        setError('Vous n\'avez pas la permission de créer des fournisseurs.');
        return;
      }
    }

    setLoading(true);

    try {
      if (fournisseur?.ID) {
        await fournisseurService.update(fournisseur.ID, formData);
      } else {
        await fournisseurService.create(formData);
      }
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {fournisseur ? 'Éditer Fournisseur' : 'Nouveau Fournisseur'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fournisseur *
            </label>
            <input
              type="text"
              value={formData.Fournisseur}
              onChange={(e) => setFormData({ ...formData, Fournisseur: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Catégorie fournisseur *
            </label>
            <input
              type="text"
              value={formData["Catégorie fournisseur"]}
              onChange={(e) => setFormData({ ...formData, "Catégorie fournisseur": e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:bg-gray-400"
              disabled={loading}
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

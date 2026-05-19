import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { Caisse, caisseService } from '../../services/tableService';

interface CaisseModalProps {
  isOpen: boolean;
  caisse?: Caisse;
  onClose: () => void;
  onSave: () => void;
}

export default function CaisseModal({ isOpen, caisse, onClose, onSave }: CaisseModalProps) {
  const { canCreate, canEdit } = usePermission();
  const [formData, setFormData] = useState<Caisse>(
    caisse || { Designation: '', Region: '' }
  );
  const [regions, setRegions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadRegions();
      if (caisse) {
        setFormData(caisse);
      } else {
        setFormData({ Designation: '', Region: '' });
      }
    }
  }, [isOpen, caisse]);

  const loadRegions = async () => {
    try {
      const regionsList = await caisseService.getRegions();
      setRegions(regionsList || []);
    } catch (err) {
      console.error('Erreur lors du chargement des régions:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.Designation?.trim()) {
      setError('La désignation est obligatoire');
      return;
    }
    
    if (!formData.Region?.trim()) {
      setError('La région est obligatoire');
      return;
    }

    // Vérification des permissions
    if (caisse?.ID) {
      if (!canEdit('caisses')) {
        setError('Vous n\'avez pas la permission de modifier des caisses.');
        return;
      }
    } else {
      if (!canCreate('caisses')) {
        setError('Vous n\'avez pas la permission de créer des caisses.');
        return;
      }
    }

    setLoading(true);

    try {
      if (caisse?.ID) {
        await caisseService.update(caisse.ID, formData);
      } else {
        await caisseService.create(formData);
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
            {caisse ? 'Éditer Caisse' : 'Nouvelle Caisse'}
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
              Désignation *
            </label>
            <input
              type="text"
              value={formData.Designation || ''}
              onChange={(e) => setFormData({ ...formData, Designation: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Région *
            </label>
            <select
              value={formData.Region || ''}
              onChange={(e) => setFormData({ ...formData, Region: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            >
              <option value="">Sélectionner une région</option>
              <option value="OUEST">OUEST</option>
              <option value="EST">EST</option>
              <option value="SUD">SUD</option>
              <option value="NORD">NORD</option>
            </select>
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

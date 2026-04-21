import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { CentreDeCout, centreDeCoutService } from '../../services/tableService';

interface CentreDeCoutModalProps {
  isOpen: boolean;
  centre?: CentreDeCout;
  onClose: () => void;
  onSave: () => void;
}

export default function CentreDeCoutModal({ isOpen, centre, onClose, onSave }: CentreDeCoutModalProps) {
  const { canCreate, canEdit } = usePermission();
  const [formData, setFormData] = useState<CentreDeCout>(
    centre || { Designation: '', REGION: 'OUEST' }
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (centre) {
        setFormData(centre);
      } else {
        setFormData({ Designation: '', REGION: 'OUEST' });
      }
      setError('');
    }
  }, [isOpen, centre]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Vérification des permissions
    if (centre?.ID) {
      if (!canEdit('centres')) {
        setError('Vous n\'avez pas la permission de modifier des centres de coût.');
        return;
      }
    } else {
      if (!canCreate('centres')) {
        setError('Vous n\'avez pas la permission de créer des centres de coût.');
        return;
      }
    }

    setLoading(true);

    try {
      if (centre?.ID) {
        await centreDeCoutService.update(centre.ID, formData);
      } else {
        await centreDeCoutService.create(formData);
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
            {centre ? 'Éditer Centre de coût' : 'Nouveau Centre de coût'}
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
              value={formData.Designation}
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
              value={formData.REGION}
              onChange={(e) => setFormData({ ...formData, REGION: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            >
              <option value="OUEST">OUEST</option>
              <option value="EST">EST</option>
              <option value="NORD">NORD</option>
              <option value="SUD">SUD</option>
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

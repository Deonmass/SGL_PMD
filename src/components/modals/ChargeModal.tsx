import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { Charge, chargeService } from '../../services/tableService';

interface ChargeModalProps {
  isOpen: boolean;
  charge?: Charge;
  onClose: () => void;
  onSave: () => void;
}

export default function ChargeModal({ isOpen, charge, onClose, onSave }: ChargeModalProps) {
  const { canCreate, canEdit } = usePermission();
  const [formData, setFormData] = useState<Charge>(
    charge || { designation_Charges: '', Bloquant: 'NON', type: 'Opérationnel' }
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (charge) {
        setFormData({
          ...charge,
          type: charge.type || 'Opérationnel',
        });
      } else {
        setFormData({ designation_Charges: '', Bloquant: 'NON', type: 'Opérationnel' });
      }
      setError('');
    }
  }, [isOpen, charge]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Vérification des permissions
    if (charge?.ID) {
      if (!canEdit('charges')) {
        setError('Vous n\'avez pas la permission de modifier des charges.');
        return;
      }
    } else {
      if (!canCreate('charges')) {
        setError('Vous n\'avez pas la permission de créer des charges.');
        return;
      }
    }

    setLoading(true);

    try {
      if (charge?.ID) {
        await chargeService.update(charge.ID, formData);
      } else {
        await chargeService.create(formData);
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
            {charge ? 'Éditer Charge' : 'Nouvelle Charge'}
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
              Désignation Charge *
            </label>
            <input
              type="text"
              value={formData.designation_Charges}
              onChange={(e) => setFormData({ ...formData, designation_Charges: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type de charges *
            </label>
            <select
              value={formData.type || 'Opérationnel'}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            >
              <option value="Opérationnel">Opérationnel</option>
              <option value="Frais généraux">Frais généraux</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bloquant ? *
            </label>
            <select
              value={formData.Bloquant}
              onChange={(e) => setFormData({ ...formData, Bloquant: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            >
              <option value="OUI">OUI</option>
              <option value="NON">NON</option>
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

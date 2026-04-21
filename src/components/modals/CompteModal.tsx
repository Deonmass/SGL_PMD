import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { Compte, compteService, fournisseurService } from '../../services/tableService';

interface CompteModalProps {
  isOpen: boolean;
  compte?: Compte | null;
  onClose: () => void;
  onSave: () => void;
}

export default function CompteModal({ isOpen, compte, onClose, onSave }: CompteModalProps) {
  const { canCreate, canEdit } = usePermission();
  const [formData, setFormData] = useState({
    Fournisseur: '',
    Banque: '',
    Compte: '',
    SGL: false,
    devise: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fournisseurs, setFournisseurs] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (compte) {
      setFormData({
        Fournisseur: compte.Fournisseur,
        Banque: compte.Banque,
        Compte: compte.Compte,
        SGL: compte.SGL || false,
        devise: compte.devise || ''
      });
    } else {
      setFormData({
        Fournisseur: '',
        Banque: '',
        Compte: '',
        SGL: false,
        devise: ''
      });
    }
  }, [compte]);

  useEffect(() => {
    const loadFournisseurs = async () => {
      try {
        const data = await fournisseurService.getAll();
        const fournisseursList = data.map(f => f.Fournisseur);
        setFournisseurs(fournisseursList);
      } catch (err) {
        console.error('Erreur lors du chargement des fournisseurs:', err);
      }
    };
    loadFournisseurs();
  }, []);

  const handleFournisseurChange = (value: string) => {
    setFormData({ ...formData, Fournisseur: value });
    
    if (value.length > 0) {
      const filtered = fournisseurs.filter(f => 
        f.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectFournisseur = (fournisseur: string) => {
    setFormData({ ...formData, Fournisseur: fournisseur });
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Vérification des permissions
    if (compte?.id) {
      if (!canEdit('comptes')) {
        setError('Vous n\'avez pas la permission de modifier des comptes.');
        setLoading(false);
        return;
      }
    } else {
      if (!canCreate('comptes')) {
        setError('Vous n\'avez pas la permission de créer des comptes.');
        setLoading(false);
        return;
      }
    }

    try {
      if (compte?.id) {
        await compteService.update(compte.id, formData);
      } else {
        await compteService.create(formData);
      }
      onSave();
      onClose();
    } catch (err) {
      setError('Erreur lors de la sauvegarde');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {compte?.id ? 'Modifier le compte' : 'Nouveau compte'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fournisseur
              </label>
              <input
                type="text"
                value={formData.Fournisseur}
                onChange={(e) => handleFournisseurChange(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                placeholder="Tapez pour rechercher..."
                required
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-auto">
                  {filteredSuggestions.map((fournisseur, index) => (
                    <div
                      key={index}
                      onClick={() => selectFournisseur(fournisseur)}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      {fournisseur}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Banque
              </label>
              <select
                value={formData.Banque}
                onChange={(e) => setFormData({ ...formData, Banque: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                required
              >
                <option value="">Sélectionner une banque</option>
                <option value="Access Bank RDC">Access Bank RDC</option>
                <option value="Afriland First Bank CD SA">Afriland First Bank CD SA</option>
                <option value="BGFibank">BGFibank</option>
                <option value="CADECO">CADECO</option>
                <option value="Ecobank">Ecobank</option>
                <option value="EQUITY BCDC">EQUITY BCDC</option>
                <option value="FirstBank DRC SA">FirstBank DRC SA</option>
                <option value="RAWBANK">RAWBANK</option>
                <option value="Solidaire Banque SA">Solidaire Banque SA</option>
                <option value="Sofibanque SA">Sofibanque SA</option>
                <option value="Standard Bank Congo">Standard Bank Congo</option>
                <option value="TMB">Trust Merchant Bank (TMB)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Compte
              </label>
              <input
                type="text"
                value={formData.Compte}
                onChange={(e) => setFormData({ ...formData, Compte: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Devise
              </label>
              <select
                value={formData.devise}
                onChange={(e) => setFormData({ ...formData, devise: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
              >
                <option value="">Sélectionner une devise</option>
                <option value="CDF">CDF</option>
                <option value="USD">USD</option>
                <option value="EURO">EURO</option>
              </select>
            </div>

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.SGL}
                  onChange={(e) => setFormData({ ...formData, SGL: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Compte SGL ?</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Sauvegarde...' : (compte?.id ? 'Mettre à jour' : 'Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

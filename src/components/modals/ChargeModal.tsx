import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { Charge, chargeService } from '../../services/tableService';
import {
  defaultChargeSeuils,
  mergeChargeSeuils,
  parseChargeSeuils,
  type ChargeSeuils,
} from '../../utils/chargeSeuils';

interface ChargeModalProps {
  isOpen: boolean;
  charge?: Charge;
  onClose: () => void;
  onSave: () => void;
}

export default function ChargeModal({ isOpen, charge, onClose, onSave }: ChargeModalProps) {
  const { canCreate, canEdit } = usePermission();
  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<Charge>(
    charge || { designation_Charges: '', Bloquant: 'NON', type: 'Opérationnel', abonnement: 'NON' },
  );
  const [seuils, setSeuils] = useState<ChargeSeuils>(defaultChargeSeuils());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isAbonnement = formData.abonnement === 'OUI';

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      if (charge) {
        const ab = charge.abonnement === 'OUI' ? 'OUI' : 'NON';
        setFormData({
          ...charge,
          type: charge.type || 'Opérationnel',
          abonnement: ab,
        });
        setSeuils(mergeChargeSeuils(parseChargeSeuils(charge.Seuils)));
      } else {
        setFormData({ designation_Charges: '', Bloquant: 'NON', type: 'Opérationnel', abonnement: 'NON' });
        setSeuils(defaultChargeSeuils());
      }
      setError('');
    }
  }, [isOpen, charge]);

  const persistCharge = async () => {
    const payload: Charge = {
      ...formData,
      Seuils: isAbonnement ? seuils : null,
    };
    if (charge?.ID) {
      await chargeService.update(charge.ID, payload);
    } else {
      await chargeService.create(payload);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (charge?.ID) {
      if (!canEdit('charges')) {
        setError('Vous n\'avez pas la permission de modifier des charges.');
        return;
      }
    } else if (!canCreate('charges')) {
      setError('Vous n\'avez pas la permission de créer des charges.');
      return;
    }

    if (step === 1 && isAbonnement) {
      if (!formData.designation_Charges.trim()) {
        setError('La désignation est obligatoire.');
        return;
      }
      setStep(2);
      return;
    }

    if (isAbonnement) {
      if (seuils.alerte.montant < 0) {
        setError('Le montant du seuil d\'alerte doit être positif ou nul.');
        return;
      }
      if (!seuils.alerte.message.trim() || !seuils.epuisement.message.trim()) {
        setError('Les messages des seuils sont obligatoires.');
        return;
      }
    }

    setLoading(true);
    try {
      await persistCharge();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {charge ? 'Éditer Charge' : 'Nouvelle Charge'}
            </h2>
            {isAbonnement && (
              <p className="mt-1 text-xs text-gray-500">
                Étape {step} sur 2 — {step === 1 ? 'Informations générales' : 'Seuils de provision'}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {isAbonnement && (
          <div className="mb-4 flex gap-2">
            <div
              className={`h-1.5 flex-1 rounded-full ${step >= 1 ? 'bg-indigo-600' : 'bg-gray-200'}`}
            />
            <div
              className={`h-1.5 flex-1 rounded-full ${step >= 2 ? 'bg-indigo-600' : 'bg-gray-200'}`}
            />
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Désignation Charge *
                </label>
                <input
                  type="text"
                  value={formData.designation_Charges}
                  onChange={(e) =>
                    setFormData({ ...formData, designation_Charges: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Type de charges *
                </label>
                <select
                  value={formData.type || 'Opérationnel'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={loading}
                >
                  <option value="Opérationnel">Opérationnel</option>
                  <option value="Frais généraux">Frais généraux</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Bloquant ? *</label>
                <select
                  value={formData.Bloquant}
                  onChange={(e) => setFormData({ ...formData, Bloquant: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={loading}
                >
                  <option value="OUI">OUI</option>
                  <option value="NON">NON</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Abonnement ? *</label>
                <select
                  value={formData.abonnement === 'OUI' ? 'OUI' : 'NON'}
                  onChange={(e) =>
                    setFormData({ ...formData, abonnement: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={loading}
                >
                  <option value="OUI">OUI</option>
                  <option value="NON">NON</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Si OUI, chaque facture enregistrée génère une sortie de provision et vous pourrez
                  définir des seuils d&apos;alerte et d&apos;épuisement.
                </p>
              </div>
            </>
          )}

          {step === 2 && isAbonnement && (
            <div className="space-y-5">
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                <h3 className="text-sm font-bold text-amber-950">Seuil d&apos;alerte</h3>
                <p className="mt-1 text-xs text-amber-800">
                  Lorsque le solde descend à ce montant ou en dessous, un avertissement s&apos;affiche
                  à la saisie de facture.
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Montant seuil (USD)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={seuils.alerte.montant}
                      onChange={(e) =>
                        setSeuils((prev) => ({
                          ...prev,
                          alerte: {
                            ...prev.alerte,
                            montant: parseFloat(e.target.value) || 0,
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Message d&apos;alerte
                    </label>
                    <textarea
                      rows={2}
                      value={seuils.alerte.message}
                      onChange={(e) =>
                        setSeuils((prev) => ({
                          ...prev,
                          alerte: { ...prev.alerte, message: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50/80 p-4">
                <h3 className="text-sm font-bold text-red-950">Seuil d&apos;épuisement</h3>
                <p className="mt-1 text-xs text-red-800">
                  À ce montant (0), l&apos;enregistrement des factures est bloqué.
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Montant seuil (USD)
                    </label>
                    <input
                      type="number"
                      value={0}
                      readOnly
                      className="w-full cursor-not-allowed rounded-lg border border-red-200 bg-gray-100 px-3 py-2 text-sm text-gray-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Message de blocage
                    </label>
                    <textarea
                      rows={3}
                      value={seuils.epuisement.message}
                      onChange={(e) =>
                        setSeuils((prev) => ({
                          ...prev,
                          epuisement: { ...prev.epuisement, message: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-red-400"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            {step === 2 ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                <ChevronLeft size={16} />
                Précédent
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                Annuler
              </button>
            )}

            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:bg-gray-400"
              disabled={loading}
            >
              {loading ? (
                'Enregistrement...'
              ) : step === 1 && isAbonnement ? (
                <>
                  Suivant
                  <ChevronRight size={16} />
                </>
              ) : (
                'Enregistrer'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

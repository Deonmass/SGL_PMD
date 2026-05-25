import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { chargeProvisionService } from '../../services/chargeProvisionService';

interface ChargeProvisionApproModalProps {
  isOpen: boolean;
  charge: string;
  onClose: () => void;
  onSaved: () => void;
}

function todayInputDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ChargeProvisionApproModal({
  isOpen,
  charge,
  onClose,
  onSaved,
}: ChargeProvisionApproModalProps) {
  const [dateOperation, setDateOperation] = useState(todayInputDate());
  const [montant, setMontant] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDateOperation(todayInputDate());
      setMontant('');
      setError('');
    }
  }, [isOpen, charge]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const amount = parseFloat(montant.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Saisissez un montant valide.');
      return;
    }

    setLoading(true);
    try {
      await chargeProvisionService.recordAppro({
        charge,
        dateOperation,
        montant: amount,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Approvisionnement</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          Charge : <span className="font-semibold text-gray-900">{charge}</span>
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Date d&apos;opération *</label>
            <input
              type="date"
              value={dateOperation}
              onChange={(e) => setDateOperation(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              required
              disabled={loading}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Montant (entrée, USD) *</label>
            <input
              type="text"
              inputMode="decimal"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              required
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:bg-gray-400"
              disabled={loading}
            >
              {loading ? 'Enregistrement…' : 'Enregistrer l\'appro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

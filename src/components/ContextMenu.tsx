import { useState, useEffect, useRef } from 'react';
import { Eye, Edit, Calendar, X, MoreVertical, FileText, CreditCard } from 'lucide-react';
import { Invoice } from '../types';
import { usePermission } from '../hooks/usePermission';

interface ContextMenuProps {
  invoice: Invoice;
  onView: (invoice: Invoice) => void;
  onEdit: (invoice: Invoice) => void;
  onPay: (invoice: Invoice) => void;
  onAddToPaymentOrder?: (invoice: Invoice) => void;
  onClose: () => void;
  position: { x: number; y: number };
  activeMenu?: string;
}

function ContextMenu({ invoice, onView, onEdit, onPay, onAddToPaymentOrder, onClose, position, activeMenu }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { canMarkAsPaid, canEdit, canEstablishPaymentOrder } = usePermission();
  const isFfgContext = String(activeMenu || '').includes('ffg');
  const scope = isFfgContext ? 'frais-generaux' : 'operationnel';
  const canEditCurrentScope = canEdit(isFfgContext ? 'factures_ffg' : 'factures');
  const canAddToPaymentOrder = canEstablishPaymentOrder(scope);
  const canPayCurrentScope = canMarkAsPaid(scope);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Ajuster la position si le menu dépasse de l'écran
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 200),
    y: Math.min(position.y, window.innerHeight - 200)
  };

  return (
    <div
      ref={menuRef}
      className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 min-w-[200px]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {/* Titre avec numéro de facture */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <p className="text-sm font-semibold text-gray-800">Facture {invoice.invoiceNumber}</p>
      </div>

      {/* Options du menu */}
      <div className="py-1">
        <button
          onClick={() => {
            onView(invoice);
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-3"
        >
          <Eye size={16} className="text-gray-600" />
          Visualiser
        </button>

        {canEditCurrentScope && (
          <button
            onClick={() => {
              onEdit(invoice);
              onClose();
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-3"
          >
            <Edit size={16} className="text-gray-600" />
            Modifier
          </button>
        )}

        {activeMenu === 'factures-validated' || activeMenu === 'factures-ffg-validated' ? (
          <>
            {canAddToPaymentOrder && (
              <button
                onClick={() => {
                  if (onAddToPaymentOrder) {
                    onAddToPaymentOrder(invoice);
                  }
                  onClose();
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-3"
              >
                <Calendar size={16} className="text-gray-600" />
                Ajouter à l'ordre de paiement du jour
              </button>
            )}

            {canPayCurrentScope && (
              <button
                onClick={() => {
                  onPay(invoice);
                  onClose();
                }}
                className="w-full px-4 py-2 text-left text-sm text-green-700 hover:bg-green-50 transition-colors flex items-center gap-3"
              >
                <CreditCard size={16} className="text-green-600" />
                Payer
              </button>
            )}
          </>
        ) : null}
      </div>

      <div className="border-t border-gray-200">
        <button
          onClick={onClose}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-3"
        >
          <X size={16} className="text-gray-600" />
          Annuler
        </button>
      </div>
    </div>
  );
}

export default ContextMenu;

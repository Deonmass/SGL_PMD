import { useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { Invoice } from '../types';
import PaiementModal from './PaiementModal';

interface PaymentsTableProps {
  invoices: (Invoice & { 
    totalPaid: number;
    lastPaymentDate: string;
    payments: any[];
  })[];
  onRefresh?: () => void;
}

const formatDateFr = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const calculateDaysAge = (startDate: string, endDate: string): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const formatAmount = (amount: number): string => {
  return amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  });
};

function PaymentsTable({ invoices, onRefresh }: PaymentsTableProps) {
  const [contextMenu, setContextMenu] = useState<{
    invoice: any;
    position: { x: number; y: number };
  } | null>(null);
  const [paymentModal, setPaymentModal] = useState<(Invoice & { readOnly?: boolean; showOnlyNew?: boolean }) | null>(null);

  const handleContextMenu = (e: React.MouseEvent, invoice: any) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      invoice,
      position: { x: e.clientX, y: e.clientY }
    });
  };

  const handleViewInvoice = (invoice: any) => {
    setPaymentModal({ ...invoice, readOnly: true });
    setContextMenu(null);
  };

  const handleNewPayment = (invoice: any) => {
    setPaymentModal({ ...invoice, readOnly: false });
    setContextMenu(null);
  };

  const handleClosePaymentModal = () => {
    setPaymentModal(null);
    onRefresh?.();
  };

  const getPaymentStatusBadge = (paid: number, total: number) => {
    const isPaid = paid >= total - 0.01;
    const percentage = ((paid / total) * 100).toFixed(0);
    
    if (isPaid) {
      return (
        <div className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-full text-[10px] font-semibold border border-green-300">
          ✓ Complètement payée
        </div>
      );
    } else {
      return (
        <div className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-[10px] font-semibold border border-yellow-300">
          ⏳ {percentage}% payée
        </div>
      );
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg overflow-hidden m-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">Date réception</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">N° facture</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">Fournisseur</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold text-gray-900 uppercase">Montant facture</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold text-gray-900 uppercase">Montant payé</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold text-gray-900 uppercase">Reste à payer</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">Statut</th>
                <th className="px-4 py-2 text-center text-[10px] font-bold text-gray-900 uppercase">Fichier</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold text-gray-900 uppercase">Âge (j)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    Aucune facture trouvée
                  </td>
                </tr>
              ) : (
                invoices.map((invoice, idx) => {
                  const remaining = Math.max(0, (invoice.amount || 0) - invoice.totalPaid);
                  const daysAge = calculateDaysAge(invoice.receptionDate!, invoice.lastPaymentDate!);
                  const isPaid = remaining <= 0.01;

                  return (
                    <tr 
                      key={idx} 
                      className="hover:bg-blue-50 hover:shadow-md transition-all duration-200 cursor-context-menu border-b border-gray-100 hover:border-blue-300 hover:scale-y-105"
                      onContextMenu={(e) => handleContextMenu(e, invoice)}
                    >
                      <td className="px-4 py-2">
                        <div className="text-[11px] text-gray-900 whitespace-nowrap font-semibold">{formatDateFr(invoice.receptionDate)}</div>
                      </td>
                      <td className="px-4 py-2 text-[11px] font-semibold">
                        <button
                          onClick={() => handleViewInvoice(invoice)}
                          className="text-blue-600 hover:text-blue-800 hover:underline transition-all duration-200 transform hover:scale-105 font-bold"
                        >
                          {invoice.invoiceNumber}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-gray-900 hover:text-gray-700 transition-colors">
                        {invoice.supplier}
                      </td>
                      <td className="px-4 py-2 text-[11px] font-bold text-gray-900 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span>${formatAmount(invoice.amount || 0)}</span>
                          <span className="bg-gray-400 text-white text-[9px] px-2 py-1 rounded-full font-semibold whitespace-nowrap">
                            {invoice.currency}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[11px] font-bold text-green-700 text-right bg-gray-100 hover:bg-gray-200 transition-colors">
                        ${formatAmount(invoice.totalPaid)}
                      </td>
                      <td className={`px-4 py-2 text-[11px] font-bold text-right bg-gray-100 hover:bg-gray-200 transition-colors ${
                        isPaid ? 'text-green-600' : 'text-orange-600'
                      }`}>
                        ${formatAmount(remaining)}
                      </td>
                      <td className="px-4 py-2 text-left">
                        {getPaymentStatusBadge(invoice.totalPaid, invoice.amount || 0)}
                      </td>
                      <td className="px-4 py-2 text-center hover:bg-blue-100 rounded transition-all duration-200">
                        {invoice.attachedInvoiceUrl && (
                          <a
                            href={invoice.attachedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800 hover:bg-blue-100 p-1.5 rounded transition-all duration-200 transform hover:scale-125"
                            title="Télécharger"
                          >
                            <Download size={16} />
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-right text-gray-700 font-semibold">{daysAge}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div
            className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-max"
            style={{
              left: `${Math.min(contextMenu.position.x, window.innerWidth - 200)}px`,
              top: `${Math.min(contextMenu.position.y, window.innerHeight - 100)}px`
            }}
          >
            <button
              onClick={() => handleViewInvoice(contextMenu.invoice)}
              className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm text-gray-700 flex items-center gap-2 border-b transition-colors"
            >
              <Eye size={14} />
              Voir (lecture)
            </button>
            <button
              onClick={() => handleNewPayment(contextMenu.invoice)}
              className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm text-gray-700 flex items-center gap-2 transition-colors"
            >
              <Download size={14} />
              Nouveau paiement
            </button>
          </div>
        </>
      )}

      {/* Payment Modal */}
      {paymentModal && (
        <PaiementModal
          invoice={paymentModal}
          onClose={handleClosePaymentModal}
          onSuccess={() => {
            handleClosePaymentModal();
            onRefresh?.();
          }}
          readOnly={paymentModal.readOnly}
        />
      )}
    </>
  );
}

export default PaymentsTable;

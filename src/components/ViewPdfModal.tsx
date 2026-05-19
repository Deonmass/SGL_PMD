import { X, Printer } from 'lucide-react';

interface ViewPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl?: string;
  title: string;
  summary?: {
    totalAmount?: number;
    totalPaid?: number;
    totalRemaining?: number;
  };
}

function ViewPdfModal({ isOpen, onClose, pdfUrl, title, summary }: ViewPdfModalProps) {
  const handlePrint = () => {
    const iframe = document.querySelector('iframe[title="Facture PDF"]') as HTMLIFrameElement;
    if (iframe) {
      iframe.contentWindow?.print();
    }
  };
  if (!isOpen) return null;

  if (!pdfUrl) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full">
          <div className="flex items-center justify-between border-b p-4 bg-gray-200">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
                title="Imprimer"
              >
                <Printer size={20} className="text-gray-600" />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>
          </div>
          <div className="p-8 text-center">
            <p className="text-gray-500">Aucun fichier PDF disponible pour cette facture</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 bg-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
              title="Imprimer"
            >
              <Printer size={20} className="text-gray-600" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
            >
              <X size={20} className="text-gray-600" />
            </button>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 overflow-hidden">
          <iframe
            src={pdfUrl}
            className="w-full h-full"
            title="Facture PDF"
          />
        </div>

        {/* Footer with Summary */}
        <div className="border-t p-4 flex justify-between items-center bg-gray-200">
          <a
            href={pdfUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            Télécharger
          </a>
          {summary && (
            <div className="flex gap-8 text-sm font-semibold">
              {summary.totalAmount !== undefined && (
                <div>
                  <p className="text-gray-600">Montant Total</p>
                  <p className="text-gray-900">${summary.totalAmount.toFixed(2)}</p>
                </div>
              )}
              {summary.totalPaid !== undefined && (
                <div>
                  <p className="text-gray-600">Montant Payé</p>
                  <p className="text-green-600">${summary.totalPaid.toFixed(2)}</p>
                </div>
              )}
              {summary.totalRemaining !== undefined && (
                <div>
                  <p className="text-gray-600">Solde à Payer</p>
                  <p className="text-red-600">${summary.totalRemaining.toFixed(2)}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ViewPdfModal;

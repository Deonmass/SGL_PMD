import { Invoice } from '../types';
import { Download, X, MoreVertical, FileText, Printer, Star } from 'lucide-react';
import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import ContextMenu from './ContextMenu';
import ViewInvoiceModal from './ViewInvoiceModal';
import EditInvoiceForm from './EditInvoiceForm';
import PaiementModal from './PaiementModal';
import { ordoPaiementService } from '../services/tableService';
import { supabase } from '../services/supabase';
import { refreshAllData } from '../hooks/useDataRefresh';
import { useAuth } from '../contexts/AuthContext';
import { appendFactureDeletionAuditLog, appendFactureLogByInvoiceNumber, buildLogActor } from '../services/activityLogService';

// Fonctions utilitaires pour formater les dates et données
const formatDateFr = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';
  
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
  
  if (dateOnly.getTime() === todayOnly.getTime()) return 'Aujourd\'hui';
  if (dateOnly.getTime() === yesterdayOnly.getTime()) return 'Hier';
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatAmount = (amount: number, currency: string): { formatted: string; currency: string } => {
  const formatted = amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false
  }).replace(/,/, ',');
  
  return {
    formatted: formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
    currency: currency || 'USD'
  };
};

const calculateDaysRemaining = (dueDate: string | null): { days: number; text: string; isOverdue: boolean } => {
  if (!dueDate) return { days: 0, text: '-', isOverdue: false };
  
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { days: Math.abs(diffDays), text: `Échu de ${Math.abs(diffDays)}j`, isOverdue: true };
  } else if (diffDays === 0) {
    return { days: 0, text: 'Aujourd\'hui', isOverdue: false };
  } else {
    return { days: diffDays, text: `${diffDays}j restant`, isOverdue: false };
  }
};

interface InvoiceTableProps {
  invoices: Invoice[];
  onDelete?: (id: number) => void;
  onEdit?: (invoice: Invoice) => void;
  activeMenu?: string;
  agent?: any;
}

// CSS pour l'animation de clignotement
const blinkingStyle = `
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .animate-blink {
    animation: blink 1s infinite;
  }
`;

if (typeof document !== 'undefined') {
  const styleId = 'invoice-table-blink-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = blinkingStyle;
    document.head.appendChild(style);
  }
}

type SortField = 'receptionDate' | 'amount' | 'dueDate' | null;
type SortOrder = 'asc' | 'desc';

function InvoiceTable({ invoices, activeMenu, agent }: InvoiceTableProps) {
  const { agent: currentAgent } = useAuth();
  const [contextMenu, setContextMenu] = useState<{
    invoice: Invoice | null;
    position: { x: number; y: number };
  } | null>(null);
  const [viewModal, setViewModal] = useState<Invoice | null>(null);
  const [editModal, setEditModal] = useState<Invoice | null>(null);
  const [pdfModal, setPdfModal] = useState<{ invoice: Invoice; url: string } | null>(null);
  const [paymentModal, setPaymentModal] = useState<Invoice | null>(null);
  const [sortBy, setSortBy] = useState<SortField>('receptionDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [invoicesInOrderPaiement, setInvoicesInOrderPaiement] = useState<number[]>([]);

  // Charger les factures dans l'ordre de paiement du jour
  useEffect(() => {
    const loadInvoicesInOrder = async () => {
      try {
        const ids = await ordoPaiementService.getInvoicesInTodayOrdre();
        setInvoicesInOrderPaiement(ids);
      } catch (err) {
        console.error('Erreur lors du chargement des factures dans l\'ordre:', err);
      }
    };
    
    loadInvoicesInOrder();
  }, []);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Trier les factures par champ sélectionné
  const sortedInvoices = [...invoices].sort((a, b) => {
    let compareA: number = 0;
    let compareB: number = 0;

    switch (sortBy) {
      case 'receptionDate':
        compareA = new Date(a.receptionDate || '').getTime();
        compareB = new Date(b.receptionDate || '').getTime();
        break;
      case 'amount':
        compareA = a.amount || 0;
        compareB = b.amount || 0;
        break;
      case 'dueDate':
        compareA = new Date(a.dueDate || '').getTime();
        compareB = new Date(b.dueDate || '').getTime();
        break;
      default:
        compareA = new Date(a.receptionDate || '').getTime();
        compareB = new Date(b.receptionDate || '').getTime();
    }

    if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
    if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const handleContextMenu = (e: React.MouseEvent, invoice: Invoice) => {
    e.preventDefault();
    setContextMenu({
      invoice,
      position: { x: e.clientX, y: e.clientY }
    });
  };

  const handleViewInvoice = (invoice: Invoice) => {
    setViewModal(invoice);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditModal(invoice);
  };

  const handlePayInvoice = (invoice: Invoice) => {
    setPaymentModal(invoice);
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    if (!invoice?.id) {
      Swal.fire('Erreur', 'Facture invalide, suppression impossible.', 'error');
      return;
    }

    const result = await Swal.fire({
      title: 'Supprimer cette facture ?',
      text: `La facture ${invoice.invoiceNumber} sera supprimée définitivement.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#9ca3af'
    });
    if (!result.isConfirmed) return;

    try {
      try {
        const actor = buildLogActor(currentAgent);
        await appendFactureLogByInvoiceNumber(
          invoice.invoiceNumber,
          actor,
          'Suppression',
          'Facture supprimée depuis le menu contextuel.'
        );
        await appendFactureDeletionAuditLog({
          invoiceNumber: invoice.invoiceNumber,
          invoiceType: String(activeMenu || '').includes('ffg') ? 'frais-generaux' : 'operationnel',
          actor,
          explication: 'Facture supprimée depuis le menu contextuel.',
        });
      } catch (logError) {
        console.error('Erreur journalisation facture (suppression):', logError);
      }

      const { error } = await supabase
        .from('FACTURES')
        .delete()
        .eq('ID', invoice.id);

      if (error) {
        Swal.fire('Erreur', `Suppression impossible: ${error.message}`, 'error');
        return;
      }

      Swal.fire('Succès', 'Facture supprimée avec succès.', 'success');
      refreshAllData();
    } catch (error) {
      console.error('Erreur suppression facture:', error);
      Swal.fire('Erreur', 'Une erreur est survenue lors de la suppression.', 'error');
    }
  };

  const handleAddToPaymentOrder = async (invoice: Invoice) => {
    try {
      await ordoPaiementService.addInvoiceToOrdre(invoice);
      // Optionally show a success message
      alert(`Facture ${invoice.invoiceNumber} ajoutée à l'ordre de paiement du jour`);
    } catch (err) {
      console.error('Erreur lors de l\'ajout à l\'ordre de paiement:', err);
      alert('Erreur lors de l\'ajout à l\'ordre de paiement');
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency?.toLowerCase()) {
      case 'urgent':
        return <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-[10px] font-semibold">Urgent</span>;
      case 'prioritaire':
        return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-[10px] font-semibold">Prioritaire</span>;
      case 'haute':
        return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-[10px] font-semibold">Haute</span>;
      case 'moyenne':
        return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-[10px] font-semibold">Moyenne</span>;
      case 'basse':
        return <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-[10px] font-semibold">Basse</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-[10px] font-semibold">Normal</span>;
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg overflow-hidden p-0 m-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {activeMenu === 'factures-validated' && (
                  <th className="px-4 py-2 text-center text-[10px] font-bold text-gray-900 uppercase">OP</th>
                )}
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('receptionDate')}>
                  Date réception {sortBy === 'receptionDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">N° facture</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">Fournisseur</th>
                {agent?.REGION === 'TOUT' && (
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">Région</th>
                )}
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('amount')}>
                  Montant {sortBy === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">N° dossier</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">Catégorie de charge</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('dueDate')}>
                  Échéance {sortBy === 'dueDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">Priorité de paiement</th>
                <th className="px-4 py-2 text-center text-[10px] font-bold text-gray-900 uppercase">Fichier</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-900 uppercase">Validation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedInvoices.length === 0 ? (
                <tr key="no-invoices">
                  <td colSpan={agent?.REGION === 'TOUT' ? 11 : 10} className="px-6 py-8 text-center text-gray-500">
                    Aucune facture trouvée
                  </td>
                </tr>
              ) : (
                sortedInvoices.map((invoice) => {
                  const daysInfo = calculateDaysRemaining(invoice.dueDate || null);
                  const isOverdue = daysInfo.isOverdue;
                  const isInOrder = invoicesInOrderPaiement.includes(invoice.id);
                  
                  return (
                    <tr 
                      key={invoice.id} 
                      className={`hover:shadow-sm transition-all duration-200 cursor-pointer border-b border-gray-100 ${
                        isOverdue 
                          ? 'border-l-4 border-l-red-600 bg-red-50 hover:bg-red-100 hover:border-red-200'
                          : 'hover:bg-blue-50 hover:border-blue-200'
                      }`}
                      onContextMenu={(e) => handleContextMenu(e, invoice)}
                    >
                      {activeMenu === 'factures-validated' && (
                        <td className="px-4 py-2 text-center">
                          {isInOrder ? (
                            <Star size={16} className="text-yellow-500 fill-yellow-500" title="Programmée" />
                          ) : (
                            <input 
                              type="checkbox"
                              onChange={async (e) => {
                                if (e.target.checked) {
                                  await handleAddToPaymentOrder(invoice);
                                  // Recharger les invoices in order
                                  const ids = await ordoPaiementService.getInvoicesInTodayOrdre();
                                  setInvoicesInOrderPaiement(ids);
                                }
                              }}
                              className="w-4 h-4 cursor-pointer accent-blue-600"
                              title="Ajouter à l'ordre de paiement"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-1">
                          <div className="text-[11px] text-gray-900 whitespace-nowrap font-semibold">
                            {formatDateFr(invoice.receptionDate)}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[11px] font-semibold">
                        <button
                          onClick={() => handleViewInvoice(invoice)}
                          className="text-blue-600 hover:text-blue-800 hover:underline transition-all duration-200 transform hover:scale-105"
                        >
                          {invoice.invoiceNumber}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-gray-900 hover:text-gray-700 transition-colors">{invoice.supplier}</td>
                      {agent?.REGION === 'TOUT' && (
                        <td className="px-4 py-2 text-[11px] text-gray-900 hover:text-gray-700 transition-colors">{invoice.region}</td>
                      )}
                      <td className="px-4 py-2 text-[11px] font-bold text-gray-900 hover:text-gray-700 transition-colors">
                        <span>{(() => {
                          const amountInfo = formatAmount(invoice.amount || 0, invoice.currency || 'USD');
                          return amountInfo.formatted;
                        })()}$</span>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-gray-900 whitespace-nowrap">
                        {invoice.fileNumber || '-'}
                      </td>
                      <td className="px-4 py-2">
                        {invoice.chargeCategory?.toLowerCase() === 'bulletin' ? (
                          <span className="inline-flex items-center gap-1 bg-red-200 bg-opacity-40 text-red-800 text-[10px] px-2 py-1 rounded-full font-semibold border border-red-300">
                            ⚠️ Bulletin
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-600">{invoice.chargeCategory || '-'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-gray-900 hover:text-gray-700 transition-colors">
                        <div className="flex flex-col gap-1">
                          <div className={`${isOverdue ? 'animate-blink text-red-600 font-bold' : 'text-gray-900'} whitespace-nowrap`}>
                            {formatDateFr(invoice.dueDate || null)}
                          </div>
                          <div className={`w-fit px-2 py-1 rounded-full text-[9px] font-semibold whitespace-nowrap ${
                            isOverdue 
                              ? 'bg-red-100 text-red-800' 
                              : daysInfo.days === 0 
                              ? 'bg-orange-100 text-orange-800'
                              : daysInfo.days <= 3
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {daysInfo.text}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 hover:transform hover:scale-105 transition-all duration-200">
                        {getUrgencyBadge(invoice.urgencyLevel)}
                      </td>
                      <td className="px-4 py-2 text-center hover:bg-gray-50 rounded transition-colors duration-200">
                      {invoice.attachedInvoiceUrl ? (
                        <button
                          onClick={() => setPdfModal({ invoice, url: invoice.attachedInvoiceUrl! })}
                          className="inline-flex items-center justify-center text-red-900 hover:text-red-700 hover:bg-red-100 p-1.5 rounded transition-all duration-200 transform hover:scale-110"
                          title="Visualiser la facture"
                        >
                          <FileText size={16} />
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 hover:bg-gray-50 rounded transition-colors duration-200">
                      {/* Barre de progression des validations */}
                      <div className="w-full">
                        {(() => {
                          // Nouvelle règle: DR = 50%, DOP = 100% (plus de règle de montant)
                          const validationCount = invoice.validations || 0;
                          const drValidated = validationCount >= 1; // Au moins DR validé
                          const dopValidated = validationCount >= 2; // Au moins DR + DOP validés
                          
                          let percentage = 0;
                          if (dopValidated) percentage = 100;
                          else if (drValidated) percentage = 50;
                          
                          return (
                            <div className="flex flex-col gap-1">
                              {/* Barre de progression avec % centré et dégradé vert */}
                              <div className="relative w-full bg-gray-200 rounded-full h-5 hover:shadow-md transition-all duration-200">
                                <div 
                                  className="h-5 rounded-full transition-all duration-300"
                                  style={{ 
                                    width: `${percentage}%`,
                                    background: percentage === 0 ? '#e5e7eb' : 
                                              percentage <= 33 ? '#fbbf24' :
                                              percentage <= 66 ? '#34d399' :
                                              '#10b981'
                                  }}
                                ></div>
                                {/* Pourcentage toujours au centre avec couleur adaptative */}
                                <span className="absolute inset-0 flex items-center justify-center">
                                  <span className={`text-[9px] font-bold ${percentage > 50 ? 'text-white' : 'text-gray-700'}`}>
                                    {Math.round(percentage)}%
                                  </span>
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
        </table>
      </div>
    </div>

    {/* Menu contextuel */}
    {contextMenu && contextMenu.invoice && (
      <ContextMenu
        key="context-menu"
        invoice={contextMenu.invoice}
        position={contextMenu.position}
        onView={handleViewInvoice}
        onEdit={handleEditInvoice}
        onDelete={handleDeleteInvoice}
        onPay={handlePayInvoice}
        onAddToPaymentOrder={handleAddToPaymentOrder}
        onClose={() => setContextMenu(null)}
        activeMenu={activeMenu}
      />
    )}

    {/* Modal PDF Viewer */}
    {pdfModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[95vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between bg-gray-50 border-b px-6 py-4 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Facture {pdfModal.invoice.invoiceNumber}</h2>
              <p className="text-sm text-gray-600">Visualisation du document</p>
            </div>
            <button
              onClick={() => setPdfModal(null)}
              className="text-gray-500 hover:text-gray-700 transition-colors p-1 hover:bg-gray-200 rounded"
            >
              <X size={24} />
            </button>
          </div>

          {/* PDF Content */}
          <div className="flex-1 overflow-hidden">
            <iframe
              src={pdfModal.url}
              className="w-full h-full border-none"
              title={`Facture ${pdfModal.invoice.invoiceNumber}`}
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 flex-shrink-0">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 flex items-center gap-2 font-medium shadow-md hover:shadow-lg"
              title="Imprimer le document"
            >
              <Printer size={16} />
              Imprimer
            </button>
            <a
              href={pdfModal.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 flex items-center gap-2 font-medium shadow-md hover:shadow-lg"
            >
              <Download size={16} />
              Télécharger
            </a>
            <button
              onClick={() => setPdfModal(null)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors hover:border-gray-400"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    )}

    {viewModal && (
      <ViewInvoiceModal
        key="view-modal"
        invoice={viewModal}
        onClose={() => setViewModal(null)}
      />
    )}

    {/* Modal d'édition */}
    {editModal && (
      <EditInvoiceForm
        key="edit-modal"
        invoice={editModal}
        onSubmit={(updatedData) => {
          console.log('Facture mise à jour:', updatedData);
          setEditModal(null);
        }}
        onCancel={() => setEditModal(null)}
      />
    )}

    {/* Modal de paiement */}
    {paymentModal && (
      <PaiementModal
        key="payment-modal"
        invoice={paymentModal}
        onClose={() => setPaymentModal(null)}
        onSuccess={() => {
          setPaymentModal(null);
          // Optionnel: Rafraîchir la liste des factures
        }}
      />
    )}
    </>
  );
}

export default InvoiceTable;

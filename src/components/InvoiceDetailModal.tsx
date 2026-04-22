import { X, Printer, Maximize2, CreditCard, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Invoice } from '../services/tableService';
import { formatCurrency } from '../utils/formatters';
import { supabase } from '../services/supabase';
import ViewInvoiceModal from './ViewInvoiceModal';
import PaiementModal from './PaiementModal';
import ViewPdfModal from './ViewPdfModal';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceRemoved?: () => void;
  title: string;
  invoices: Invoice[];
  ordoPaiementId?: number;
  summary?: {
    totalAmount?: number;
    totalPaid?: number;
    totalRemaining?: number;
  };
}

interface InvoiceWithPayments extends Invoice {
  totalPaid: number;
  solde: number;
  hasPayments: boolean;
  'Facture attachée'?: string;
  'Catégorie de charge'?: string;
  'Niveau urgence'?: string;
  'Région'?: string;
  'Délais de paiement'?: number;
  'Échéance'?: string;
}

function InvoiceDetailModal({ 
  isOpen, 
  onClose, 
  onInvoiceRemoved,
  title, 
  invoices,
  ordoPaiementId,
  summary 
}: InvoiceDetailModalProps) {
  const { success, error: showError } = useToast();
  const { agent } = useAuth();
  const [invoicesWithPayments, setInvoicesWithPayments] = useState<InvoiceWithPayments[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewInvoiceModal, setViewInvoiceModal] = useState<{ isOpen: boolean; invoice: any }>(
    { isOpen: false, invoice: null }
  );
  const [paiementModal, setPaiementModal] = useState<{ isOpen: boolean; invoice: any; ordoPaiementId?: number }>(
    { isOpen: false, invoice: null }
  );
  const [pdfModal, setPdfModal] = useState<{ isOpen: boolean; url?: string; title: string; summary?: { totalAmount?: number; totalPaid?: number; totalRemaining?: number } }>(
    { isOpen: false, title: '' }
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadInvoicePayments();
    }
  }, [isOpen, invoices]);

  const loadInvoicePayments = async () => {
    setLoading(true);
    try {
      const { data: paiements } = await supabase
        .from('PAIEMENTS')
        .select('NumeroFacture, montantPaye');

      // Create map of invoice numbers with their total paid amounts
      const paymentMap = new Map<string, number>();
      if (paiements) {
        paiements.forEach((p: any) => {
          const invoiceNumber = p.NumeroFacture;
          const paid = (paymentMap.get(invoiceNumber) || 0) + (parseFloat(p.montantPaye) || 0);
          paymentMap.set(invoiceNumber, paid);
        });
      }

      // Filter invoices by region if agent has a specific region
      const filteredInvoices = agent?.REGION && agent.REGION !== 'TOUT' 
        ? invoices.filter(inv => (inv as any)['Région'] === agent.REGION)
        : invoices;

      // Enrich invoices with payment data
      const enriched = filteredInvoices.map((inv) => {
        const invoiceNumber = inv['Numéro de facture'];
        const totalPaid = paymentMap.get(invoiceNumber) || 0;
        const montant = parseFloat(inv.Montant as any) || 0;
        const solde = montant - totalPaid;
        const hasPayments = totalPaid > 0;

        return {
          ...inv,
          totalPaid,
          solde,
          hasPayments,
        };
      });

      setInvoicesWithPayments(enriched);
    } catch (err) {
      console.error('Erreur lors du chargement des paiements:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '', 'width=1400,height=900');
    if (printWindow) {
      const table = document.querySelector('table')?.outerHTML;
      const printStyle = `
        <style>
          @media print {
            @page {
              size: landscape;
              margin: 5mm;
            }
            body {
              margin: 0;
              padding: 10mm;
              font-family: Arial, sans-serif;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 6px;
              text-align: left;
            }
            th {
              background-color: #e5e7eb;
              font-weight: bold;
            }
            tr:nth-child(even) {
              background-color: #f9fafb;
            }
          }
        </style>
      `;
      const content = `
        ${printStyle}
        <h2>${title}</h2>
        ${table}
        <div style="margin-top: 20px; font-size: 12px; font-weight: bold;">
          <p>Total Facture: $${formatCurrency(displayTotals.totalAmount)} | Montant Payé: $${formatCurrency(displayTotals.totalPaid)} | Solde à Payer: $${formatCurrency(displayTotals.totalRemaining)}</p>
        </div>
      `;
      printWindow.document.write(content);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  const exportToExcel = () => {
    // Préparer les données du tableau
    const tableData: any[] = sortedInvoices.map(invoice => ({
      'Numéro Facture': invoice['Numéro de facture'],
      'Fournisseur': invoice.Fournisseur,
      'Date Réception': new Date(invoice['Date de réception']).toLocaleDateString('fr-FR'),
      'Montant': parseFloat(invoice.Montant as any) || 0,
      'Montant Payé': invoice.totalPaid,
      'Solde à Payer': invoice.solde
    }));

    // Ajouter une ligne vide puis les totaux
    tableData.push({
      'Numéro Facture': '',
      'Fournisseur': '',
      'Date Réception': '',
      'Montant': 0,
      'Montant Payé': 0,
      'Solde à Payer': 0
    });

    tableData.push({
      'Numéro Facture': 'TOTAUX',
      'Fournisseur': '',
      'Date Réception': '',
      'Montant': displayTotals.totalAmount,
      'Montant Payé': displayTotals.totalPaid,
      'Solde à Payer': displayTotals.totalRemaining
    });

    // Créer un workbook et ajouter la feuille
    const worksheet = XLSX.utils.json_to_sheet(tableData);
    
    // Définir la largeur des colonnes
    const colWidths = [
      { wch: 15 }, // Numéro Facture
      { wch: 20 }, // Fournisseur
      { wch: 15 }, // Date Réception
      { wch: 15 }, // Montant
      { wch: 15 }, // Montant Payé
      { wch: 15 }  // Solde à Payer
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title);

    // Télécharger le fichier
    XLSX.writeFile(workbook, `${title.replace(/\s+/g, '_')}.xlsx`);
  };

  const calculateTotals = () => {
    const totals = {
      totalAmount: 0,
      totalPaid: 0,
      totalRemaining: 0
    };

    invoicesWithPayments.forEach((invoice) => {
      totals.totalAmount += parseFloat(invoice.Montant as any) || 0;
      totals.totalPaid += invoice.totalPaid || 0;
      totals.totalRemaining += invoice.solde || 0;
    });

    return totals;
  };

  const displayTotals = calculateTotals();

  const calculateDueDate = (invoice: InvoiceWithPayments): Date | null => {
    // Si l'échéance est définie, l'utiliser
    if (invoice['Échéance']) {
      return new Date(invoice['Échéance']);
    }
    
    // Sinon, calculer à partir de la date de réception + délais de paiement
    if (invoice['Date de réception'] && invoice['Délais de paiement']) {
      const receptionDate = new Date(invoice['Date de réception']);
      const daysToAdd = invoice['Délais de paiement'] as any as number;
      const dueDate = new Date(receptionDate);
      dueDate.setDate(dueDate.getDate() + daysToAdd);
      return dueDate;
    }
    
    return null;
  };

  const isInvoiceOverdue = (invoice: InvoiceWithPayments): boolean => {
    const dueDate = calculateDueDate(invoice);
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today && invoice.solde > 0.01;
  };

  const sortedInvoices = [...invoicesWithPayments].sort((a, b) => {
    const montantA = parseFloat(a.Montant as any) || 0;
    const montantB = parseFloat(b.Montant as any) || 0;
    return montantB - montantA;
  });

  const handleInvoiceNumberClick = async (invoice: InvoiceWithPayments) => {
    if (invoice.hasPayments) {
      const { data, error } = await supabase
        .from('FACTURES')
        .select('*')
        .eq('ID', invoice.ID)
        .single();

      if (!error && data) {
        const invoiceForModal = {
          invoiceNumber: data['Numéro de facture'],
          amount: parseFloat(data.Montant),
          supplier: data.Fournisseur,
          receptionDate: data['Date de réception'],
        };
        setPaiementModal({ isOpen: true, invoice: invoiceForModal, ordoPaiementId });
      }
    } else {
      const { data, error } = await supabase
        .from('FACTURES')
        .select('*')
        .eq('ID', invoice.ID)
        .single();

      if (!error && data) {
        const invoiceForModal = {
          invoiceNumber: data['Numéro de facture'],
          amount: parseFloat(data.Montant),
          supplier: data.Fournisseur,
          receptionDate: data['Date de réception'],
        };
        setViewInvoiceModal({ isOpen: true, invoice: invoiceForModal });
      }
    }
  };

  const handlePaymentButtonClick = async (invoice: InvoiceWithPayments) => {
    const { data, error } = await supabase
      .from('FACTURES')
      .select('*')
      .eq('ID', invoice.ID)
      .single();

    if (!error && data) {
      const invoiceForModal = {
        invoiceNumber: data['Numéro de facture'],
        amount: parseFloat(data.Montant),
        supplier: data.Fournisseur,
        receptionDate: data['Date de réception'],
      };
      setPaiementModal({ isOpen: true, invoice: invoiceForModal, ordoPaiementId });
    }
  };

  const handleRemoveInvoice = async (invoice: InvoiceWithPayments) => {
    if (!ordoPaiementId) return;

    try {
      // Get the current order
      const { data: order, error: fetchError } = await supabase
        .from('ORDRE_PAIEMENT')
        .select('facture')
        .eq('ID', ordoPaiementId)
        .single();

      if (fetchError || !order) {
        showError('Erreur: Ordre de paiement non trouvé');
        return;
      }

      // Parse the facture JSON
      let factures: any[] = [];
      try {
        const parsed = JSON.parse(order.facture);
        factures = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        showError('Erreur de parsing du JSON');
        return;
      }

      // Filter out the invoice to remove
      const invoiceNumber = invoice['Numéro de facture'];
      const updatedFactures = factures.filter((f: any) => 
        (f.invoiceNumber !== invoiceNumber && f['Numéro de facture'] !== invoiceNumber)
      );

      // Update the order with the new facture JSON
      const { error: updateError } = await supabase
        .from('ORDRE_PAIEMENT')
        .update({ 
          facture: JSON.stringify(updatedFactures),
          NumeroFacture: updatedFactures.map((f: any) => f.invoiceNumber || f['Numéro de facture']).join(', ')
        })
        .eq('ID', ordoPaiementId);

      if (updateError) {
        showError('Erreur lors de la suppression: ' + updateError.message);
        return;
      }

      success(`✓ Facture ${invoiceNumber} retirée de l'ordre de paiement`);
      
      // Remove from local state
      setInvoicesWithPayments(invoicesWithPayments.filter(inv => inv.ID !== invoice.ID));
      
      // Notify parent component to reload
      onInvoiceRemoved?.();
    } catch (err) {
      showError('Erreur lors de la suppression: ' + (err instanceof Error ? err.message : 'Erreur inconnue'));
    }
  };

  const handleClose = () => {
    // Actualiser les données du modal avant fermeture
    loadInvoicePayments();
    
    // Rafraîchir le tableau des données à la fermeture
    if (onInvoiceRemoved) {
      onInvoiceRemoved();
    }
    
    // Émettre l'événement de fermeture de modal pour le rechargement automatique
    window.dispatchEvent(new Event('modalClosed'));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 ${isFullscreen ? 'p-0' : ''}`}>
        <div className={`bg-white rounded-lg shadow-xl overflow-hidden flex flex-col ${isFullscreen ? 'w-full h-screen' : 'max-w-[1400px] w-full h-[95vh]'}`}>
          {/* En-tête */}
          <div className="flex items-center justify-between bg-gray-200 border-b p-4 shadow-md">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
                title="Vue plein écran"
              >
                <Maximize2 size={20} className="text-gray-600" />
              </button>
              <button
                onClick={exportToExcel}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
                title="Exporter en Excel"
              >
                <i className="fa fa-file-excel-o text-gray-600 text-xl"></i>
              </button>
              <button
                onClick={handlePrint}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
                title="Imprimer"
              >
                <Printer size={20} className="text-gray-600" />
              </button>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-300 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>
          </div>

          {/* Résumé sous le titre */}
          <div className="border-b p-4 bg-gray-100">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-600 mb-0.5">Total Facture ({sortedInvoices.length})</p>
                <p className="text-base font-bold text-gray-900">${formatCurrency(displayTotals.totalAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-0.5">Montant Payé</p>
                <p className="text-base font-bold text-green-600">${formatCurrency(displayTotals.totalPaid)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-0.5">Solde à Payer</p>
                <p className="text-base font-bold text-red-600">${formatCurrency(displayTotals.totalRemaining)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-0.5">Nombre de factures</p>
                <p className="text-base font-bold text-gray-900">{sortedInvoices.length}</p>
              </div>
            </div>
          </div>

          {/* Tableau des factures */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <p className="text-center text-gray-500 py-8 text-sm">Chargement des données...</p>
            ) : invoicesWithPayments.length === 0 ? (
              <p className="text-center text-gray-500 py-8 text-sm">Aucune facture à afficher</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b bg-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                      Numéro Facture
                    </th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                      Fournisseur
                    </th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                      Date Réception
                    </th>
                    {agent?.REGION === 'TOUT' && (
                      <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                        Région
                      </th>
                    )}
                    <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                      Catégorie de charge
                    </th>
                    <th className="text-center py-2 px-3 font-semibold text-gray-900 text-xs">
                      Priorité de paiement
                    </th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-900 text-xs">
                      Échéance
                    </th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-900 text-xs">
                      Montant
                    </th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-900 text-xs">
                      Montant Payé
                    </th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-900 text-xs">
                      Solde à Payer
                    </th>
                    <th className="text-center py-2 px-3 font-semibold text-gray-900 text-xs">
                      PDF
                    </th>
                    {ordoPaiementId && (
                      <th className="text-center py-2 px-3 font-semibold text-gray-900 text-xs">
                        Payer
                      </th>
                    )}
                    {ordoPaiementId && (
                      <th className="text-center py-2 px-3 font-semibold text-gray-900 text-xs">
                        Retirer
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedInvoices.map((invoice, index) => {
                    const isPaid = invoice.solde <= 0.01;
                    const isPartiallyPaid = invoice.totalPaid > 0 && invoice.solde > 0.01;
                    const isOverdue = isInvoiceOverdue(invoice);
                    const showBlueBar = isPaid || isPartiallyPaid;
                    
                    return (
                    <tr key={index} className={`border-b hover:bg-blue-50 hover:shadow-sm transition-all duration-200 cursor-context-menu hover:border-blue-200 border-l-4 ${
                      isOverdue ? 'border-l-red-500' : showBlueBar ? 'border-l-blue-500' : 'border-l-yellow-400'
                    }`}>
                      <td 
                        className="py-2 px-3 text-xs text-blue-600 cursor-pointer hover:underline font-semibold hover:text-blue-800 transform hover:scale-105 transition-all duration-200"
                        onClick={() => handleInvoiceNumberClick(invoice)}
                      >
                        {invoice['Numéro de facture']}
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-700 hover:text-gray-900 transition-colors">
                        {invoice.Fournisseur}
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-700 hover:text-gray-900 transition-colors">
                        {new Date(invoice['Date de réception']).toLocaleDateString('fr-FR')}
                      </td>
                      {agent?.REGION === 'TOUT' && (
                        <td className="py-2 px-3 text-xs">
                          {(() => {
                            const region = invoice['Région'] as string;
                            if (!region) return <span className="text-gray-500">N/A</span>;
                            
                            const regionColors: Record<string, { bg: string; text: string }> = {
                              'OUEST': { bg: 'bg-blue-100', text: 'text-blue-800' },
                              'EST': { bg: 'bg-green-100', text: 'text-green-800' },
                              'SUD': { bg: 'bg-orange-100', text: 'text-orange-800' },
                              'NORD': { bg: 'bg-purple-100', text: 'text-purple-800' }
                            };
                            
                            const colors = regionColors[region.toUpperCase()] || { bg: 'bg-gray-100', text: 'text-gray-800' };
                            
                            return (
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                                {region}
                              </span>
                            );
                          })()}
                        </td>
                      )}
                      <td className="py-2 px-3 text-xs text-gray-700 hover:text-gray-900 transition-colors">
                        {invoice['Catégorie de charge'] === 'Bulletin de liquidation' ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                            <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                            Bulletin de liquidation
                          </span>
                        ) : (
                          invoice['Catégorie de charge'] || 'N/A'
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {invoice['Niveau urgence'] || 'N/A'}
                      </td>
                      <td className={`py-2 px-3 text-xs transition-colors font-semibold ${
                        isOverdue ? 'text-red-600 bg-red-50' : 'text-gray-700'
                      }`}>
                        {(() => {
                          const dueDate = calculateDueDate(invoice);
                          return dueDate 
                            ? dueDate.toLocaleDateString('fr-FR')
                            : 'N/A';
                        })()}
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-900 text-right font-semibold hover:text-gray-950 transition-colors">
                        {formatCurrency(invoice.Montant)} USD
                      </td>
                      <td className="py-2 px-3 text-xs text-right font-semibold bg-gray-100 hover:bg-gray-200 transition-colors">
                        <span className={invoice.totalPaid > 0 ? 'text-green-600' : 'text-gray-700'}>
                          {formatCurrency(invoice.totalPaid)} USD
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs text-right font-semibold bg-gray-100 hover:bg-gray-200 transition-colors">
                        <span className={invoice.solde > 0 ? 'text-red-600' : 'text-green-600'}>
                          {formatCurrency(invoice.solde)} USD
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center hover:bg-blue-100 rounded transition-all duration-200">
                        {invoice['Facture attachée'] ? (
                          <button
                            onClick={() => 
                              setPdfModal({
                                isOpen: true,
                                url: invoice['Facture attachée'],
                                title: `Facture ${invoice['Numéro de facture']}`,
                                summary: {
                                  totalAmount: parseFloat(invoice.Montant as any) || 0,
                                  totalPaid: invoice.totalPaid,
                                  totalRemaining: invoice.solde
                                }
                              })
                            }
                            className="inline-flex items-center justify-center p-2 text-red-700 hover:text-red-900 hover:bg-red-100 rounded-lg transition-all duration-200 transform hover:scale-125"
                            title="Afficher le PDF"
                          >
                            <i className="fa fa-file-pdf-o text-lg"></i>
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">N/A</span>
                        )}
                      </td>
                      {ordoPaiementId && (
                        <td className="py-2 px-3 text-center hover:bg-green-100 rounded transition-all duration-200">
                          <button
                            onClick={() => handlePaymentButtonClick(invoice)}
                            disabled={invoice.solde <= 0.01}
                            className={`inline-flex items-center justify-center p-2 rounded-lg transition-all duration-200 transform hover:scale-110 ${
                              invoice.solde <= 0.01
                                ? 'text-gray-400 cursor-not-allowed opacity-50'
                                : 'text-green-700 hover:text-green-900 hover:bg-green-200'
                            }`}
                            title={invoice.solde <= 0.01 ? 'Facture entièrement payée' : 'Enregistrer un paiement'}
                          >
                            <CreditCard size={18} />
                          </button>
                        </td>
                      )}
                      {ordoPaiementId && (
                        <td className="py-2 px-3 text-center hover:bg-red-100 rounded transition-all duration-200">
                          <button
                            onClick={() => handleRemoveInvoice(invoice)}
                            className="inline-flex items-center justify-center p-2 text-red-700 hover:text-red-900 hover:bg-red-100 rounded-lg transition-all duration-200 transform hover:scale-110"
                            title="Retirer de l'ordre de paiement"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ViewInvoiceModal */}
      {viewInvoiceModal.isOpen && viewInvoiceModal.invoice && (
        <ViewInvoiceModal
          invoice={viewInvoiceModal.invoice}
          onClose={() => setViewInvoiceModal({ isOpen: false, invoice: null })}
        />
      )}

      {/* PaiementModal */}
      {paiementModal.isOpen && paiementModal.invoice && (
        <PaiementModal
          invoice={paiementModal.invoice}
          onClose={() => {
            // Actualiser les données du modal avant fermeture
            loadInvoicePayments();
            
            // Émettre l'événement de fermeture de modal pour le rechargement automatique
            window.dispatchEvent(new Event('modalClosed'));
            onClose();
          }}
          readOnly={!paiementModal.ordoPaiementId}
          ordoPaiementId={paiementModal.ordoPaiementId}
        />
      )}

      {/* ViewPdfModal */}
      <ViewPdfModal
        isOpen={pdfModal.isOpen}
        onClose={() => setPdfModal({ isOpen: false, title: '', summary: undefined })}
        pdfUrl={pdfModal.url}
        title={pdfModal.title}
        summary={pdfModal.summary}
      />
    </>
  );
}

export default InvoiceDetailModal;

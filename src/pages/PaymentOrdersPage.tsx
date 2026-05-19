import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, DollarSign, FileText, AlertCircle, Download } from 'lucide-react';
import { ordoPaiementService, OrdoPaiement } from '../services/tableService';
import { usePermission } from '../hooks/usePermission';
import AccessDenied from '../components/AccessDenied';
import InvoiceDetailModal from '../components/InvoiceDetailModal';
import { Invoice } from '../types';
import * as XLSX from 'xlsx';

function PaymentOrdersPage() {
  const { canView } = usePermission();
  const [orders, setOrders] = useState<OrdoPaiement[]>([]);
  const [allOrders, setAllOrders] = useState<OrdoPaiement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOrderInvoices, setSelectedOrderInvoices] = useState<any[]>([]);
  const [selectedOrderTitle, setSelectedOrderTitle] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<number>();
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [stats, setStats] = useState({
    count: 0,
    totalAmount: 0,
    pending: 0,
    processed: 0
  });

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    filterOrdersByRegion(selectedRegion, selectedYear, selectedMonth);
  }, [selectedRegion, allOrders, selectedYear, selectedMonth]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await ordoPaiementService.getAll();
      setAllOrders(data || []);
      
      // Calculer les statistiques
      let totalCount = 0;
      let totalAmount = 0;
      let totalPaid = 0;
      let totalRemaining = 0;
      
      data?.forEach(order => {
        totalCount++;
        const amount = calculateTotalAmount(order);
        totalAmount += amount;
        totalPaid += calculatePaymentAmount(order);
        totalRemaining += calculateRemainingAmount(order);
      });
      
      setStats({
        count: totalCount,
        totalAmount,
        pending: totalPaid,
        processed: totalRemaining
      });
    } catch (err) {
      console.error('Erreur lors du chargement des ordres:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRegionFromOrder = (order: OrdoPaiement): string => {
    try {
      if (!order.facture) return '';
      const factures = JSON.parse(order.facture);
      if (Array.isArray(factures) && factures.length > 0) {
        return factures[0].region || '';
      }
    } catch {
      return '';
    }
    return '';
  };

  const filterOrdersByRegion = (region: string, year: string = '2026', month: string = 'all') => {
    let filtered = [...allOrders];
    
    if (region && region !== 'all') {
      filtered = filtered.filter(order => getRegionFromOrder(order) === region);
    }

    // Filtre par année
    if (year) {
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);
      filtered = filtered.filter(order => {
        if (!order.Date_ordre) return false;
        const orderDate = new Date(order.Date_ordre);
        return orderDate >= startDate && orderDate <= endDate;
      });
    }

    // Filtre par mois
    if (month && month !== 'all') {
      const monthNum = parseInt(month);
      filtered = filtered.filter(order => {
        if (!order.Date_ordre) return false;
        const orderDate = new Date(order.Date_ordre);
        return orderDate.getMonth() + 1 === monthNum;
      });
    }
    
    setOrders(filtered);
  };

  const handleExportToExcel = () => {
    if (orders.length === 0) {
      alert('Aucun ordre de paiement à exporter');
      return;
    }

    const exportData = orders.map(order => {
      const invoices = ordoPaiementService.getInvoicesFromOrder(order);
      const totalAmount = calculateTotalAmount(order);
      const statsData = calculateInvoiceStats(order);
      const region = getRegionFromOrder(order);
      
      return {
        'OP': `OP-${String(order.ID).padStart(4, '0')}`,
        'Date': formatDate(order.Date_ordre),
        'Montant total': totalAmount.toFixed(2),
        'Devise': 'USD',
        'Nb factures': statsData.total,
        'Factures payées': statsData.paid,
        'Factures restantes': statsData.remaining,
        'Statut': order.Statut || 'pending',
        'Région': region || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ordres de paiement');

    const colWidths = [
      { wch: 10 },
      { wch: 12 },
      { wch: 15 },
      { wch: 10 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 15 },
      { wch: 12 }
    ];
    ws['!cols'] = colWidths;

    const fileName = `Ordres_paiement_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
  };

  const handleViewOrder = (order: OrdoPaiement) => {
    const invoices = ordoPaiementService.getInvoicesFromOrder(order);
    setSelectedOrderInvoices(invoices);
    setSelectedOrderTitle(`Ordre de paiement du ${formatDate(order.Date_ordre)} (${invoices.length} facture${invoices.length > 1 ? 's' : ''})`);
    setSelectedOrderId(order.ID);
    setIsDetailModalOpen(true);
  };

  const formatCurrency = (amount: number): string => {
    return amount.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const calculateTotalAmount = (order: OrdoPaiement): number => {
    try {
      if (!order.facture) return 0;
      const factures = JSON.parse(order.facture);
      if (!Array.isArray(factures)) return 0;
      return factures.reduce((sum: number, f: any) => sum + (parseFloat(f.amount) || 0), 0);
    } catch {
      return 0;
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-[10px] font-semibold">En attente</span>;
      case 'validated':
        return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-[10px] font-semibold">Validé</span>;
      case 'processed':
        return <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-[10px] font-semibold">Traité</span>;
      case 'cancelled':
        return <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-[10px] font-semibold">Annulé</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-[10px] font-semibold">{status}</span>;
    }
  };

  const calculateInvoiceStats = (order: OrdoPaiement) => {
    try {
      if (!order.facture) return { total: 0, paid: 0, remaining: 0 };
      const factures = JSON.parse(order.facture);
      if (!Array.isArray(factures)) return { total: 0, paid: 0, remaining: 0 };
      
      const total = factures.length;
      const paid = factures.filter((f: any) => f.Payé === 'Oui' || f.paid === 'Oui' || f.paid === true).length;
      const remaining = total - paid;
      
      return { total, paid, remaining };
    } catch {
      return { total: 0, paid: 0, remaining: 0 };
    }
  };

  const regions = [
    { id: 'all', label: 'Toutes les régions' },
    { id: 'OUEST', label: 'OUEST' },
    { id: 'EST', label: 'EST' },
    { id: 'SUD', label: 'SUD' }
  ];

  const years = [
    { id: '2026', label: '2026' },
    { id: '2025', label: '2025' },
    { id: '2024', label: '2024' }
  ];

  const months = [
    { id: 'all', label: 'Tous les mois' },
    { id: '1', label: 'Janvier' },
    { id: '2', label: 'Février' },
    { id: '3', label: 'Mars' },
    { id: '4', label: 'Avril' },
    { id: '5', label: 'Mai' },
    { id: '6', label: 'Juin' },
    { id: '7', label: 'Juillet' },
    { id: '8', label: 'Août' },
    { id: '9', label: 'Septembre' },
    { id: '10', label: 'Octobre' },
    { id: '11', label: 'Novembre' },
    { id: '12', label: 'Décembre' }
  ];

  const calculatePaymentAmount = (order: OrdoPaiement): number => {
    try {
      if (!order.facture) return 0;
      const factures = JSON.parse(order.facture);
      if (!Array.isArray(factures)) return 0;
      return factures.reduce((sum: number, f: any) => {
        // Utiliser montantPaye s'il existe, sinon checker si c'est entièrement payé
        if (f.montantPaye !== undefined && f.montantPaye !== null) {
          return sum + (parseFloat(f.montantPaye) || 0);
        }
        const isPaid = f.Payé === 'Oui' || f.paid === 'Oui' || f.paid === true;
        return sum + (isPaid ? (parseFloat(f.amount) || parseFloat(f.Montant) || 0) : 0);
      }, 0);
    } catch {
      return 0;
    }
  };

  const calculateRemainingAmount = (order: OrdoPaiement): number => {
    const total = calculateTotalAmount(order);
    const paid = calculatePaymentAmount(order);
    return total - paid;
  };

  if (!canView('factures')) {
    return <AccessDenied message="Vous n'avez pas accès aux ordres de paiement." />;
  }

  return (
    <div className="p-0 bg-white">
      {/* Filtres unifiés avec style tabs */}
      <div className="bg-gray-100 pr-4 pl-4 pt-4 pb-0 mb-6">
        {/* Header de la page */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Ordre de paiement</h1>
            <p className="text-gray-600 mt-0">
              {orders.length} ordre{orders.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Onglets et contrôles */}
        <div className="flex items-center justify-between">
          {/* Onglets par région */}
          <div className="flex">
            {regions.map((region) => (
              <button
                key={region.id}
                onClick={() => handleRegionChange(region.id)}
                className={`pr-4 pl-4 pt-2 pb-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                  selectedRegion === region.id
                    ? 'font-bold text-black bg-white'
                    : 'text-gray-600'
                }`}
              >
                {region.label}
              </button>
            ))}
          </div>

          {/* Contrôles à droite */}
          <div className="flex items-center justify-end gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Année</label>
              <select 
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Mois</label>
              <select 
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {months.map((month) => (
                  <option key={month.id} value={month.id}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExportToExcel}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-gradient-to-r from-green-500 to-green-600 text-white rounded hover:from-green-600 hover:to-green-700 transition-all duration-200"
              title="Exporter en Excel"
            >
              <Download size={14} />
              Exporter
            </button>
            <button
              onClick={loadOrders}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded hover:from-gray-600 hover:to-gray-700 transition-all duration-200 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 bg-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement des ordres de paiement...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Cartes de statistiques */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4">
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-4 hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer text-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold opacity-90">Total Factures</p>
                      <p className="text-3xl font-bold">{stats.count.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                <div className="opacity-30">
                  <FileText size={32} />
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg shadow-lg p-4 hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer text-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold opacity-90">Factures Non Payées</p>
                      <p className="text-3xl font-bold">{formatCurrency(stats.processed)}</p>
                      <p className="text-xs opacity-75 mt-1">USD</p>
                    </div>
                  </div>
                </div>
                <div className="opacity-30">
                  <AlertCircle size={32} />
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg shadow-lg p-4 hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer text-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold opacity-90">Facture Bon à Payer</p>
                      <p className="text-3xl font-bold">{formatCurrency(stats.totalAmount)}</p>
                      <p className="text-xs opacity-75 mt-1">USD</p>
                    </div>
                  </div>
                </div>
                <div className="opacity-30">
                  <AlertCircle size={32} />
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-lg p-4 hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer text-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold opacity-90">Facture Payée</p>
                      <p className="text-3xl font-bold">{formatCurrency(stats.pending)}</p>
                      <p className="text-xs opacity-75 mt-1">USD</p>
                    </div>
                  </div>
                </div>
                <div className="opacity-30">
                  <DollarSign size={32} />
                </div>
              </div>
            </div>
          </div>

          {/* Tableau des ordres */}
          <div className="px-4 pb-4">
            {orders.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-8 text-center border border-gray-200">
                <Calendar size={48} className="text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Aucun ordre de paiement trouvé</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-center text-[12px] font-bold text-gray-900 uppercase">OP</th>
                      <th className="px-4 py-2 text-left text-[12px] font-bold text-gray-900 uppercase">Date</th>
                      <th className="px-4 py-2 text-right text-[12px] font-bold text-gray-900 uppercase">Montant total</th>
                      <th className="px-4 py-2 text-right text-[12px] font-bold text-gray-900 uppercase">Montant payé</th>
                      <th className="px-4 py-2 text-right text-[12px] font-bold text-gray-900 uppercase">Solde à payer</th>
                      <th className="px-4 py-2 text-center text-[12px] font-bold text-gray-900 uppercase">Factures Payées</th>
                      <th className="px-4 py-2 text-center text-[12px] font-bold text-gray-900 uppercase">Factures Restantes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {orders.map((order, index) => {
                      const totalAmount = calculateTotalAmount(order);
                      const paidAmount = calculatePaymentAmount(order);
                      const remainingAmount = calculateRemainingAmount(order);
                      const invoiceStats = calculateInvoiceStats(order);
                      
                      return (
                        <tr 
                          key={order.ID} 
                          className="hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
                          onDoubleClick={() => handleViewOrder(order)}
                        >
                          <td className="px-4 py-2 text-center text-[12px] font-bold text-gray-600">
                            OP-{String(order.ID).padStart(4, '0')}
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => handleViewOrder(order)}
                              className="text-blue-600 hover:text-blue-800 hover:underline font-semibold transition-all duration-200 text-[12px]"
                            >
                              {formatDate(order.Date_ordre)}
                            </button>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="text-[12px] font-bold text-gray-900">
                              {formatCurrency(totalAmount)}
                            </span>
                            <span className="text-[11px] text-gray-500 ml-1">USD</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="text-[12px] font-bold text-green-600">
                              {formatCurrency(paidAmount)}
                            </span>
                            <span className="text-[11px] text-gray-500 ml-1">USD</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="text-[12px] font-bold text-orange-600">
                              {formatCurrency(remainingAmount)}
                            </span>
                            <span className="text-[11px] text-gray-500 ml-1">USD</span>
                          </td>
                          <td className="px-4 py-2 text-center text-[12px] font-bold text-green-600">
                            {invoiceStats.paid} facture{invoiceStats.paid > 1 ? 's' : ''} / {invoiceStats.total}
                          </td>
                          <td className="px-4 py-2 text-center text-[12px] font-bold text-orange-600">
                            {invoiceStats.remaining} facture{invoiceStats.remaining > 1 ? 's' : ''} / {invoiceStats.total}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal de détail des factures */}
      <InvoiceDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedOrderInvoices([]);
          setSelectedOrderTitle('');
          setSelectedOrderId(undefined);
          // Recharger les ordres apres fermeture
          loadOrders();
        }}
        onInvoiceRemoved={() => {
          // Recharger les ordres quand une facture est retirée
          loadOrders();
        }}
        title={selectedOrderTitle}
        invoices={selectedOrderInvoices}
        ordoPaiementId={selectedOrderId}
      />
    </div>
  );
}

export default PaymentOrdersPage;

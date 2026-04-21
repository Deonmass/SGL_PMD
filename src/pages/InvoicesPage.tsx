import { useState } from 'react';
import { Plus, RefreshCw, FileText } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import AccessDenied from '../components/AccessDenied';
import StatCard from '../components/StatCard';
import InvoiceTable from '../components/InvoiceTable';
import { Invoice } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface InvoicesPageProps {
  filterType?: 'all' | 'pending' | 'validated' | 'paid' | 'partially-paid' | 'rejected' | 'overdue';
  activeMenu?: string;
  menuTitle?: string;
  onMenuChange?: (menu: string) => void;
}

function InvoicesPage({ filterType = 'all', activeMenu, menuTitle = 'Factures', onMenuChange }: InvoicesPageProps) {
  const { canView, canCreate, canEdit, canDelete } = usePermission();
  const { agent } = useAuth();
  
  const [selectedRegion, setSelectedRegion] = useState(agent?.REGION || 'all');

  const [invoices] = useState<Invoice[]>([
    {
      id: 1,
      invoiceNumber: 'E-45655',
      supplier: 'Commune de la Gombe',
      receptionDate: '11/04/2026',
      amount: 544.33,
      currency: 'USD',
      chargeCategory: '',
      urgencyLevel: 'Basse',
      status: 'pending',
      region: 'OUEST',
      validations: 0,
    },
    {
      id: 2,
      invoiceNumber: 'FAC-123456',
      supplier: 'AFRICELL',
      receptionDate: '10/04/2026',
      amount: 55.0,
      currency: 'USD',
      chargeCategory: 'Surestaries',
      urgencyLevel: 'Basse',
      status: 'validated',
      region: 'OUEST',
      validations: 1,
    },
    {
      id: 3,
      invoiceNumber: '04-90S',
      supplier: 'Agence de transport MCS',
      receptionDate: '11/04/2026',
      amount: 133.33,
      currency: 'USD',
      chargeCategory: 'Surestaries',
      urgencyLevel: 'Basse',
      status: 'validated',
      region: 'SUD',
      validations: 2,
    },
    {
      id: 4,
      invoiceNumber: 'FAC-789012',
      supplier: 'AFRICELL',
      receptionDate: '10/04/2026',
      amount: 1225000.0,
      currency: 'CDF',
      chargeCategory: '',
      urgencyLevel: 'Basse',
      status: 'pending',
      region: 'EST',
      validations: 0,
    },
    {
      id: 5,
      invoiceNumber: '04-90S',
      supplier: 'Agence de transport MCS',
      receptionDate: '11/04/2026',
      amount: 300000.0,
      currency: 'CDF',
      chargeCategory: '',
      urgencyLevel: 'Basse',
      status: 'validated',
      region: 'OUEST',
      validations: 1,
    },
  ]);

  // Filter by status
  let filtered = invoices;
  if (filterType === 'all') {
    filtered = invoices;
  } else if (filterType === 'pending' || filterType === 'validated' || filterType === 'paid' || filterType === 'rejected') {
    filtered = invoices.filter(inv => inv.status === filterType);
  } else if (filterType === 'partially-paid') {
    // Filter invoices with partially paid status (for now, using validated as proxy)
    filtered = invoices.filter(inv => inv.status === 'validated');
  } else if (filterType === 'overdue') {
    // Filter overdue invoices (for now, showing all validated invoices)
    filtered = invoices.filter(inv => inv.status === 'validated');
  }

  // Filter by region
  filtered = selectedRegion === 'all'
    ? filtered
    : filtered.filter(inv => inv.region === selectedRegion);

  // Calculate totals
  const totalUSD = filtered
    .filter(inv => inv.currency === 'USD')
    .reduce((sum, inv) => sum + inv.amount, 0);
  
  const totalCDF = filtered
    .filter(inv => inv.currency === 'CDF')
    .reduce((sum, inv) => sum + inv.amount, 0);
  
  const totalEUR = filtered
    .filter(inv => inv.currency === 'EUR')
    .reduce((sum, inv) => sum + inv.amount, 0);

  const totalFactures = totalUSD + (totalCDF / 2000) + totalEUR;

  if (!canView('factures')) {
    return <AccessDenied message="Vous n'avez pas accès aux factures." />;
  }

  return (
    <div className="p-8">
      {/* Top Bar */}
      <div className="mb-6 border-b border-gray-200 py-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{menuTitle}</h1>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-semibold text-sm">
            <FileText size={18} />
            Excel
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition font-semibold text-sm">
            <RefreshCw size={18} />
            Actualiser
          </button>
          {canCreate('factures') && (
            <button 
              onClick={() => onMenuChange?.('factures-new')}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition font-semibold text-sm"
            >
              <Plus size={18} />
              Nouvelle facture
            </button>
          )}
        </div>
      </div>

      {/* Regions Tabs */}
      <div className="mb-6 flex gap-4 border-b border-gray-200 pb-4">
        <button
          onClick={() => setSelectedRegion('all')}
          className={`px-4 py-2 font-semibold text-sm transition ${
            selectedRegion === 'all'
              ? 'text-gray-900 border-b-2 border-gray-900'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Toutes les régions
        </button>
        {['OUEST', 'SUD', 'EST'].map((region) => (
          <button
            key={region}
            onClick={() => setSelectedRegion(region)}
            className={`px-4 py-2 font-semibold text-sm transition ${
              selectedRegion === region
                ? 'text-red-500 border-b-2 border-red-500'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {region}
          </button>
        ))}
      </div>

      {/* Section Title */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">Factures par statut</h2>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="TOTAL FACTURE"
          value={totalFactures}
          currency="$"
          bgColor="bg-emerald-500"
          textColor="text-white"
        />
        <StatCard
          label="Total USD"
          value={totalUSD}
          currency="$"
          bgColor="bg-violet-500"
          textColor="text-white"
        />
        <StatCard
          label="Total CDF"
          value={totalCDF}
          currency="$"
          bgColor="bg-pink-500"
          textColor="text-white"
        />
        <StatCard
          label="Total €"
          value={totalEUR}
          currency="$"
          bgColor="bg-amber-500"
          textColor="text-white"
        />
      </div>

      {/* Invoice Table */}
      <InvoiceTable invoices={filtered} activeMenu={activeMenu} />
    </div>
  );
}

export default InvoicesPage;

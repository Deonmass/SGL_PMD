import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { usePermission } from './hooks/usePermission';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import SearchPage from './pages/SearchPage';
import InvoicesPage from './pages/InvoicesPage';
import ParametersPage from './pages/ParametersPage';
import UsersPage from './pages/UsersPage';
import InvoiceForm from './components/InvoiceForm';
import LoginPage from './pages/LoginPage';
import ToastContainer from './components/ToastContainer';
import ValidationPage from './pages/ValidationPage';
import PaiementsPage from './pages/PaiementsPage';
import PaymentOrdersPage from './pages/PaymentOrdersPage';
import { useBackgroundRealtimeSync } from './hooks/useBackgroundRealtimeSync';

// Menu labels mapping
const menuLabels: { [key: string]: string } = {
  dashboard: 'Dashboard',
  'dashboard-factures': 'Factures',
  'dashboard-liquidation': 'Bulletin de liquidation',
  search: 'Recherche avancée',
  'factures-new': 'Nouvelle facture',
  'factures-all': 'Factures',
  'factures-pending': 'En attente validation DR',
  'factures-pending-dop': 'En attente validation DOP',
  'factures-pending-dq': 'En attente validation DQ',
  'factures-validated': 'Validée (bon à payer)',
  'factures-paid': 'Payé',
  'factures-partially-paid': 'Partiellement payé',
  'factures-rejected': 'Rejeté',
  'factures-overdue': 'Facture Echues',
  'factures-payment-order': 'Ordres de Paiement',
  parameters: 'Paramètres',
  'parameters-suppliers': 'Fournisseurs',
  'parameters-charges': 'Types de charges',
  'parameters-agents': 'Agents',
  'parameters-centres': 'Centres de coût',
  'parameters-caisses': 'Caisses',
  'parameters-comptes': 'Comptes',
  users: 'Utilisateurs',
};

function AppContent() {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const { canView, canCreate, canEdit, canDelete } = usePermission();
  useBackgroundRealtimeSync();

  const getMenuTitle = (menu: string): string => {
    return menuLabels[menu] || menu;
  };

  const renderPage = () => {
    // Vérifier les permissions pour chaque page
    const menuPermissionMap: { [key: string]: string | null } = {
      'dashboard': 'dashboard',
      'dashboard-factures': 'dashboard',
      'dashboard-liquidation': 'dashboard',
      'search': 'recherche',
      'factures-new': 'factures',
      'factures-all': 'factures',
      'factures-pending': 'factures_pending_dr',
      'factures-pending-dop': 'factures_pending_dop',
      'factures-pending-dq': 'factures_pending_dq',
      'factures-validated': 'factures_validated',
      'factures-paid': 'factures_paid',
      'factures-partially-paid': 'factures_partially_paid',
      'factures-rejected': 'factures_rejected',
      'factures-overdue': 'factures_overdue',
      'factures-payment-order': 'factures_payment_order',
      'parameters': 'paramettre',
      'parameters-suppliers': 'fournisseurs',
      'parameters-charges': 'charges',
      'parameters-agents': 'utilisateurs',
      'parameters-centres': 'centres',
      'parameters-caisses': 'caisses',
      'parameters-comptes': 'comptes',
      'users': 'utilisateurs'
    };

    const requiredPermission = menuPermissionMap[activeMenu];
    
    // Si une permission est requise et l'utilisateur ne l'a pas, retourner au dashboard
    if (requiredPermission && !canView(requiredPermission)) {
      return <Dashboard activeMenu="dashboard" menuTitle={getMenuTitle('dashboard')} />;
    }

    // New Invoice Modal
    if (activeMenu === 'factures-new') {
      return null;
    }

    // Dashboard pages
    if (activeMenu === 'dashboard' || activeMenu === 'dashboard-factures' || activeMenu === 'dashboard-liquidation') {
      return <Dashboard activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }

    // Search page
    if (activeMenu === 'search') {
      return <SearchPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }

    // Invoices
    if (activeMenu === 'factures-all') {
      return <InvoicesPage filterType="all" activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} onMenuChange={handleMenuChange} />;
    }
    if (activeMenu === 'factures-pending' || activeMenu === 'factures-pending-dop' || activeMenu === 'factures-pending-dq') {
      return <ValidationPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }
    if (activeMenu === 'factures-validated' || activeMenu === 'factures-rejected' || activeMenu === 'factures-overdue') {
      return <ValidationPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }
    if (activeMenu === 'factures-paid' || activeMenu === 'factures-partially-paid') {
      return <PaiementsPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} onMenuChange={handleMenuChange} />;
    }

    // Payment Orders
    if (activeMenu === 'factures-payment-order') {
      return <PaymentOrdersPage />;
    }

    // Default to all invoices for factures menu
    if (activeMenu.startsWith('factures')) {
      return <InvoicesPage filterType="all" activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} onMenuChange={handleMenuChange} />;
    }

    // Parameters
    if (activeMenu === 'parameters-suppliers') {
      return <ParametersPage subMenu="suppliers" activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }
    if (activeMenu === 'parameters-charges') {
      return <ParametersPage subMenu="charges" activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }
    if (activeMenu === 'parameters-agents') {
      return <UsersPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }
    if (activeMenu === 'parameters-centres') {
      return <ParametersPage subMenu="centres" activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }
    if (activeMenu === 'parameters-caisses') {
      return <ParametersPage subMenu="caisses" activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }
    if (activeMenu === 'parameters-comptes') {
      return <ParametersPage subMenu="comptes" activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }
    if (activeMenu === 'parameters') {
      return <ParametersPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }

    // Users
    if (activeMenu === 'users') {
      return <UsersPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
    }

    // Default
    return <Dashboard activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
  };

  const handleMenuChange = (menu: string) => {
    if (menu === 'factures-new') {
      // Vérifier la permission avant d'ouvrir le formulaire
      if (canCreate('factures')) {
        setShowInvoiceForm(true);
      }
    } else {
      setShowInvoiceForm(false);
    }
    setActiveMenu(menu);
  };

  const handleInvoiceSubmit = (formData: any) => {
    console.log('Invoice submitted:', formData);
    setShowInvoiceForm(false);
    setActiveMenu('dashboard');
  };

  const handleInvoiceCancel = () => {
    setShowInvoiceForm(false);
    setActiveMenu('dashboard');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Indicateur global de synchronisation temps réel */}
      <div className="fixed top-3 right-4 z-50 pointer-events-none">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 shadow-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-semibold text-emerald-700 tracking-wide">
            SYNC TEMPS REEL ACTIVE
          </span>
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar activeMenu={activeMenu} onMenuChange={handleMenuChange} />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {renderPage()}
      </div>

      {/* Invoice Form Modal */}
      {showInvoiceForm && (
        <InvoiceForm
          onSubmit={handleInvoiceSubmit}
          onCancel={handleInvoiceCancel}
        />
      )}
      
      {/* Toast Container */}
      <ToastContainer />
    </div>
  );
}

function App() {
  const { agent, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  // Si pas d'agent, afficher LoginPage
  if (!agent) {
    return <LoginPage />;
  }

  // Si agent authentifié, afficher AppContent
  return <AppContent />;
}

export default function AppWithAuth() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

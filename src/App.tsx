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
import ProfileSignaturePage from './pages/ProfileSignaturePage';
import LogsPage from './pages/LogsPage';

// Menu labels mapping
const menuLabels: { [key: string]: string } = {
  dashboard: 'Dashboard',
  'dashboard-factures': 'Factures',
  'dashboard-liquidation': 'Bulletin de liquidation',
  'dashboard-ffg': 'Dashboard frais généraux',
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
  'factures-ffg-new': 'Nouvelle facture FFG',
  'factures-ffg-pending': 'En attente validation DR - FFG',
  'factures-ffg-pending-dop': 'En attente validation DOP - FFG',
  'factures-ffg-validated': 'Validée (bon à payer) - FFG',
  'factures-ffg-payment-order': 'Ordres de Paiement - FFG',
  'factures-ffg-paid': 'Payé - FFG',
  'factures-ffg-partially-paid': 'Partiellement payé - FFG',
  'factures-ffg-rejected': 'Rejeté - FFG',
  'factures-ffg-overdue': 'Facture Echues - FFG',
  parameters: 'Paramètres',
  'parameters-suppliers': 'Fournisseurs',
  'parameters-charges': 'Types de charges',
  'parameters-agents': 'Agents',
  'parameters-centres': 'Centres de coût',
  'parameters-caisses': 'Caisses',
  'parameters-comptes': 'Comptes',
  users: 'Utilisateurs',
  'profile-signature': 'Ma signature',
  'users-logs': 'LOGs',
};

function AppContent() {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceFormScope, setInvoiceFormScope] = useState<'operationnel' | 'frais-generaux'>('operationnel');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { canView, canCreate, canEdit, canDelete, canManageOwnSignature } = usePermission();
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
      'dashboard-ffg': 'dashboard_ffg',
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
      'factures-ffg-new': 'factures_ffg',
      'factures-ffg-pending': 'factures_ffg_pending_dr',
      'factures-ffg-pending-dop': 'factures_ffg_pending_dop',
      'factures-ffg-validated': 'factures_ffg_validated',
      'factures-ffg-paid': 'factures_ffg_paid',
      'factures-ffg-partially-paid': 'factures_ffg_partially_paid',
      'factures-ffg-rejected': 'factures_ffg_rejected',
      'factures-ffg-overdue': 'factures_ffg_overdue',
      'factures-ffg-payment-order': 'factures_ffg_payment_order',
      'parameters': 'paramettre',
      'parameters-suppliers': 'fournisseurs',
      'parameters-charges': 'charges',
      'parameters-agents': 'utilisateurs',
      'parameters-centres': 'centres',
      'parameters-caisses': 'caisses',
      'parameters-comptes': 'comptes',
      'users': 'utilisateurs',
      'users-logs': 'logs',
      'profile-signature': null
    };

    const requiredPermission = menuPermissionMap[activeMenu];
    
    // Si une permission est requise et l'utilisateur ne l'a pas, retourner au dashboard
    if (activeMenu === 'profile-signature' && !canManageOwnSignature()) {
      return <Dashboard activeMenu="dashboard" menuTitle={getMenuTitle('dashboard')} invoiceTypeScope="operationnel" />;
    }
    if (requiredPermission && !canView(requiredPermission)) {
      return <Dashboard activeMenu="dashboard" menuTitle={getMenuTitle('dashboard')} invoiceTypeScope="operationnel" />;
    }

    // New Invoice Modal
    if (activeMenu === 'factures-new' || activeMenu === 'factures-ffg-new') {
      return null;
    }

    // Dashboard pages
    if (activeMenu === 'dashboard' || activeMenu === 'dashboard-factures' || activeMenu === 'dashboard-liquidation') {
      return <Dashboard activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} invoiceTypeScope="operationnel" />;
    }
    if (activeMenu === 'dashboard-ffg') {
      return <Dashboard activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} invoiceTypeScope="frais-generaux" />;
    }

    // Search page
    if (activeMenu === 'search') {
      return <SearchPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} invoiceTypeScope="operationnel" />;
    }

    // Invoices
    if (activeMenu === 'factures-all') {
      return <InvoicesPage filterType="all" activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} onMenuChange={handleMenuChange} />;
    }
    if (activeMenu === 'factures-pending' || activeMenu === 'factures-pending-dop' || activeMenu === 'factures-pending-dq') {
      return <ValidationPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} invoiceTypeScope="operationnel" />;
    }
    if (activeMenu === 'factures-validated' || activeMenu === 'factures-rejected' || activeMenu === 'factures-overdue') {
      return <ValidationPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} invoiceTypeScope="operationnel" />;
    }
    if (activeMenu === 'factures-paid' || activeMenu === 'factures-partially-paid') {
      return <PaiementsPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} onMenuChange={handleMenuChange} invoiceTypeScope="operationnel" />;
    }
    if (activeMenu === 'factures-ffg-pending' || activeMenu === 'factures-ffg-pending-dop') {
      return <ValidationPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} invoiceTypeScope="frais-generaux" />;
    }
    if (activeMenu === 'factures-ffg-validated' || activeMenu === 'factures-ffg-rejected' || activeMenu === 'factures-ffg-overdue') {
      return <ValidationPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} invoiceTypeScope="frais-generaux" />;
    }
    if (activeMenu === 'factures-ffg-paid' || activeMenu === 'factures-ffg-partially-paid') {
      return <PaiementsPage activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} onMenuChange={handleMenuChange} invoiceTypeScope="frais-generaux" />;
    }

    // Payment Orders
    if (activeMenu === 'factures-payment-order') {
      return <PaymentOrdersPage />;
    }
    if (activeMenu === 'factures-ffg-payment-order') {
      return <PaymentOrdersPage />;
    }

    // Default to all invoices for factures menu
    if (activeMenu.startsWith('factures-ffg')) {
      return <InvoicesPage filterType="all" activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} onMenuChange={handleMenuChange} />;
    }

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
    if (activeMenu === 'users-logs') {
      return <LogsPage menuTitle={getMenuTitle(activeMenu)} />;
    }
    if (activeMenu === 'profile-signature') {
      return <ProfileSignaturePage menuTitle={getMenuTitle(activeMenu)} />;
    }

    // Default
    return <Dashboard activeMenu={activeMenu} menuTitle={getMenuTitle(activeMenu)} />;
  };

  const handleMenuChange = (menu: string) => {
    if (menu === 'factures-new' || menu === 'factures-ffg-new') {
      // Vérifier la permission avant d'ouvrir le formulaire
      if (canCreate('factures')) {
        setShowInvoiceForm(true);
        setInvoiceFormScope(menu === 'factures-ffg-new' ? 'frais-generaux' : 'operationnel');
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
      {/* Indicateur sync temps réel - coin inférieur gauche */}
      <div className="fixed bottom-3 left-3 z-50 pointer-events-none">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
      </div>

      {/* Sidebar */}
      <Sidebar
        activeMenu={activeMenu}
        onMenuChange={handleMenuChange}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto min-w-0">
        {renderPage()}
      </div>

      {/* Invoice Form Modal */}
      {showInvoiceForm && (
        <InvoiceForm
          onSubmit={handleInvoiceSubmit}
          onCancel={handleInvoiceCancel}
          invoiceTypeScope={invoiceFormScope}
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

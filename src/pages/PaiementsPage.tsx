import { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, Calendar, FileText } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';
import AccessDenied from '../components/AccessDenied';
import PaymentsTable from '../components/PaymentsTable';
import { Invoice, InvoiceStatus } from '../types';
import { useDataRefresh, REFRESH_EVENTS } from '../hooks/useDataRefresh';

const REGIONS = ['OUEST', 'EST', 'SUD', 'NORD'];

interface PaiementsPageProps {
  activeMenu: string;
  menuTitle: string;
  onMenuChange: (menu: string) => void;
}

interface PaiementInfo {
  id: string;
  montantFacture: number;
  montantPaye: number;
  datePaiement: string;
  typePaiement: string;
}

interface Facture {
  ID: string;
  "Date de réception": string;
  "Numéro de facture": string;
  Fournisseur: string;
  "Montant": number;
  Devise: string;
  "Centre de coût": string;
  Gestionnaire: string;
  Région: string;
  "Facture attachée"?: string;
  [key: string]: any;
}

function PaiementsPage({ activeMenu, menuTitle, onMenuChange }: PaiementsPageProps) {
  const { canView } = usePermission();
  const { error } = useToast();
  const [invoices, setInvoices] = useState<(Invoice & { 
    totalPaid: number;
    lastPaymentDate: string;
    payments: any[];
  })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [allYears, setAllYears] = useState<string[]>([]);
  const [stats, setStats] = useState({
    count: 0,
    total: 0,
    urgent: 0,
    overdue: 0
  });

  // Déterminer le mode selon activeMenu
  const isPaid = activeMenu === 'factures-paid';
  const pageTitle = isPaid ? 'Factures Payées' : 'Factures Partiellement Payées';
  const pageDescription = isPaid 
    ? 'Factures complètement payées' 
    : 'Factures avec paiements partiels';

  useEffect(() => {
    loadPayments();
  }, [selectedRegion, selectedYear, activeMenu]);

  useDataRefresh(REFRESH_EVENTS.ALL, () => {
    loadPayments();
  });

  const loadPayments = async () => {
    setLoading(true);
    try {
      console.log('Chargement des paiements...');
      
      // Charger tous les paiements
      const { data: paiements, error: paiementsError } = await supabase
        .from('PAIEMENTS')
        .select('*');

      if (paiementsError) {
        console.error('❌ Erreur chargement paiements:', paiementsError);
        if (paiementsError.message?.includes('CORS')) {
          error('Erreur CORS: Les politiques RLS ne sont pas configurées');
        } else if (paiementsError.message?.includes('not found')) {
          error('Table PAIEMENTS non trouvée dans Supabase');
        } else if (paiementsError.message?.includes('permission')) {
          error('Permission refusée. Vérifiez les politiques RLS dans Supabase');
        } else {
          error(`Erreur Supabase: ${paiementsError.message}`);
        }
        setLoading(false);
        return;
      }

      console.log('✓ Paiements chargés:', paiements?.length || 0);

      // Grouper les paiements par numéro de facture
      const paiementsMap = new Map<string, PaiementInfo[]>();
      paiements?.forEach((p: any) => {
        const invoiceNumber = p.NumeroFacture;
        if (!paiementsMap.has(invoiceNumber)) {
          paiementsMap.set(invoiceNumber, []);
        }
        paiementsMap.get(invoiceNumber)!.push(p);
      });

      // Charger les factures
      const { data: factures, error: facturesError } = await supabase
        .from('FACTURES')
        .select('*');

      if (facturesError) {
        console.error('Erreur chargement factures:', facturesError);
        error('Erreur lors du chargement des factures');
        setLoading(false);
        return;
      }

      console.log('✓ Factures chargées:', factures?.length || 0);

      // Extraire les années uniques pour le select
      if (allYears.length === 0 && factures) {
        const years = new Set<string>();
        factures.forEach((f: Facture) => {
          if (f["Date de réception"]) {
            const year = new Date(f["Date de réception"]).getFullYear().toString();
            years.add(year);
          }
        });
        const sortedYears = Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
        console.log('Années détectées:', sortedYears);
        setAllYears(sortedYears);
      }

      // Filtrer les factures qui ont au moins un paiement
      const facturesAvecPaiements = (factures || [])
        .filter((f: Facture) => paiementsMap.has(f["Numéro de facture"]))
        .map((f: Facture) => {
          const paiements = paiementsMap.get(f["Numéro de facture"]) || [];
          const totalPaid = paiements.reduce((sum: number, p: any) => sum + (p.montantPaye || 0), 0);
          const lastPaymentDate = paiements.length > 0 
            ? paiements[0].datePaiement 
            : f["Date de réception"];

          return {
            id: f.ID,
            invoiceNumber: f["Numéro de facture"],
            supplier: f.Fournisseur,
            receptionDate: f["Date de réception"],
            amount: f.Montant,
            currency: f.Devise,
            region: f.Région,
            costCenter: f["Centre de coût"],
            manager: f.Gestionnaire,
            attachedInvoiceUrl: f["Facture attachée"],
            chargeCategory: f["Catégorie de charge"],
            fileNumber: f["Numéro de dossier"],
            dueDate: f["Échéance"],
            paymentMode: f["Mode de paiement requis"],
            urgencyLevel: f["Niveau urgence"],
            totalPaid,
            lastPaymentDate,
            payments: paiements
          };
        });

      console.log('Factures avec paiements:', facturesAvecPaiements.length);

      // Filtrer selon le type (payé vs partiellement payé)
      let filtered = facturesAvecPaiements;
      if (isPaid) {
        filtered = facturesAvecPaiements.filter((f: any) => f.totalPaid >= f.amount - 0.01);
      } else {
        filtered = facturesAvecPaiements.filter((f: any) => f.totalPaid < f.amount - 0.01);
      }

      console.log(`Après filtre ${isPaid ? 'payé' : 'partiellement'}:`, filtered.length);

      // Filtrer par région si sélectionnée
      if (selectedRegion) {
        filtered = filtered.filter((f: any) => f.region === selectedRegion);
        console.log(`Après filtre région ${selectedRegion}:`, filtered.length);
      }

      // Filtrer par année
      filtered = filtered.filter((f: any) => {
        const receptionYear = new Date(f.receptionDate).getFullYear().toString();
        return receptionYear === selectedYear;
      });

      console.log(`Après filtre année ${selectedYear}:`, filtered.length);

      const invoices = filtered.map((f: any) => ({
        id: f.id,
        invoiceNumber: f.invoiceNumber,
        supplier: f.supplier,
        receptionDate: f.receptionDate,
        amount: f.amount,
        currency: f.currency,
        chargeCategory: f.chargeCategory,
        fileNumber: f.fileNumber,
        dueDate: f.dueDate,
        paymentMode: f.paymentMode,
        urgencyLevel: f.urgencyLevel,
        status: (f.totalPaid >= f.amount ? 'paid' : 'bon-a-payer') as InvoiceStatus,
        region: f.region,
        costCenter: f.costCenter,
        manager: f.manager,
        attachedInvoiceUrl: f.attachedInvoiceUrl,
        totalPaid: f.totalPaid,
        lastPaymentDate: f.lastPaymentDate,
        payments: f.payments
      }));

      console.log('Factures finales affichées:', invoices.length);
      setInvoices(invoices);
      
      // Calculer les statistiques
      const now = new Date();
      const stats = {
        count: invoices.length,
        total: invoices.reduce((sum, inv) => sum + inv.amount, 0),
        urgent: invoices.filter(inv => inv.urgencyLevel === 'HIGH').length,
        overdue: invoices.filter(inv => {
          if (!inv.dueDate) return false;
          const dueDate = new Date(inv.dueDate);
          return dueDate < now;
        }).length
      };
      setStats(stats);
    } catch (err) {
      console.error('Erreur:', err);
      error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  if (!canView('factures')) {
    return <AccessDenied message="Vous n'avez pas accès aux paiements." />;
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="bg-gray-100 pr-4 pl-4 pt-4 pb-0 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
        <p className="text-sm text-gray-600 mt-1">{pageDescription}</p>
        
        {/* Onglets Région et contrôles */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex">
            <button
              onClick={() => setSelectedRegion(null)}
              className={`pr-4 pl-4 pt-2 pb-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                selectedRegion === null
                  ? 'font-bold text-blue-600 bg-white'
                  : 'text-gray-600'
              }`}
            >
              Toutes les régions
            </button>
            {REGIONS.map((region) => (
              <button
                key={region}
                onClick={() => setSelectedRegion(region)}
                className={`pr-4 pl-4 pt-2 pb-2 text-sm rounded-t-lg transition-all duration-150 ease-out ${
                  selectedRegion === region
                    ? 'font-bold text-blue-600 bg-white'
                    : 'text-gray-600'
                }`}
              >
                {region}
              </button>
            ))}
          </div>
          
          {/* Contrôles à droite */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Année</label>
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {allYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            
            <button
              onClick={() => loadPayments()}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-gradient-to-r from-green-500 to-green-600 text-white rounded hover:from-green-600 hover:to-green-700 transition-all duration-200"
            >
              <RefreshCw size={14} />
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="flex items-center justify-center flex-1  bg-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement...</p>
          </div>
        </div>
      ) : (
        <>
        {/* Cartes de statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-0 p-4" >
        <div className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-blue-50 hover:to-white cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="w-1 h-12 bg-blue-500 rounded-full"></div>
                <div>
                  <p className="text-sm text-gray-600">Total factures</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.count.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="text-gray-400">
              <FileText size={20} />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-green-50 hover:to-white cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="w-1 h-12 bg-green-500 rounded-full"></div>
                <div>
                  <p className="text-sm text-gray-600">Montant total</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()} USD</p>
                </div>
              </div>
            </div>
            <div className="text-gray-400">
              <span className="text-2xl font-bold">$</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-red-50 hover:to-white cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="w-1 h-12 bg-red-500 rounded-full"></div>
                <div>
                  <p className="text-sm text-gray-600">Urgentes</p>
                  <p className="text-2xl font-bold text-red-600">{stats.urgent.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="text-gray-400">
              <AlertCircle size={20} />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-orange-50 hover:to-white cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="w-1 h-12 bg-orange-500 rounded-full"></div>
                <div>
                  <p className="text-sm text-gray-600">Échues</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.overdue.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="text-gray-400">
              <Calendar size={20} />
            </div>
          </div>
        </div>
      </div>

        {invoices.length === 0 ? (
          <div className="flex items-center justify-center flex-1">
            <div className="text-center">
              <p className="text-gray-500">Aucune facture trouvée</p>
            </div>
          </div>
        ) : (
          <PaymentsTable invoices={invoices} onRefresh={loadPayments} />
        )}
        </>
      )}
    </div>
  );
}

export default PaiementsPage;

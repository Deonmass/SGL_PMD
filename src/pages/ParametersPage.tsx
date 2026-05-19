import React, { useEffect, useState, useMemo } from 'react';
import { ChevronRight, Plus, Edit2, Trash2, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../contexts/AuthContext';
import AccessDenied from '../components/AccessDenied';
import FournisseurModal from '../components/modals/FournisseurModal';
import AgentModal from '../components/modals/AgentModal';
import ChargeModal from '../components/modals/ChargeModal';
import CentreDeCoutModal from '../components/modals/CentreDeCoutModal';
import CompteModal from '../components/modals/CompteModal';
import CaisseModal from '../components/modals/CaisseModal';
import {
  Fournisseur,
  fournisseurService,
  Agent,
  agentService,
  Charge,
  chargeService,
  CentreDeCout,
  centreDeCoutService,
  Compte,
  compteService,
  Caisse,
  caisseService,
} from '../services/tableService';

interface ParametersPageProps {
  subMenu?: 'suppliers' | 'charges' | 'agents' | 'centres' | 'comptes' | 'caisses';
  activeMenu?: string;
  menuTitle?: string;
}

function ParametersPage({ subMenu, menuTitle = 'Paramètres' }: ParametersPageProps) {
  const { canView, canCreate, canEdit, canDelete } = usePermission();
  const { agent } = useAuth();
  const [suppliers, setSuppliers] = useState<Fournisseur[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [centres, setCentres] = useState<CentreDeCout[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [caisses, setCaisses] = useState<Caisse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showFournisseurModal, setShowFournisseurModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [showCentreModal, setShowCentreModal] = useState(false);
  const [showCompteModal, setShowCompteModal] = useState(false);
  const [showCaisseModal, setShowCaisseModal] = useState(false);

  const [editingItem, setEditingItem] = useState<any>(null);
  const [compteInitialData, setCompteInitialData] = useState<{
    Fournisseur?: string;
    Banque?: string;
    devise?: string;
    SGL?: boolean;
  } | null>(null);

  // Load data
  useEffect(() => {
    setSearchTerm('');
    if (subMenu === 'suppliers') loadSuppliers();
    else if (subMenu === 'charges') loadCharges();
    else if (subMenu === 'agents') loadAgents();
    else if (subMenu === 'centres') loadCentres();
    else if (subMenu === 'comptes') loadComptes();
    else if (subMenu === 'caisses') loadCaisses();
  }, [subMenu, agent]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const [suppliersData, comptesData] = await Promise.all([
        fournisseurService.getAll(),
        compteService.getAll(),
      ]);
      setSuppliers(suppliersData || []);
      setComptes(comptesData || []);
    } catch (err) {
      setError('Erreur lors du chargement des fournisseurs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAgents = async () => {
    setLoading(true);
    try {
      const data = await agentService.getAll();
      setAgents(data || []);
    } catch (err) {
      setError('Erreur lors du chargement des agents');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCharges = async () => {
    setLoading(true);
    try {
      const data = await chargeService.getAll();
      setCharges(data || []);
    } catch (err) {
      setError('Erreur lors du chargement des charges');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCentres = async () => {
    setLoading(true);
    try {
      const data = await centreDeCoutService.getAll();
      // Filtrer les centres de coût par région de l'utilisateur connecté
      const filteredCentres = agent?.REGION 
        ? (data || []).filter(centre => centre.REGION === agent.REGION)
        : (data || []);
      setCentres(filteredCentres);
    } catch (err) {
      setError('Erreur lors du chargement des centres de coût');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFournisseur = async (id: number) => {
    // Vérification de permission avant suppression
    if (!canDelete('fournisseurs')) {
      setError('Vous n\'avez pas la permission de supprimer des fournisseurs.');
      return;
    }
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce fournisseur ?')) return;
    try {
      await fournisseurService.delete(id);
      loadSuppliers();
    } catch (err) {
      setError('Erreur lors de la suppression');
    }
  };

  const handleRefresh = () => {
    if (subMenu === 'suppliers') loadSuppliers();
    else if (subMenu === 'charges') loadCharges();
    else if (subMenu === 'agents') loadAgents();
    else if (subMenu === 'centres') loadCentres();
    else if (subMenu === 'comptes') loadComptes();
    else if (subMenu === 'caisses') loadCaisses();
  };

  const handleDeleteAgent = async (id: number) => {
    // Vérification de permission avant suppression
    if (!canDelete('utilisateurs')) {
      setError('Vous n\'avez pas la permission de supprimer des agents.');
      return;
    }
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet agent ?')) return;
    try {
      await agentService.delete(id);
      loadAgents();
    } catch (err) {
      setError('Erreur lors de la suppression');
    }
  };

  const handleDeleteCharge = async (id: number) => {
    // Vérification de permission avant suppression
    if (!canDelete('charges')) {
      setError('Vous n\'avez pas la permission de supprimer des charges.');
      return;
    }
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette charge ?')) return;
    try {
      await chargeService.delete(id);
      loadCharges();
    } catch (err) {
      setError('Erreur lors de la suppression');
    }
  };

  const handleDeleteCentre = async (id: number) => {
    // Vérification de permission avant suppression
    if (!canDelete('centres')) {
      setError('Vous n\'avez pas la permission de supprimer des centres de coût.');
      return;
    }
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce centre ?')) return;
    try {
      await centreDeCoutService.delete(id);
      loadCentres();
    } catch (err) {
      setError('Erreur lors de la suppression');
    }
  };

  const loadComptes = async () => {
    setLoading(true);
    setError('');
    try {
      console.log('Tentative de chargement des comptes...');
      const data = await compteService.getAll();
      console.log('Données reçues:', data);
      setComptes(data || []);
      if (!data || data.length === 0) {
        console.log('Aucun compte trouvé, tableau vide');
      }
    } catch (err: any) {
      console.error('Erreur détaillée lors du chargement des comptes:', err);
      setError(`Erreur lors du chargement des comptes: ${err.message || 'Erreur inconnue'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCompte = async (id: number) => {
    // Vérification de permission avant suppression
    if (!canDelete('comptes')) {
      setError('Vous n\'avez pas la permission de supprimer des comptes.');
      return;
    }
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce compte ?')) return;
    try {
      await compteService.delete(id);
      loadComptes();
    } catch (err) {
      setError('Erreur lors de la suppression');
    }
  };

  const loadCaisses = async () => {
    setLoading(true);
    try {
      const data = await caisseService.getAll();
      setCaisses(data || []);
    } catch (err) {
      setError('Erreur lors du chargement des caisses');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCaisse = async (id: number) => {
    // Vérification de permission avant suppression
    if (!canDelete('caisses')) {
      setError('Vous n\'avez pas la permission de supprimer des caisses.');
      return;
    }
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette caisse ?')) return;
    try {
      await caisseService.delete(id);
      loadCaisses();
    } catch (err) {
      setError('Erreur lors de la suppression');
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedSuppliers = useMemo(() => {
    let sortableSuppliers = [...suppliers];
    if (sortConfig !== null) {
      sortableSuppliers.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Fournisseur];
        const bValue = b[sortConfig.key as keyof Fournisseur];
        
        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableSuppliers;
  }, [suppliers, sortConfig]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredSuppliers = useMemo(() => {
    if (!normalizedSearch) return sortedSuppliers;
    return sortedSuppliers.filter((supplier) => {
      return (
        String(supplier.Fournisseur || '').toLowerCase().includes(normalizedSearch) ||
        String(supplier['Catégorie fournisseur'] || '').toLowerCase().includes(normalizedSearch)
      );
    });
  }, [sortedSuppliers, normalizedSearch]);

  const filteredCharges = useMemo(() => {
    if (!normalizedSearch) return charges;
    return charges.filter((charge) => (
      String(charge.designation_Charges || '').toLowerCase().includes(normalizedSearch) ||
      String(charge.type || '').toLowerCase().includes(normalizedSearch) ||
      String(charge.Bloquant || '').toLowerCase().includes(normalizedSearch)
    ));
  }, [charges, normalizedSearch]);

  const filteredAgentsList = useMemo(() => {
    if (!normalizedSearch) return agents;
    return agents.filter((currentAgent) => (
      String(currentAgent.Nom || '').toLowerCase().includes(normalizedSearch) ||
      String(currentAgent.email || '').toLowerCase().includes(normalizedSearch) ||
      String(currentAgent.Role || '').toLowerCase().includes(normalizedSearch) ||
      String(currentAgent.REGION || '').toLowerCase().includes(normalizedSearch)
    ));
  }, [agents, normalizedSearch]);

  const filteredCentres = useMemo(() => {
    if (!normalizedSearch) return centres;
    return centres.filter((centre) => (
      String(centre.Designation || '').toLowerCase().includes(normalizedSearch) ||
      String(centre.REGION || '').toLowerCase().includes(normalizedSearch)
    ));
  }, [centres, normalizedSearch]);

  const filteredComptes = useMemo(() => {
    if (!normalizedSearch) return comptes;
    return comptes.filter((compte) => (
      String(compte.Fournisseur || '').toLowerCase().includes(normalizedSearch) ||
      String(compte.Banque || '').toLowerCase().includes(normalizedSearch) ||
      String(compte.Compte || '').toLowerCase().includes(normalizedSearch) ||
      String(compte.devise || '').toLowerCase().includes(normalizedSearch) ||
      (compte.SGL ? 'oui' : 'non').includes(normalizedSearch)
    ));
  }, [comptes, normalizedSearch]);

  const filteredCaisses = useMemo(() => {
    if (!normalizedSearch) return caisses;
    return caisses.filter((caisse) => (
      String(caisse.Designation || '').toLowerCase().includes(normalizedSearch) ||
      String(caisse.Region || '').toLowerCase().includes(normalizedSearch)
    ));
  }, [caisses, normalizedSearch]);

  const toggleSupplierExpansion = (supplierId: number) => {
    const newExpanded = new Set(expandedSuppliers);
    if (newExpanded.has(supplierId)) {
      newExpanded.delete(supplierId);
    } else {
      newExpanded.add(supplierId);
    }
    setExpandedSuppliers(newExpanded);
  };

  const getComptesByFournisseur = (fournisseurName: string) => {
    return comptes.filter(compte => compte.Fournisseur === fournisseurName);
  };

  if (subMenu === 'suppliers') {
    return (
      <>
        <div className="flex flex-col h-screen">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
            <div className="p-8 pb-4">
              <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-900">{menuTitle}</h1>
                <div className="flex items-center gap-3">
                  <div className="relative w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Rechercher un fournisseur..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                    title="Actualiser"
                  >
                    <RefreshCw size={16} className="transition-transform duration-200 hover:rotate-180" />
                    <span className="text-sm font-medium">Actualiser</span>
                  </button>
                  {canCreate('fournisseurs') && (
                    <button
                      onClick={() => {
                        setEditingItem(null);
                        setShowFournisseurModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                    >
                      <Plus size={16} className="transition-transform duration-200 group-hover:rotate-90" />
                      <span className="text-sm font-medium">Nouveau</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-8 pt-4">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-500">Chargement...</span>
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th 
                        className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort('Fournisseur')}
                      >
                        <div className="flex items-center gap-1">
                          Nom
                          {sortConfig?.key === 'Fournisseur' && (
                            <span className="text-blue-600">
                              {sortConfig.direction === 'asc' ? 'asc' : 'desc'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort('Catégorie fournisseur')}
                      >
                        <div className="flex items-center gap-1">
                          Code
                          {sortConfig?.key === 'Catégorie fournisseur' && (
                            <span className="text-blue-600">
                              {sortConfig.direction === 'asc' ? 'asc' : 'desc'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredSuppliers.map((supplier) => (
                      <React.Fragment key={supplier.ID}>
                        <tr className={`hover:bg-gray-50 transition-colors duration-150 ${
                          expandedSuppliers.has(supplier.ID!) ? 'bg-gray-600' : ''
                        }`}>
                          <td className={`px-4 py-2 text-xs font-medium ${
                            expandedSuppliers.has(supplier.ID!) ? 'text-white' : 'text-gray-900'
                          }`}>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleSupplierExpansion(supplier.ID!)}
                                className={`transition-colors ${
                                  expandedSuppliers.has(supplier.ID!) 
                                    ? 'text-white hover:text-gray-200' 
                                    : 'text-gray-400 hover:text-gray-600'
                                }`}
                                title={expandedSuppliers.has(supplier.ID!) ? "Réduire" : "Déplier"}
                              >
                                <ChevronRight 
                                  size={14} 
                                  className={`transition-transform duration-200 ${
                                    expandedSuppliers.has(supplier.ID!) ? 'rotate-90' : ''
                                  }`}
                                />
                              </button>
                              {supplier.Fournisseur}
                            </div>
                          </td>
                          <td className={`px-4 py-2 text-xs ${
                            expandedSuppliers.has(supplier.ID!) ? 'text-gray-200' : 'text-gray-600'
                          }`}>{supplier["Catégorie fournisseur"]}</td>
                          <td className="px-4 py-2 text-xs text-right">
                            <div className="flex justify-end gap-1">
                              {canEdit('fournisseurs') && (
                                <button
                                  onClick={() => {
                                    setEditingItem(supplier);
                                    setShowFournisseurModal(true);
                                  }}
                                  className={`p-1.5 rounded transition-all duration-200 transform hover:scale-110 ${
                                    expandedSuppliers.has(supplier.ID!)
                                      ? 'text-blue-300 hover:text-blue-100 hover:bg-blue-700'
                                      : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                                  }`}
                                  title="Éditer"
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                              {canDelete('fournisseurs') && (
                                <button
                                  onClick={() => handleDeleteFournisseur(supplier.ID!)}
                                  className={`p-1.5 rounded transition-all duration-200 transform hover:scale-110 ${
                                    expandedSuppliers.has(supplier.ID!)
                                      ? 'text-red-300 hover:text-red-100 hover:bg-red-700'
                                      : 'text-red-600 hover:text-red-800 hover:bg-red-50'
                                  }`}
                                  title="Supprimer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandedSuppliers.has(supplier.ID!) && (
                          <tr>
                            <td colSpan={3} className="px-4 py-0 bg-gray-200">
                              <div className="py-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs font-semibold text-gray-700">
                                    Comptes associés ({getComptesByFournisseur(supplier.Fournisseur).length})
                                  </div>
                                  {canCreate('comptes') && (
                                    <button
                                      onClick={() => {
                                        setEditingItem(null);
                                        setCompteInitialData({ Fournisseur: supplier.Fournisseur });
                                        setShowCompteModal(true);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                    >
                                      <Plus size={12} />
                                      Nouveau compte
                                    </button>
                                  )}
                                </div>
                                {getComptesByFournisseur(supplier.Fournisseur).length > 0 ? (
                                  <div className="space-y-2">
                                    {getComptesByFournisseur(supplier.Fournisseur).map((compte) => (
                                      <div key={compte.id} className="bg-white border border-gray-300 rounded-lg p-3 text-xs">
                                        <div className="grid grid-cols-5 gap-2">
                                          <div>
                                            <span className="font-medium text-gray-700">Banque:</span>
                                            <span className="ml-1 text-gray-600">{compte.Banque}</span>
                                          </div>
                                          <div>
                                            <span className="font-medium text-gray-700">Compte:</span>
                                            <span className="ml-1 text-gray-600">{compte.Compte}</span>
                                          </div>
                                          <div>
                                            <span className="font-medium text-gray-700">Devise:</span>
                                            <span className="ml-1 text-gray-600">{compte.devise || '-'}</span>
                                          </div>
                                          <div>
                                            <span className="font-medium text-gray-700">SGL:</span>
                                            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                                              compte.SGL 
                                                ? 'bg-green-100 text-green-800' 
                                                : 'bg-gray-100 text-gray-800'
                                            }`}>
                                              {compte.SGL ? 'Oui' : 'Non'}
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-end gap-1">
                                            {canEdit('comptes') && (
                                              <button
                                                onClick={() => {
                                                  setEditingItem(compte);
                                                  setCompteInitialData(null);
                                                  setShowCompteModal(true);
                                                }}
                                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-all duration-200 transform hover:scale-110"
                                                title="Éditer"
                                              >
                                                <Edit2 size={14} />
                                              </button>
                                            )}
                                            {canDelete('comptes') && (
                                              <button
                                                onClick={() => handleDeleteCompte(compte.id!)}
                                                className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-all duration-200 transform hover:scale-110"
                                                title="Supprimer"
                                              >
                                                <Trash2 size={14} />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-500 italic">
                                    Aucun compte associé à ce fournisseur
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <FournisseurModal
          isOpen={showFournisseurModal}
          fournisseur={editingItem}
          onClose={() => {
            setShowFournisseurModal(false);
            setEditingItem(null);
          }}
          onSave={() => {
            loadSuppliers();
          }}
        />
        <CompteModal
          isOpen={showCompteModal}
          compte={editingItem}
          initialData={compteInitialData}
          onClose={() => {
            setShowCompteModal(false);
            setEditingItem(null);
            setCompteInitialData(null);
          }}
          onSave={() => {
            loadSuppliers();
          }}
        />
      </>
    );
  }

  if (subMenu === 'charges') {
    return (
      <>
        <div className="flex flex-col h-screen">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
            <div className="p-8 pb-4">
              <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-900">{menuTitle}</h1>
                <div className="flex items-center gap-3">
                  <div className="relative w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Rechercher une charge..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                    title="Actualiser"
                  >
                    <RefreshCw size={16} className="transition-transform duration-200 hover:rotate-180" />
                    <span className="text-sm font-medium">Actualiser</span>
                  </button>
                  {canCreate('charges') && (
                    <button
                      onClick={() => {
                        setEditingItem(null);
                        setShowChargeModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                    >
                      <Plus size={16} className="transition-transform duration-200 group-hover:rotate-90" />
                      <span className="text-sm font-medium">Nouveau</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-8 pt-4">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-500">Chargement...</span>
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Nom</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Bloquant ?</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredCharges.map((charge) => (
                      <tr key={charge.ID} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-4 py-2 text-xs font-medium text-gray-900">{charge.designation_Charges}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{charge.type || '-'}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{charge.Bloquant}</td>
                        <td className="px-4 py-2 text-xs text-right">
                          <div className="flex justify-end gap-1">
                            {canEdit('charges') && (
                              <button
                                onClick={() => {
                                  setEditingItem(charge);
                                  setShowChargeModal(true);
                                }}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-all duration-200 transform hover:scale-110"
                                title="Éditer"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {canDelete('charges') && (
                              <button
                                onClick={() => handleDeleteCharge(charge.ID!)}
                                className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-all duration-200 transform hover:scale-110"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <ChargeModal
          isOpen={showChargeModal}
          charge={editingItem}
          onClose={() => {
            setShowChargeModal(false);
            setEditingItem(null);
          }}
          onSave={() => {
            loadCharges();
          }}
        />
      </>
    );
  }

  if (subMenu === 'agents') {
    return (
      <>
        <div className="flex flex-col h-screen">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
            <div className="p-8 pb-4">
              <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-900">{menuTitle}</h1>
                <div className="flex items-center gap-3">
                  <div className="relative w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Rechercher un agent..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                    title="Actualiser"
                  >
                    <RefreshCw size={16} className="transition-transform duration-200 hover:rotate-180" />
                    <span className="text-sm font-medium">Actualiser</span>
                  </button>
                  {canCreate('utilisateurs') && (
                    <button
                      onClick={() => {
                        setEditingItem(null);
                        setShowAgentModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                    >
                      <Plus size={16} className="transition-transform duration-200 group-hover:rotate-90" />
                      <span className="text-sm font-medium">Nouveau</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-8 pt-4">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-500">Chargement...</span>
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Nom</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Prénoms</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Email</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredAgentsList.map((agent) => (
                      <tr key={agent.ID} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-4 py-2 text-xs font-medium text-gray-900">{agent.Nom}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">-</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{agent.email}</td>
                        <td className="px-4 py-2 text-xs text-right">
                          <div className="flex justify-end gap-1">
                            {canEdit('utilisateurs') && (
                              <button
                                onClick={() => {
                                  setEditingItem(agent);
                                  setShowAgentModal(true);
                                }}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-all duration-200 transform hover:scale-110"
                                title="Éditer"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {canDelete('utilisateurs') && (
                              <button
                                onClick={() => handleDeleteAgent(agent.ID!)}
                                className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-all duration-200 transform hover:scale-110"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <AgentModal
          isOpen={showAgentModal}
          agent={editingItem}
          onClose={() => {
            setShowAgentModal(false);
            setEditingItem(null);
          }}
          onSave={() => {
            loadAgents();
          }}
        />
      </>
    );
  }

  if (subMenu === 'centres') {
    return (
      <>
        <div className="flex flex-col h-screen">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
            <div className="p-8 pb-4">
              <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-900">{menuTitle}</h1>
                <div className="flex items-center gap-3">
                  <div className="relative w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Rechercher un centre de coût..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                    title="Actualiser"
                  >
                    <RefreshCw size={16} className="transition-transform duration-200 hover:rotate-180" />
                    <span className="text-sm font-medium">Actualiser</span>
                  </button>
                  {canCreate('centres') && (
                    <button
                      onClick={() => {
                        setEditingItem(null);
                        setShowCentreModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                    >
                      <Plus size={16} className="transition-transform duration-200 group-hover:rotate-90" />
                      <span className="text-sm font-medium">Nouveau</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-8 pt-4">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-500">Chargement...</span>
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Nom</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Région</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredCentres.map((centre) => (
                      <tr key={centre.ID} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-4 py-2 text-xs font-medium text-gray-900">{centre.Designation}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{centre.REGION}</td>
                        <td className="px-4 py-2 text-xs text-right">
                          <div className="flex justify-end gap-1">
                            {canEdit('centres') && (
                              <button
                                onClick={() => {
                                  setEditingItem(centre);
                                  setShowCentreModal(true);
                                }}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-all duration-200 transform hover:scale-110"
                                title="Éditer"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {canDelete('centres') && (
                              <button
                                onClick={() => handleDeleteCentre(centre.ID!)}
                                className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-all duration-200 transform hover:scale-110"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <CentreDeCoutModal
          isOpen={showCentreModal}
          centre={editingItem}
          onClose={() => {
            setShowCentreModal(false);
            setEditingItem(null);
          }}
          onSave={() => {
            loadCentres();
          }}
        />
      </>
    );
  }

  if (subMenu === 'comptes') {
    return (
      <>
        <div className="flex flex-col h-screen">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
            <div className="p-8 pb-4">
              <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-900">{menuTitle}</h1>
                <div className="flex items-center gap-3">
                  <div className="relative w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Rechercher un compte..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                    title="Actualiser"
                  >
                    <RefreshCw size={16} className="transition-transform duration-200 hover:rotate-180" />
                    <span className="text-sm font-medium">Actualiser</span>
                  </button>
                  {canCreate('comptes') && (
                    <button
                      onClick={() => {
                        setEditingItem(null);
                        setCompteInitialData(null);
                        setShowCompteModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                    >
                      <Plus size={16} className="transition-transform duration-200 group-hover:rotate-90" />
                      <span className="text-sm font-medium">Nouveau</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-8 pt-4">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-500">Chargement...</span>
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Fournisseur</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Banque</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Compte</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Devise</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">SGL</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredComptes.map((compte) => (
                      <tr key={compte.id} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-4 py-2 text-xs font-medium text-gray-900">{compte.Fournisseur}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{compte.Banque}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{compte.Compte}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            compte.devise 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {compte.devise || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            compte.SGL 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {compte.SGL ? 'Oui' : 'Non'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-right">
                          <div className="flex justify-end gap-1">
                            {canEdit('comptes') && (
                              <button
                                onClick={() => {
                                  setEditingItem(compte);
                                  setShowCompteModal(true);
                                }}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-all duration-200 transform hover:scale-110"
                                title="Éditer"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {canDelete('comptes') && (
                              <button
                                onClick={() => handleDeleteCompte(compte.id!)}
                                className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-all duration-200 transform hover:scale-110"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <CompteModal
          isOpen={showCompteModal}
          compte={editingItem}
          initialData={compteInitialData}
          onClose={() => {
            setShowCompteModal(false);
            setEditingItem(null);
            setCompteInitialData(null);
          }}
          onSave={() => {
            loadComptes();
          }}
        />
      </>
    );
  }

  if (subMenu === 'caisses') {
    return (
      <>
        <div className="flex flex-col h-screen">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
            <div className="p-8 pb-4">
              <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-900">{menuTitle}</h1>
                <div className="flex items-center gap-3">
                  <div className="relative w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Rechercher une caisse..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                    title="Actualiser"
                  >
                    <RefreshCw size={16} className="transition-transform duration-200 hover:rotate-180" />
                    <span className="text-sm font-medium">Actualiser</span>
                  </button>
                  {canCreate('caisses') && (
                    <button
                      onClick={() => {
                        setEditingItem(null);
                        setShowCaisseModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                    >
                      <Plus size={16} className="transition-transform duration-200 group-hover:rotate-90" />
                      <span className="text-sm font-medium">Nouveau</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-8 pt-4">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-500">Chargement...</span>
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Désignation</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Région</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredCaisses.map((caisse) => (
                      <tr key={caisse.ID} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-4 py-2 text-xs font-medium text-gray-900">{caisse.Designation}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{caisse.Region}</td>
                        <td className="px-4 py-2 text-xs text-right">
                          <div className="flex justify-end gap-1">
                            {canEdit('caisses') && (
                              <button
                                onClick={() => {
                                  setEditingItem(caisse);
                                  setShowCaisseModal(true);
                                }}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-all duration-200 transform hover:scale-110"
                                title="Éditer"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {canDelete('caisses') && (
                              <button
                                onClick={() => handleDeleteCaisse(caisse.ID!)}
                                className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-all duration-200 transform hover:scale-110"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <CaisseModal
          isOpen={showCaisseModal}
          caisse={editingItem}
          onClose={() => {
            setShowCaisseModal(false);
            setEditingItem(null);
          }}
          onSave={() => {
            loadCaisses();
          }}
        />
      </>
    );
  }

  if (!canView('paramettre')) {
    return <AccessDenied message="Vous n'avez pas accès aux paramètres." />;
  }

  return (
    <div className="p-8">
      <div className="mb-6 border-b border-gray-200 py-3">
        <h1 className="text-2xl font-bold text-gray-900">{menuTitle}</h1>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Fournisseurs</h3>
              <p className="text-sm text-gray-600">Gérer les fournisseurs</p>
            </div>
            <ChevronRight size={24} className="text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Types de charges</h3>
              <p className="text-sm text-gray-600">Gérer les charges facturables</p>
            </div>
            <ChevronRight size={24} className="text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Agents</h3>
              <p className="text-sm text-gray-600">Gérer les agents</p>
            </div>
            <ChevronRight size={24} className="text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Centres de coût</h3>
              <p className="text-sm text-gray-600">Gérer les centres de coût</p>
            </div>
            <ChevronRight size={24} className="text-gray-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ParametersPage;

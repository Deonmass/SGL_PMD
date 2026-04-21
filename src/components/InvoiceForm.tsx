import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Plus, Upload, FileText, AlertCircle } from 'lucide-react';
import { supabase } from '../services/supabase';
import { cloudStorageService } from '../services/cloudStorage';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';

interface InvoiceFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (formData: Record<string, any>) => void;
  onCancel: () => void;
}

interface Supplier {
  id: string;
  Fournisseur: string;
  "Catégorie fournisseur": string;
}

interface Agent {
  id: string;
  Nom: string;
  Role: string;
  email: string;
  REGION: string;
}

interface CostCenter {
  id: string;
  Designation: string;
  REGION: string;
}

interface Charge {
  id: string;
  "designation_Charges": string;
  Bloquant: string;
}

function InvoiceForm({ onSubmit, onCancel }: InvoiceFormProps) {
  const { success, error: showError } = useToast();
  const { agent } = useAuth();
  const { canCreate } = usePermission();
  const [formData, setFormData] = useState({
    // Informations générales
    emissionDate: '',
    receptionDate: '',
    invoiceNumber: '',
    supplier: '',
    supplierCategory: '',
    
    // Affectation organisationnelle
    region: agent?.REGION || '',
    costCenter: '',
    manager: '',
    
    // Typologie de la facture
    invoiceType: '',
    chargeCategory: '',
    fileNumber: '',
    motif: '',
    
    // Données financières
    invoiceAmount: '',
    currency: 'USD',
    exchangeRate: '',
    paymentDelay: 'immediate',
    urgencyLevel: 'normal',
    
    // Conditions & paiement
    dueDate: '',
    paymentMode: '',
    attachedInvoice: null as File | null,
    attachedInvoiceUrl: '',
    isUploading: false,
    uploadError: '',
    comments: '',
    isSubmitting: false,
    status: 'En attente validation DR',
  });

  // États pour les suggestions et données
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', category: '' });
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtrer les centres de coût par région
  const filteredCostCenters = useMemo(() => {
    if (!formData.region) return [];
    return costCenters.filter(center => center.REGION === formData.region);
  }, [costCenters, formData.region]);

  // Filtrer les gestionnaires par région
  const filteredAgents = useMemo(() => {
    if (!formData.region) return agents;
    return agents.filter(agent => agent.REGION === formData.region || agent.REGION === 'TOUT');
  }, [agents, formData.region]);

  // Chargement des données depuis Supabase
  useEffect(() => {
    const loadData = async () => {
      try {
        // Charger les fournisseurs
        const { data: suppliersData, error: suppliersError } = await supabase
          .from('FOURNISSEURS')
          .select('*');
        
        if (suppliersError) {
          console.error('Erreur chargement fournisseurs:', suppliersError);
        } else {
          setSuppliers(suppliersData || []);
        }

        // Charger les agents
        const { data: agentsData, error: agentsError } = await supabase
          .from('AGENTS')
          .select('*');
        
        if (agentsError) {
          console.error('Erreur chargement agents:', agentsError);
        } else {
          setAgents(agentsData || []);
        }

        // Charger les centres de coût
        const { data: costCentersData, error: costCentersError } = await supabase
          .from('CENTRE_DE_COUT')
          .select('*');
        
        if (costCentersError) {
          console.error('Erreur chargement centres de coût:', costCentersError);
        } else {
          setCostCenters(costCentersData || []);
        }

        // Charger les charges
        const { data: chargesData, error: chargesError } = await supabase
          .from('CHARGES')
          .select('*');
        
        if (chargesError) {
          console.error('Erreur chargement charges:', chargesError);
        } else {
          setCharges(chargesData || []);
        }
      } catch (error) {
        console.error('Erreur générale de chargement:', error);
      }
    };

    loadData();
  }, []);

  // Réinitialiser le fournisseur sélectionné
  const handleSupplierInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, supplier: value }));
    setSelectedSupplier(null);
    
    // Filtrer les fournisseurs
    if (value.length > 0) {
      const filtered = suppliers.filter(supplier => 
        supplier.Fournisseur.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuppliers(filtered);
      setShowSupplierSuggestions(true);
    } else {
      setFilteredSuppliers([]);
      setShowSupplierSuggestions(false);
    }
  };

  // Sélectionner un fournisseur
  const selectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData(prev => ({
      ...prev,
      supplier: supplier.Fournisseur,
      supplierCategory: supplier["Catégorie fournisseur"]
    }));
    setShowSupplierSuggestions(false);
    setFilteredSuppliers([]);
  };

  // Gérer la saisie du fournisseur
  const handleSupplierChange = handleSupplierInputChange;

  // Ajouter un nouveau fournisseur
  const handleAddSupplier = async () => {
    if (newSupplier.name && newSupplier.category) {
      try {
        // Insérer dans la base de données
        const { data, error } = await supabase
          .from('FOURNISSEURS')
          .insert({
            Fournisseur: newSupplier.name,
            "Catégorie fournisseur": newSupplier.category
          })
          .select()
          .single();
        
        if (error) {
          console.error('Erreur ajout fournisseur:', error);
          return;
        }
        
        // Ajouter à la liste locale
        setSuppliers(prev => [...prev, data]);
        selectSupplier(data);
        setNewSupplier({ name: '', category: '' });
        setShowAddSupplierModal(false);
      } catch (error) {
        console.error('Erreur générale ajout fournisseur:', error);
      }
    }
  };

  // Gérer le drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadFileToCloudStorage(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Générer un aperçu pour les images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setFilePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
      uploadFileToCloudStorage(file);
    }
  };

  const uploadFileToCloudStorage = async (file: File) => {
    // Vérifier si le service est configuré
    if (!cloudStorageService.isConfigured()) {
      setFormData(prev => ({
        ...prev,
        uploadError: 'Cloud Storage n\'est pas configuré. Veuillez contacter l\'administrateur.'
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      isUploading: true,
      uploadError: '',
      attachedInvoice: file
    }));

    try {
      const result = await cloudStorageService.uploadFile(file);
      
      if (result.success && result.fileUrl) {
        setFormData(prev => ({
          ...prev,
          attachedInvoiceUrl: result.fileUrl || '',
          isUploading: false,
          uploadError: ''
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          isUploading: false,
          uploadError: result.error || 'Erreur lors de l\'upload du fichier'
        }));
      }
    } catch {
      setFormData(prev => ({
        ...prev,
        isUploading: false,
        uploadError: 'Erreur lors de l\'upload du fichier'
      }));
    }
  };

  const removeFile = () => {
    setFormData(prev => ({
      ...prev,
      attachedInvoice: null,
      attachedInvoiceUrl: '',
      uploadError: ''
    }));
    setFilePreview(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      
      // Recalculate dueDate if receptionDate or paymentDelay changes
      if (name === 'receptionDate' || name === 'paymentDelay') {
        const receptionDate = name === 'receptionDate' ? value : prev.receptionDate;
        const paymentDelay = name === 'paymentDelay' ? value : prev.paymentDelay;
        
        if (receptionDate) {
          const date = new Date(receptionDate);
          const delayDays = {
            'immediate': 0,
            'at-reception': 0,
            'days-7': 7,
            'days-15': 15,
            'days-30': 30,
            'days-45': 45,
          }[paymentDelay] || 0;
          
          date.setDate(date.getDate() + delayDays);
          updated.dueDate = date.toISOString().split('T')[0];
        }
      }
      
      return updated;
    });
  };

  // Calculate converted amount
  const convertedAmount = useMemo(() => {
    const invoice = parseFloat(formData.invoiceAmount) || 0;
    const rate = parseFloat(formData.exchangeRate) || 1;
    
    if (formData.currency === 'USD') return invoice;
    if (formData.currency === 'CDF') return invoice / rate;
    if (formData.currency === 'EUR') return invoice * rate;
    return invoice;
  }, [formData.invoiceAmount, formData.currency, formData.exchangeRate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Vérifier la permission de créer une facture
    if (!canCreate('factures')) {
      showError('Vous n\'avez pas la permission de créer des factures.');
      return;
    }
    
    // Valider que le fichier est fourni
    if (!formData.attachedInvoiceUrl) {
      setFormData(prev => ({
        ...prev,
        uploadError: 'Le fichier facturé est obligatoire. Veuillez télécharger une facture.'
      }));
      showError('Le fichier facturé est obligatoire. Veuillez télécharger une facture.');
      return;
    }
    
    // Désactiver le bouton pendant l'envoi
    setFormData(prev => ({ ...prev, isSubmitting: true }));
    
    try {
      // Préparer les données pour l'insertion
      const invoiceData = {
        "Date emission": formData.emissionDate,
        "Date de réception": formData.receptionDate,
        "Numéro de facture": formData.invoiceNumber,
        "Fournisseur": formData.supplier,
        "Catégorie fournisseur": formData.supplierCategory,
        "Région": formData.region,
        "Centre de coût": formData.costCenter ? costCenters.find(c => c.id === formData.costCenter)?.Designation || formData.costCenter : '',
        "Gestionnaire": formData.manager ? agents.find(a => a.id === formData.manager)?.Nom || formData.manager : '',
        "Type de facture": formData.invoiceType,
        "Catégorie de charge": formData.chargeCategory,
        "Numéro de dossier": formData.invoiceType === 'frais-generaux' ? null : formData.fileNumber,
        "Motif / Description": formData.motif,
        "Devise": formData.currency,
        "Taux facture": parseFloat(formData.exchangeRate) || null,
        "montant facture": parseFloat(formData.invoiceAmount) || 0,
        "Montant": convertedAmount,
        "Niveau urgence": formData.urgencyLevel,
        "Délais de paiement": parseInt(formData.paymentDelay.replace('days-', '').replace('immediate', '0').replace('at-reception', '0')) || 0,
        "Échéance": formData.dueDate,
        "Mode de paiement requis": formData.paymentMode,
        "Facture attachée": formData.attachedInvoiceUrl,
        "Commentaires": formData.comments,
        "Statut": formData.status,
        "validation DR": null,
        "validation DOP": null,
        "validation DG": null,
        "Rejet": null,
        "created_by": agent?.email || null
      };

      // Insérer dans la table FACTURES
      const { data, error } = await supabase
        .from('FACTURES')
        .insert(invoiceData)
        .select()
        .single();

      if (error) {
        console.error('Erreur insertion facture:', error);
        showError('Erreur lors de l\'enregistrement de la facture: ' + error.message);
        return;
      }

      console.log('Facture enregistrée avec succès:', data);
      success('Facture enregistrée avec succès !');
      
      // Appeler la fonction onSubmit avec les données complètes
      onSubmit({ ...formData, convertedAmount, id: data.ID });
      
    } catch (error) {
      console.error('Erreur générale lors de l\'enregistrement:', error);
      showError('Erreur lors de l\'enregistrement de la facture');
    } finally {
      // Réactiver le bouton
      setFormData(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const SectionTitle = ({ title }: { title: string }) => (
    <h3 className="text-lg font-semibold text-red-900 mb-4 pb-3 border-b-2 border-red-900 mt-6 first:mt-0">
      {title}
    </h3>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between bg-gray-50 border-b px-6 py-4 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-800">Enregistrer une facture</h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Informations générales */}
          <div>
            <SectionTitle title="Informations générales" />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Date d'émission
                </label>
                <input
                  type="date"
                  name="emissionDate"
                  value={formData.emissionDate}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Date de réception *
                </label>
                <input
                  type="date"
                  name="receptionDate"
                  value={formData.receptionDate}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Numéro de facture *
                </label>
                <input
                  type="text"
                  name="invoiceNumber"
                  value={formData.invoiceNumber}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Fournisseur *
                </label>
                <div className="relative">
                  <input
                    ref={supplierInputRef}
                    type="text"
                    name="supplier"
                    value={formData.supplier}
                    onChange={handleSupplierChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  {formData.supplier && filteredSuppliers.length === 0 && !selectedSupplier && (
                    <button
                      type="button"
                      onClick={() => setShowAddSupplierModal(true)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                      title="Ajouter un fournisseur"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                  
                  {/* Suggestions de fournisseurs */}
                  {showSupplierSuggestions && filteredSuppliers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredSuppliers.map((supplier) => (
                        <button
                          key={supplier.id}
                          type="button"
                          onClick={() => selectSupplier(supplier)}
                          className="w-full px-3 py-2 text-left hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium">{supplier.Fournisseur}</div>
                          <div className="text-xs text-gray-500">{supplier["Catégorie fournisseur"]}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Catégorie fournisseur
                </label>
                <input
                  type="hidden"
                  name="supplierCategory"
                  value={formData.supplierCategory}
                  readOnly
                />
                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 text-sm">
                  {formData.supplierCategory || 'Sélection automatique'}
                </div>
              </div>
            </div>
          </div>

          {/* Affectation organisationnelle */}
          <div>
            <SectionTitle title="Affectation organisationnelle" />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Région *
                </label>
                {agent?.REGION === 'TOUT' ? (
                <select
                  name="region"
                  value={formData.region}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="OUEST">OUEST</option>
                  <option value="EST">EST</option>
                  <option value="SUD">SUD</option>
                </select>
              ) : (
                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                  {agent?.REGION || '-- Sélectionner --'}
                </div>
              )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Centre de coût *
                </label>
                <select
                  name="costCenter"
                  value={formData.costCenter}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !formData.region ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  disabled={!formData.region}
                  required
                >
                  <option value="">
                    {formData.region ? '-- Sélectionner --' : 'Sélectionnez une région d\'abord'}
                  </option>
                  {filteredCostCenters.map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.Designation || center.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Gestionnaire
                </label>
                <select
                  name="manager"
                  value={formData.manager}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Sélectionner --</option>
                  {filteredAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.Nom}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Typologie de la facture */}
          <div>
            <SectionTitle title="Typologie de la facture" />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Type de facture *
                </label>
                <select
                  name="invoiceType"
                  value={formData.invoiceType}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="operationnel">Opérationnel</option>
                  <option value="frais-generaux">Frais généraux</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Catégorie de charge *
                </label>
                <select
                  name="chargeCategory"
                  value={formData.chargeCategory}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Sélectionner --</option>
                  {charges.map((charge) => (
                    <option key={charge.id} value={charge.id}>
                      {charge["designation_Charges"]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Numéro de dossier
                </label>
                <input
                  type="text"
                  name="fileNumber"
                  value={formData.fileNumber}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formData.invoiceType === 'frais-generaux' ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  disabled={formData.invoiceType === 'frais-generaux'}
                  placeholder={formData.invoiceType === 'frais-generaux' ? 'Non applicable pour frais généraux' : ''}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Motif / Description
                </label>
                <textarea
                  name="motif"
                  value={formData.motif}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Décrivez le motif de cette facture..."
                />
              </div>
            </div>
          </div>

          {/* Données financières */}
          <div>
            <SectionTitle title="Données financières" />
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Devise *
                </label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="USD">USD</option>
                  <option value="CDF">CDF</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Taux {formData.currency !== 'USD' ? '*' : ''}
                </label>
                <input
                  type="number"
                  step="0.0001"
                  name="exchangeRate"
                  value={formData.exchangeRate}
                  onChange={handleChange}
                  disabled={formData.currency === 'USD'}
                  placeholder={formData.currency === 'USD' ? '1.00' : 'Ex: 2500'}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                    formData.currency === 'USD' ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  required={formData.currency !== 'USD'}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Montant facture ({formData.currency}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="invoiceAmount"
                  value={formData.invoiceAmount}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Montant USD (convertis) :
                </label>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-lg font-bold text-blue-600 font-mono">
                    {convertedAmount.toFixed(2)} USD
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Conditions & paiement */}
          <div>
            <SectionTitle title="Conditions & paiement" />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Priorité de paiement *
                </label>
                <select
                  name="urgencyLevel"
                  value={formData.urgencyLevel}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="normal">Normal</option>
                  <option value="prioritaire">Prioritaire</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Délai de paiement *
                </label>
                <select
                  name="paymentDelay"
                  value={formData.paymentDelay}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="immediate">Paiement comptant</option>
                  <option value="at-reception">Paiement à réception</option>
                  <option value="days-7">Paiement à 7 jours</option>
                  <option value="days-15">Paiement à 15 jours</option>
                  <option value="days-30">Paiement à 30 jours</option>
                  <option value="days-45">Paiement à 45 jours</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Échéance *
                </label>
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={(e) => {
                    // Allow manual selection for "Paiement comptant"
                    if (formData.paymentDelay === 'immediate') {
                      handleChange(e);
                    }
                  }}
                  disabled={formData.paymentDelay !== 'immediate'}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formData.paymentDelay !== 'immediate' ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Mode de paiement requis
                </label>
                <select
                  name="paymentMode"
                  value={formData.paymentMode}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Banque</option>
                  <option value="mobile-money">Mobile Money</option>
                  <option value="check">Chèque</option>
                </select>
              </div>
            </div>
          </div>

          {/* Informations complémentaires */}
          <div>
            <SectionTitle title="Informations complémentaires" />
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Facture attachée <span className="text-red-600">*</span>
                </label>
                <div
                  className={`border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors ${
                    isDragging ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-400'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {formData.isUploading ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
                      <p className="text-gray-600">Upload en cours vers Google Drive...</p>
                      <p className="text-sm text-gray-500">{formData.attachedInvoice?.name}</p>
                      {filePreview && (
                        <div className="mt-4 rounded border border-gray-300 overflow-hidden">
                          <img src={filePreview} alt="Preview" className="max-h-32 max-w-32 object-cover" />
                        </div>
                      )}
                    </div>
                  ) : formData.attachedInvoiceUrl ? (
                    <div className="flex flex-col gap-4">
                      {filePreview ? (
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0">
                            <img 
                              src={filePreview} 
                              alt="Preview" 
                              className="h-24 w-24 object-cover rounded border border-gray-300"
                            />
                          </div>
                          <div className="flex-1">
                            <p className="text-gray-700 font-medium">{formData.attachedInvoice?.name}</p>
                            <p className="text-sm text-gray-500">
                              {formData.attachedInvoice?.size 
                                ? `${(formData.attachedInvoice.size / 1024).toFixed(2)} KB`
                                : 'Taille inconnue'
                              }
                            </p>
                            <a 
                              href={formData.attachedInvoiceUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-800 underline mt-2 inline-block"
                            >
                              Voir sur Google Drive
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={removeFile}
                            className="text-red-500 hover:text-red-700 flex-shrink-0"
                          >
                            <X size={20} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between py-4">
                          <div className="flex items-center gap-3">
                            <FileText className="text-blue-600" size={32} />
                            <div>
                              <p className="text-gray-700 font-medium">{formData.attachedInvoice?.name}</p>
                              <p className="text-sm text-gray-500">
                                {formData.attachedInvoice?.size 
                                  ? `${(formData.attachedInvoice.size / 1024).toFixed(2)} KB`
                                  : 'Taille inconnue'
                                }
                              </p>
                              <a 
                                href={formData.attachedInvoiceUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 underline"
                              >
                                Voir sur Google Drive
                              </a>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={removeFile}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X size={20} />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                      <p className="text-gray-600 mb-2">
                        Glissez-déposez un fichier ici ou
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        Parcourir les fichiers
                      </button>
                      <p className="text-xs text-gray-500 mt-2">
                        PDF, JPG, JPEG, PNG (max 10MB)
                      </p>
                    </div>
                  )}
                  
                  {formData.uploadError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                      <AlertCircle className="text-red-500" size={16} />
                      <span className="text-red-700 text-sm">{formData.uploadError}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Commentaires
              </label>
              <textarea
                name="comments"
                value={formData.comments}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-4 pt-6 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={formData.isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {formData.isSubmitting && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              {formData.isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>

      {/* Modal d'ajout de fournisseur */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between bg-gray-50 border-b px-6 py-4">
              <h3 className="text-lg font-bold text-gray-800">Ajouter un fournisseur</h3>
              <button
                onClick={() => setShowAddSupplierModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nom du fournisseur *
                </label>
                <input
                  type="text"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Société XYZ"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Catégorie *
                </label>
                <input
                  type="text"
                  value={newSupplier.category}
                  onChange={(e) => setNewSupplier(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Services, Matériel, Énergie"
                  required
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-4 px-6 py-4 border-t">
              <button
                type="button"
                onClick={() => setShowAddSupplierModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleAddSupplier}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InvoiceForm;

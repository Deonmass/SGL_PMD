import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MoreVertical, Lock, UserX, Edit2, Trash2, RefreshCw, Search, X, Loader, Plus, Shield, Heart } from 'lucide-react';
import bcrypt from 'bcryptjs';
import Swal from 'sweetalert2';
import { supabase } from '../services/supabase';
import { usePermission } from '../hooks/usePermission';
import AccessDenied from '../components/AccessDenied';

interface Agent {
  ID: number;
  Nom: string;
  email: string;
  Role: string;
  REGION: string;
  Derniere_connexion: string | null;
  statut: string;
  Mot_de_passe?: string;
  permissions?: string;
}

interface MenuPermissions {
  [menuKey: string]: {
    [key: string]: boolean | undefined;
  };
}

interface NewAgent {
  Nom: string;
  email: string;
  Role: string;
  REGION: string;
}

interface UsersPageProps {
  activeMenu?: string;
  menuTitle?: string;
}

interface ContextMenuPosition {
  x: number;
  y: number;
}

// Rôles prédéfinis avec leurs permissions
const PREDEFINED_ROLES: Record<string, MenuPermissions> = {
  'Administrateur': {
    dashboard: { voir: true },
    dashboard_ffg: { voir: true },
    recherche: { voir: true, voir_operationnel: true, voir_frais_generaux: true },
    factures: { voir: true, creer: true, modifier: true, supprimer: true, valider: true, rejeter: true, establir_op: true, marquer_payee: true },
    factures_pending_dr: { voir: true, valider: true, rejeter: true },
    factures_pending_dop: { voir: true, valider: true, rejeter: true },
    factures_rejected: { voir: true, modifier: true },
    factures_overdue: { voir: true },
    factures_validated: { voir: true, establir_op: true },
    factures_payment_order: { voir: true, establir_op: true, marquer_payee: true },
    factures_paid: { voir: true },
    factures_partially_paid: { voir: true },
    factures_ffg: { voir: true, creer: true, modifier: true, supprimer: true, valider: true, rejeter: true, establir_op: true, marquer_payee: true },
    factures_ffg_pending_dr: { voir: true, valider: true, rejeter: true },
    factures_ffg_pending_dop: { voir: true, valider: true, rejeter: true },
    factures_ffg_rejected: { voir: true, modifier: true },
    factures_ffg_overdue: { voir: true },
    factures_ffg_validated: { voir: true, establir_op: true },
    factures_ffg_payment_order: { voir: true, establir_op: true, marquer_payee: true },
    factures_ffg_paid: { voir: true },
    factures_ffg_partially_paid: { voir: true },
    paramettre: { voir: true },
    fournisseurs: { voir: true, creer: true, modifier: true, supprimer: true },
    charges: { voir: true, creer: true, modifier: true, supprimer: true },
    centres: { voir: true, creer: true, modifier: true, supprimer: true },
    caisses: { voir: true, creer: true, modifier: true, supprimer: true },
    comptes: { voir: true, creer: true, modifier: true, supprimer: true },
    utilisateurs: { voir: true, creer: true, modifier: true, supprimer: true, reinitialiser_mdp: true, gerer_permissions: true },
    logs: { voir: true, annuler: true },
    dr_ouest: { valider: true },
    dr_est: { valider: true },
    dr_sud: { valider: true },
    dop_tout: { valider: true },
    dg_tout: { valider: true }
  },
  'DR': {
    dashboard: { voir: true },
    dashboard_ffg: { voir: true },
    recherche: { voir: true, voir_operationnel: true, voir_frais_generaux: true },
    factures: { voir: true, creer: false, modifier: false, supprimer: false, valider: true, rejeter: true, establir_op: false, marquer_payee: false },
    factures_pending_dr: { voir: true, valider: true, rejeter: true },
    factures_rejected: { voir: true, modifier: false },
    factures_overdue: { voir: true },
    factures_ffg: { voir: true, creer: false, modifier: false, supprimer: false, valider: true, rejeter: true, establir_op: false, marquer_payee: false },
    factures_ffg_pending_dr: { voir: true, valider: true, rejeter: true },
    factures_ffg_rejected: { voir: true, modifier: false },
    factures_ffg_overdue: { voir: true },
    paramettre: { voir: false },
    fournisseurs: { voir: true, creer: false, modifier: false, supprimer: false },
    charges: { voir: false },
    centres: { voir: false },
    caisses: { voir: false },
    comptes: { voir: false },
    utilisateurs: { voir: false },
    logs: { voir: false, annuler: false },
    dr_ouest: { valider: true },
    dr_est: { valider: false },
    dr_sud: { valider: false },
  },
  'DOP': {
    dashboard: { voir: true },
    dashboard_ffg: { voir: true },
    recherche: { voir: true, voir_operationnel: true, voir_frais_generaux: true },
    factures: { voir: true, creer: false, modifier: false, supprimer: false, valider: true, rejeter: true, establir_op: false, marquer_payee: false },
    factures_pending_dop: { voir: true, valider: true, rejeter: true },
    factures_validated: { voir: true, establir_op: false },
    factures_ffg: { voir: true, creer: false, modifier: false, supprimer: false, valider: true, rejeter: true, establir_op: false, marquer_payee: false },
    factures_ffg_pending_dop: { voir: true, valider: true, rejeter: true },
    factures_ffg_validated: { voir: true, establir_op: false },
    paramettre: { voir: false },
    dop_tout: { valider: true },
    logs: { voir: false, annuler: false },
  },
  'Utilisateur': {
    dashboard: { voir: true },
    dashboard_ffg: { voir: true },
    recherche: { voir: true, voir_operationnel: true, voir_frais_generaux: false },
    factures: { voir: true, creer: false, modifier: false, supprimer: false, valider: false, rejeter: false, establir_op: false, marquer_payee: false },
    factures_ffg: { voir: true, creer: false, modifier: false, supprimer: false, valider: false, rejeter: false, establir_op: false, marquer_payee: false },
    paramettre: { voir: false },
    logs: { voir: false, annuler: false },
  },
  'Gestionnaire': {
    dashboard: { voir: true },
    dashboard_ffg: { voir: true },
    recherche: { voir: true, voir_operationnel: true, voir_frais_generaux: true },
    factures: { voir: true, creer: true, modifier: true, supprimer: false, valider: false, rejeter: false, establir_op: false, marquer_payee: false },
    factures_ffg: { voir: true, creer: true, modifier: true, supprimer: false, valider: false, rejeter: false, establir_op: false, marquer_payee: false },
    paramettre: { voir: true },
    fournisseurs: { voir: true, creer: true, modifier: true, supprimer: false },
    charges: { voir: true, creer: true, modifier: true, supprimer: false },
    centres: { voir: true, creer: true, modifier: true, supprimer: false },
    caisses: { voir: true, creer: true, modifier: true, supprimer: false },
    comptes: { voir: true, creer: true, modifier: true, supprimer: false },
    logs: { voir: false, annuler: false },
  },
};

function UsersPage({ menuTitle = 'Agents' }: UsersPageProps) {
  const { canView, canDelete, canEdit, canCreate } = usePermission();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<Agent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    agent: Agent;
    position: ContextMenuPosition;
  } | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [resetPassword, setResetPassword] = useState('SGL');
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [newAgent, setNewAgent] = useState<NewAgent>({
    Nom: '',
    email: '',
    Role: 'Utilisateur',
    REGION: 'OUEST'
  });
  const [permissionsAgent, setPermissionsAgent] = useState<Agent | null>(null);
  const [activePermissionTab, setActivePermissionTab] = useState('dashboard-recherche');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showSaveRoleModal, setShowSaveRoleModal] = useState(false);
  const [roleNameToSave, setRoleNameToSave] = useState('');
  const [selectedRoleTemplate, setSelectedRoleTemplate] = useState<string>('');
  const [permissions, setPermissions] = useState<MenuPermissions>({
    dashboard: { voir: true },
    dashboard_ffg: { voir: true },
    recherche: { voir: true, voir_operationnel: true, voir_frais_generaux: false },
    factures: {
      voir: true,
      creer: false,
      modifier: true,
      supprimer: false,
      valider: true,
      rejeter: true,
      establir_op: true,
      marquer_payee: true
    },
    factures_pending_dr: { voir: true, valider: true, rejeter: true },
    factures_pending_dop: { voir: true, valider: true, rejeter: true },
    factures_rejected: { voir: true, modifier: true },
    factures_overdue: { voir: true },
    factures_validated: { voir: true, establir_op: true },
    factures_payment_order: { voir: true, establir_op: true, marquer_payee: true },
    factures_paid: { voir: true },
    factures_partially_paid: { voir: true },
    factures_ffg: {
      voir: true,
      creer: false,
      modifier: true,
      supprimer: false,
      valider: true,
      rejeter: true,
      establir_op: true,
      marquer_payee: true
    },
    factures_ffg_pending_dr: { voir: true, valider: true, rejeter: true },
    factures_ffg_pending_dop: { voir: true, valider: true, rejeter: true },
    factures_ffg_rejected: { voir: true, modifier: true },
    factures_ffg_overdue: { voir: true },
    factures_ffg_validated: { voir: true, establir_op: true },
    factures_ffg_payment_order: { voir: true, establir_op: true, marquer_payee: true },
    factures_ffg_paid: { voir: true },
    factures_ffg_partially_paid: { voir: true },
    paramettre: { voir: true },
    fournisseurs: { voir: true, creer: false, modifier: false, supprimer: false },
    charges: { voir: true, creer: false, modifier: false, supprimer: false },
    centres: { voir: true, creer: false, modifier: false, supprimer: false },
    caisses: { voir: true, creer: false, modifier: false, supprimer: false },
    comptes: { voir: true, creer: false, modifier: false, supprimer: false },
    utilisateurs: {
      voir: true,
      creer: false,
      modifier: false,
      supprimer: false,
      reinitialiser_mdp: false,
      gerer_permissions: false
    },
    logs: { voir: false, annuler: false },
    dr_ouest: { valider: false },
    dr_est: { valider: false },
    dr_sud: { valider: false },
    dop_tout: { valider: false },
    dg_tout: { valider: false }
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  if (!canView('utilisateurs')) {
    return <AccessDenied message="Vous n'avez pas accès à la gestion des utilisateurs." />;
  }

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: dbError } = await supabase
        .from('AGENTS')
        .select('*')
        .order('REGION', { ascending: true })
        .order('Nom', { ascending: true });

      if (dbError) {
        console.error('Error fetching agents:', dbError);
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: 'Erreur lors du chargement des agents',
          confirmButtonColor: '#3b82f6',
        });
      } else {
        setAgents(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Erreur lors du chargement',
        confirmButtonColor: '#3b82f6',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const filterAgents = useCallback(() => {
    let filtered = agents;

    if (selectedRegion !== 'all') {
      filtered = filtered.filter(a => a.REGION === selectedRegion);
    }

    if (selectedRoleFilter !== 'all') {
      filtered = filtered.filter(a => a.Role === selectedRoleFilter);
    }

    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(a => 
        a.Nom.toLowerCase().includes(lower) || 
        a.email.toLowerCase().includes(lower)
      );
    }

    filtered.sort((a, b) => a.Nom.localeCompare(b.Nom));
    setFilteredAgents(filtered);
  }, [agents, selectedRegion, selectedRoleFilter, searchTerm]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    filterAgents();
  }, [filterAgents]);

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (role: string): string => {
    const colorMap: Record<string, string> = {
      'Administrateur': '#ef4444',
      'DR': '#3b82f6',
      'DG': '#8b5cf6',
      'DOP': '#f59e0b',
      'Finance': '#06b6d4',
      'Manager': '#10b981',
      'Gestionnaire': '#6366f1',
      'Validateur': '#22c55e',
      'Auditeur': '#a855f7',
      'Utilisateur': '#f97316',
    };
    return colorMap[role] || '#6b7280';
  };

  const getCardColors = (role: string): { borderColor: string; bgColor: string } => {
    const cardColorMap: Record<string, { borderColor: string; bgColor: string }> = {
      'Administrateur': { borderColor: '#ef4444', bgColor: '#fecaca' },
      'DR': { borderColor: '#3b82f6', bgColor: '#bfdbfe' },
      'DG': { borderColor: '#8b5cf6', bgColor: '#d8b4fe' },
      'DOP': { borderColor: '#f59e0b', bgColor: '#fcd34d' },
      'Gestionnaire': { borderColor: '#3b82f6', bgColor: '#bfdbfe' },
      'Validateur': { borderColor: '#22c55e', bgColor: '#bbf7d0' },
      'Auditeur': { borderColor: '#a855f7', bgColor: '#e9d5ff' },
      'Utilisateur': { borderColor: '#f97316', bgColor: '#fed7aa' },
    };
    return cardColorMap[role] || { borderColor: '#6b7280', bgColor: '#e5e7eb' };
  };

  const handleContextMenu = (agent: Agent, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      agent,
      position: { x: e.clientX, y: e.clientY }
    });
  };

  const setActionLoading_ = (agentId: number, action: string, value: boolean) => {
    setActionLoading(prev => ({ ...prev, [`${agentId}-${action}`]: value }));
  };

  const handleShowResetPasswordModal = (agent: Agent) => {
    Swal.fire({
      title: 'Réinitialiser le mot de passe',
      html: `
        <div style="text-align: left;">
          <label style="display: block; font-weight: 500; margin-bottom: 8px; color: #374151;">Nouveau mot de passe:</label>
          <input 
            id="passwordInput" 
            type="text" 
            value="SGL"
            style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-family: monospace; box-sizing: border-box;"
          />
        </div>
      `,
      didOpen: () => {
        const input = document.getElementById('passwordInput') as HTMLInputElement;
        if (input) {
          input.value = resetPassword;
          input.addEventListener('input', (e) => {
            setResetPassword((e.target as HTMLInputElement).value);
          });
        }
      },
      showCancelButton: true,
      confirmButtonText: 'Confirmer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#d1d5db',
    }).then(async (result) => {
      if (result.isConfirmed) {
        await handleResetPasswordConfirm(agent);
      }
    });
  };

  const handleResetPasswordConfirm = async (agent: Agent) => {
    setActionLoading_( agent.ID, 'reset', true);
    try {
      // Hash the password using bcryptjs
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(resetPassword, saltRounds);
      
      // Update the password in the database
      const { error } = await supabase
        .from('AGENTS')
        .update({ 'mot de passe': hashedPassword })
        .eq('ID', agent.ID);

      if (error) throw error;
      
      setAgents(agents.map(a => a.ID === agent.ID ? { ...a, Mot_de_passe: hashedPassword } : a));
      Swal.fire({
        icon: 'success',
        title: 'Succès',
        text: `Mot de passe réinitialisé à "${resetPassword}"`,
        confirmButtonColor: '#3b82f6',
      });
      setResetPassword('SGL');
    } catch (err) {
      console.error('Error resetting password:', err);
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Erreur lors de la réinitialisation',
        confirmButtonColor: '#3b82f6',
      });
    } finally {
      setActionLoading_( agent.ID, 'reset', false);
      setContextMenu(null);
    }
  };

  const handleToggleStatus = async (agent: Agent) => {
    setActionLoading_( agent.ID, 'toggle', true);
    try {
      const newStatus = agent.statut === 'Actif' ? 'Inactif' : 'Actif';
      const { error } = await supabase
        .from('AGENTS')
        .update({ statut: newStatus })
        .eq('ID', agent.ID);

      if (error) throw error;
      
      setAgents(agents.map(a => a.ID === agent.ID ? { ...a, statut: newStatus } : a));
      Swal.fire({
        icon: 'success',
        title: 'Succès',
        text: `Compte ${newStatus}`,
        confirmButtonColor: '#3b82f6',
      });
    } catch (err) {
      console.error('Error toggling status:', err);
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Erreur lors du changement de statut',
        confirmButtonColor: '#3b82f6',
      });
    } finally {
      setActionLoading_( agent.ID, 'toggle', false);
      setContextMenu(null);
    }
  };

  const handleDeleteAgent = async (agent: Agent) => {
    // Vérification de permission avant suppression
    if (!canDelete('utilisateurs')) {
      Swal.fire({
        icon: 'error',
        title: 'Accès refusé',
        text: 'Vous n\'avez pas la permission de supprimer des agents.',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    Swal.fire({
      title: 'Supprimer cet agent?',
      text: 'Cette action est irréversible. L\'agent et toutes ses données seront supprimés.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#d1d5db',
    }).then(async (result) => {
      if (result.isConfirmed) {
        setActionLoading_( agent.ID, 'delete', true);
        try {
          const { error } = await supabase
            .from('AGENTS')
            .delete()
            .eq('ID', agent.ID);

          if (error) throw error;
          
          setAgents(agents.filter(a => a.ID !== agent.ID));
          Swal.fire({
            icon: 'success',
            title: 'Succès',
            text: 'Agent supprimé',
            confirmButtonColor: '#3b82f6',
          });
        } catch (err) {
          console.error('Error deleting agent:', err);
          Swal.fire({
            icon: 'error',
            title: 'Erreur',
            text: 'Erreur lors de la suppression',
            confirmButtonColor: '#3b82f6',
          });
        } finally {
          setActionLoading_( agent.ID, 'delete', false);
          setContextMenu(null);
        }
      }
    });
  };

  const handleSaveEdit = async () => {
    if (!editingAgent) return;

    // Vérification de permission avant modification
    if (!canEdit('utilisateurs')) {
      Swal.fire({
        icon: 'error',
        title: 'Accès refusé',
        text: 'Vous n\'avez pas la permission de modifier des agents.',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    setActionLoading_( editingAgent.ID, 'edit', true);
    try {
      const { error } = await supabase
        .from('AGENTS')
        .update({
          Nom: editingAgent.Nom,
          email: editingAgent.email,
          Role: editingAgent.Role,
          REGION: editingAgent.REGION,
        })
        .eq('ID', editingAgent.ID);

      if (error) throw error;
      
      setAgents(agents.map(a => a.ID === editingAgent.ID ? editingAgent : a));
      setEditingAgent(null);
      Swal.fire({
        icon: 'success',
        title: 'Succès',
        text: 'Agent mis à jour',
        confirmButtonColor: '#3b82f6',
      });
    } catch (err) {
      console.error('Error updating agent:', err);
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Erreur lors de la mise à jour',
        confirmButtonColor: '#3b82f6',
      });
        } finally {
          setActionLoading_( editingAgent.ID, 'edit', false);
          setContextMenu(null);
        }
      };

  const handleAddNewUser = async () => {
    // Vérification de permission avant création
    if (!canCreate('utilisateurs')) {
      Swal.fire({
        icon: 'error',
        title: 'Accès refusé',
        text: 'Vous n\'avez pas la permission de créer des agents.',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    if (!newAgent.Nom || !newAgent.email) {
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Veuillez remplir tous les champs requis',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    setActionLoading_( 0, 'add', true);
    try {
      // Hash default password
      const hashedPassword = await bcrypt.hash('SGL', 10);
      
      const { data, error: insertError } = await supabase
        .from('AGENTS')
        .insert([{
          Nom: newAgent.Nom,
          email: newAgent.email,
          Role: newAgent.Role,
          REGION: newAgent.REGION,
          'mot de passe': hashedPassword,
          statut: 'Actif'
        }])
        .select();

      if (insertError) throw insertError;
      
      if (data) {
        const newAgent_ = data[0];
        setAgents([...agents, newAgent_]);
        setShowNewUserModal(false);
        setNewAgent({ Nom: '', email: '', Role: 'Utilisateur', REGION: 'OUEST' });
        
        // Afficher immédiatement le modal de permissions
        setPermissionsAgent(newAgent_);
        setActivePermissionTab('dashboard-recherche');
      }
    } catch (err) {
      console.error('Error adding agent:', err);
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Erreur lors de l\'ajout de l\'agent',
        confirmButtonColor: '#3b82f6',
      });
    } finally {
      setActionLoading_( 0, 'add', false);
    }
  };

  const handleShowPermissionsModal = async (agent: Agent) => {
    try {
      // Toujours récupérer les permissions fraîches depuis la base de données
      const { data, error } = await supabase
        .from('AGENTS')
        .select('permission')
        .eq('ID', agent.ID)
        .single();
      
      if (error) {
        console.error('Erreur chargement permissions:', error);
        // En cas d'erreur, utiliser les permissions de l'agent si disponibles
        const perms = agent.permissions ? JSON.parse(agent.permissions) : permissions;
        setPermissions(perms);
      } else if (data.permission) {
        // Utiliser les permissions depuis la base de données
        const perms = JSON.parse(data.permission);
        setPermissions(perms);
      } else {
        // Utiliser les permissions par défaut si aucune permission en base
        setPermissions(permissions);
      }
      
      setPermissionsAgent(agent);
      setActivePermissionTab('dashboard-recherche');
    } catch (err) {
      console.error('Erreur parsing permissions:', err);
      setPermissions(permissions);
      setPermissionsAgent(agent);
      setActivePermissionTab('dashboard-recherche');
    }
  };

  const handleSavePermissions = async () => {
    if (!permissionsAgent) return;

    setActionLoading_( permissionsAgent.ID, 'permissions', true);
    try {
      const { error: updateError } = await supabase
        .from('AGENTS')
        .update({ permission: JSON.stringify(permissions) })
        .eq('ID', permissionsAgent.ID);

      if (updateError) throw updateError;
      
      setAgents(agents.map(a => a.ID === permissionsAgent.ID ? { ...a, permissions: JSON.stringify(permissions) } : a));
      setPermissionsAgent(null);
      Swal.fire({
        icon: 'success',
        title: 'Succès',
        text: 'Permissions enregistrées',
        confirmButtonColor: '#3b82f6',
      });
    } catch (err) {
      console.error('Error saving permissions:', err);
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Erreur lors de l\'enregistrement des permissions',
        confirmButtonColor: '#3b82f6',
      });
    } finally {
      setActionLoading_( permissionsAgent.ID, 'permissions', false);
    }
  };

  const handleSaveRoleAsTemplate = async () => {
    if (!roleNameToSave.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Veuillez entrer un nom pour le rôle',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    try {
      setActionLoading_( 0, 'save-role', true);
      // Stocker dans localStorage pour la démonstration
      // En production, cela serait stocké en base de données
      const roles = JSON.parse(localStorage.getItem('sgl_custom_roles') || '{}');
      roles[roleNameToSave] = permissions;
      localStorage.setItem('sgl_custom_roles', JSON.stringify(roles));

      Swal.fire({
        icon: 'success',
        title: 'Succès',
        text: `Le rôle "${roleNameToSave}" a été enregistré`,
        confirmButtonColor: '#3b82f6',
      });
      
      setShowSaveRoleModal(false);
      setRoleNameToSave('');
    } catch (err) {
      console.error('Error saving role:', err);
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Erreur lors de l\'enregistrement du rôle',
        confirmButtonColor: '#3b82f6',
      });
    } finally {
      setActionLoading_( 0, 'save-role', false);
    }
  };

  const handleLoadRoleTemplate = (roleName: string) => {
    if (PREDEFINED_ROLES[roleName]) {
      setPermissions(PREDEFINED_ROLES[roleName]);
      setSelectedRoleTemplate(roleName);
    } else {
      // Charger depuis localStorage
      const customRoles = JSON.parse(localStorage.getItem('sgl_custom_roles') || '{}');
      if (customRoles[roleName]) {
        setPermissions(customRoles[roleName]);
        setSelectedRoleTemplate(roleName);
      }
    }
  };

  const handleToggleAdminMode = () => {
    if (isAdminMode) {
      // Désactiver le mode admin - réinitialiser aux permissions par défaut
      setPermissions({
        dashboard: { voir: true },
        dashboard_ffg: { voir: true },
        recherche: { voir: true, voir_operationnel: true, voir_frais_generaux: false },
        factures: {
          voir: true,
          creer: false,
          modifier: true,
          supprimer: false,
          valider: true,
          rejeter: true,
          establir_op: true,
          marquer_payee: true
        },
        factures_pending_dr: { voir: true, valider: true, rejeter: true },
        factures_pending_dop: { voir: true, valider: true, rejeter: true },
        factures_rejected: { voir: true, modifier: true },
        factures_overdue: { voir: true },
        factures_validated: { voir: true, establir_op: true },
        factures_payment_order: { voir: true, establir_op: true, marquer_payee: true },
        factures_paid: { voir: true },
        factures_partially_paid: { voir: true },
        factures_ffg: { voir: true, creer: false, modifier: true, supprimer: false, valider: true, rejeter: true, establir_op: true, marquer_payee: true },
        factures_ffg_pending_dr: { voir: true, valider: true, rejeter: true },
        factures_ffg_pending_dop: { voir: true, valider: true, rejeter: true },
        factures_ffg_rejected: { voir: true, modifier: true },
        factures_ffg_overdue: { voir: true },
        factures_ffg_validated: { voir: true, establir_op: true },
        factures_ffg_payment_order: { voir: true, establir_op: true, marquer_payee: true },
        factures_ffg_paid: { voir: true },
        factures_ffg_partially_paid: { voir: true },
        paramettre: { voir: true },
        fournisseurs: { voir: true, creer: false, modifier: false, supprimer: false },
        charges: { voir: true, creer: false, modifier: false, supprimer: false },
        centres: { voir: true, creer: false, modifier: false, supprimer: false },
        caisses: { voir: true, creer: false, modifier: false, supprimer: false },
        comptes: { voir: true, creer: false, modifier: false, supprimer: false },
        utilisateurs: {
          voir: true,
          creer: false,
          modifier: false,
          supprimer: false,
          reinitialiser_mdp: false,
          gerer_permissions: false
        },
        logs: { voir: false, annuler: false },
        dr_ouest: { valider: false },
        dr_est: { valider: false },
        dr_sud: { valider: false },
        dop_tout: { valider: false },
        dg_tout: { valider: false }
      });
    } else {
      // Activer le mode admin - tout cocher
      const adminPermissions: MenuPermissions = {
        dashboard: { voir: true },
        dashboard_ffg: { voir: true },
        recherche: { voir: true, voir_operationnel: true, voir_frais_generaux: true },
        factures: {
          voir: true,
          creer: true,
          modifier: true,
          supprimer: true,
          valider: true,
          rejeter: true,
          establir_op: true,
          marquer_payee: true
        },
        factures_pending_dr: { voir: true, valider: true, rejeter: true },
        factures_pending_dop: { voir: true, valider: true, rejeter: true },
        factures_rejected: { voir: true, modifier: true },
        factures_overdue: { voir: true },
        factures_validated: { voir: true, establir_op: true },
        factures_payment_order: { voir: true, establir_op: true, marquer_payee: true },
        factures_paid: { voir: true },
        factures_partially_paid: { voir: true },
        factures_ffg: { voir: true, creer: true, modifier: true, supprimer: true, valider: true, rejeter: true, establir_op: true, marquer_payee: true },
        factures_ffg_pending_dr: { voir: true, valider: true, rejeter: true },
        factures_ffg_pending_dop: { voir: true, valider: true, rejeter: true },
        factures_ffg_rejected: { voir: true, modifier: true },
        factures_ffg_overdue: { voir: true },
        factures_ffg_validated: { voir: true, establir_op: true },
        factures_ffg_payment_order: { voir: true, establir_op: true, marquer_payee: true },
        factures_ffg_paid: { voir: true },
        factures_ffg_partially_paid: { voir: true },
        paramettre: { voir: true },
        fournisseurs: { voir: true, creer: true, modifier: true, supprimer: true },
        charges: { voir: true, creer: true, modifier: true, supprimer: true },
        centres: { voir: true, creer: true, modifier: true, supprimer: true },
        caisses: { voir: true, creer: true, modifier: true, supprimer: true },
        comptes: { voir: true, creer: true, modifier: true, supprimer: true },
        utilisateurs: {
          voir: true,
          creer: true,
          modifier: true,
          supprimer: true,
          reinitialiser_mdp: true,
          gerer_permissions: true
        },
        logs: { voir: true, annuler: true },
        dr_ouest: { valider: true },
        dr_est: { valider: true },
        dr_sud: { valider: true },
        dop_tout: { valider: true },
        dg_tout: { valider: true }
      };
      setPermissions(adminPermissions);
    }
    setIsAdminMode(!isAdminMode);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Structure intelligente des menus avec sous-menus et actions
  const menuStructure = [
    {
      key: 'dashboard',
      label: 'DASHBOARD',
      actions: ['voir']
    },
    {
      key: 'dashboard_ffg',
      label: 'DASHBOARD FFG',
      actions: ['voir']
    },
    {
      key: 'recherche',
      label: 'RECHERCHE',
      actions: ['voir', 'voir_operationnel', 'voir_frais_generaux']
    },
    {
      key: 'factures',
      label: 'FACTURES',
      actions: ['voir', 'creer', 'modifier', 'supprimer', 'valider', 'rejeter', 'establir_op', 'marquer_payee'],
      subMenus: [
        { key: 'factures_pending_dr', label: 'En attente validation DR', actions: ['voir', 'valider', 'rejeter'] },
        { key: 'factures_pending_dop', label: 'En attente validation DOP', actions: ['voir', 'valider', 'rejeter'] },
        { key: 'factures_rejected', label: 'Rejetée', actions: ['voir', 'modifier'] },
        { key: 'factures_overdue', label: 'Facture Échues', actions: ['voir'] },
        { key: 'factures_validated', label: 'Validée (bon à payer)', actions: ['voir', 'establir_op'] },
        { key: 'factures_payment_order', label: 'Ordre de paiement', actions: ['voir', 'establir_op', 'marquer_payee'] },
        { key: 'factures_paid', label: 'Payé', actions: ['voir'] },
        { key: 'factures_partially_paid', label: 'Partiellement payé', actions: ['voir'] }
      ]
    },
    {
      key: 'factures_ffg',
      label: 'FACTURES FFG',
      actions: ['voir', 'creer', 'modifier', 'supprimer', 'valider', 'rejeter', 'establir_op', 'marquer_payee'],
      subMenus: [
        { key: 'factures_ffg_pending_dr', label: 'En attente validation DR', actions: ['voir', 'valider', 'rejeter'] },
        { key: 'factures_ffg_pending_dop', label: 'En attente validation DOP', actions: ['voir', 'valider', 'rejeter'] },
        { key: 'factures_ffg_rejected', label: 'Rejetée', actions: ['voir', 'modifier'] },
        { key: 'factures_ffg_overdue', label: 'Facture Échues', actions: ['voir'] },
        { key: 'factures_ffg_validated', label: 'Validée (bon à payer)', actions: ['voir', 'establir_op'] },
        { key: 'factures_ffg_payment_order', label: 'Ordre de paiement', actions: ['voir', 'establir_op', 'marquer_payee'] },
        { key: 'factures_ffg_paid', label: 'Payé', actions: ['voir'] },
        { key: 'factures_ffg_partially_paid', label: 'Partiellement payé', actions: ['voir'] }
      ]
    },
    {
      key: 'paramettre',
      label: 'PARAMETTRE',
      actions: ['voir'],
      subMenus: [
        { key: 'fournisseurs', label: 'Fournisseurs', actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        { key: 'charges', label: 'Types de charges', actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        { key: 'centres', label: 'Centres de coût', actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        { key: 'caisses', label: 'Caisses', actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        { key: 'comptes', label: 'Comptes', actions: ['voir', 'creer', 'modifier', 'supprimer'] }
      ]
    },
    {
      key: 'utilisateurs',
      label: 'UTILISATEURS',
      actions: ['voir', 'creer', 'modifier', 'supprimer', 'reinitialiser_mdp', 'gerer_permissions'],
      subMenus: [
        { key: 'logs', label: 'LOGs', actions: ['voir', 'annuler'] }
      ]
    }
  ];

  const actionLabels: Record<string, string> = {
    voir: 'Voir',
    voir_operationnel: 'Voir Opérationnel',
    voir_frais_generaux: 'Voir Frais généraux',
    creer: 'Créer',
    modifier: 'Modifier',
    supprimer: 'Supprimer',
    valider: 'Valider',
    rejeter: 'Rejeter',
    establir_op: 'Établir OP',
    marquer_payee: 'Marquer payée',
    reinitialiser_mdp: 'Réinitialiser MDP',
    gerer_permissions: 'Gérer permissions',
    annuler: 'Annuler action'
  };

  // Structure des onglets pour le modal de permissions
  const permissionsTabs = [
    {
      id: 'dashboard-recherche',
      label: 'DashBoard et Recherche',
      menus: ['dashboard', 'dashboard_ffg', 'recherche']
    },
    {
      id: 'factures',
      label: 'Facture',
      menus: ['factures']
    },
    {
      id: 'factures-ffg',
      label: 'Facture FFG',
      menus: ['factures_ffg']
    },
    {
      id: 'paramettre',
      label: 'Paramettre',
      menus: ['paramettre']
    },
    {
      id: 'utilisateurs',
      label: 'Utilisateur',
      menus: ['utilisateurs']
    }
  ];

  const regions = ['all', 'OUEST', 'EST', 'SUD'];

  return (
    <div className="bg-white min-h-screen">
      {/* Header */}
      <div className="bg-gray-200 p-2">
        <h1 className="text-2xl font-bold text-gray-900">{menuTitle}</h1>
      </div>

      {/* Onglets par région avec recherche et boutons à droite */}
      <div className="bg-gray-200 flex justify-between items-center gap-4 pr-2 pl-2 pt-2 pb-0 border-b border-gray-300 overflow-x-auto sticky top-0 z-40">
        {/* Onglets à gauche */}
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedRegion('all')}
            className={`px-4 py-2 text-sm font-medium transition-all whitespace-nowrap ${
              selectedRegion === 'all'
                ? 'bg-white text-black font-bold border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Toutes ({agents.length})
          </button>
          {regions.filter(r => r !== 'all').map(region => (
            <button
              key={region}
              onClick={() => setSelectedRegion(region)}
              className={`px-4 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                selectedRegion === region
                ? 'bg-white text-black font-bold border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {region} ({agents.filter(a => a.REGION === region).length})
          </button>
          ))}
        </div>
        
        {/* Barre de recherche et boutons à droite */}
        <div className="flex items-center gap-2">
          {/* Barre de recherche */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par nom ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Select de filtrage par rôle */}
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
          >
            <option value="all">Tous les rôles</option>
            {[...new Set(agents.map(a => a.Role))].sort().map(role => (
              <option key={role} value={role}>
                {role} ({agents.filter(a => a.Role === role).length})
              </option>
            ))}
          </select>
          
          {/* Boutons avec noms et couleurs dégradées */}
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg transition disabled:opacity-50 text-sm font-medium"
            title="Actualiser"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
          <button 
            onClick={() => setShowNewUserModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white rounded-lg transition text-sm font-medium"
            title="Ajouter un agent"
          >
            <Plus size={16} />
            Nouveau
          </button>
        </div>
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="flex items-center justify-center py-12 pr-10 pl-10 ">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-sm">Chargement des agents...</p>
          </div>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          Aucun agent trouvé
        </div>
      ) : (
        <div className="pr-4 pl-4 pt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredAgents.map((agent) => {
            const cardColors = getCardColors(agent.Role);
            const initials = getInitials(agent.Nom);
            return (
              <div
                key={agent.ID}
                className="bg-white rounded-xl shadow-md hover:shadow-xl hover:scale-105 transition-all duration-300 overflow-hidden flex flex-col text-center h-fit cursor-pointer hover:bg-gradient-to-br hover:from-blue-500 hover:via-purple-500 hover:to-pink-500 hover:text-white group"
              >
                {/* Avatar Circulaire avec image de fond */}
                <div className="pt-6 flex justify-center relative">
                  {/* Image de fond avec effet fondu */}
                  <div className="absolute inset-0 opacity-10">
                    <img 
                      src="https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&h=600&fit=crop" 
                      alt="Background" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/50 to-transparent"></div>
                  </div>
                  
                  <div
                    className="w-24 h-24 rounded-full overflow-hidden shadow-md relative z-10"
                  >
                    <img 
                      src="/images/user.jpeg" 
                      alt={`${agent.Nom} avatar`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback: afficher les initiales si l'image ne charge pas
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.style.backgroundColor = cardColors.borderColor;
                          parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-white font-bold text-2xl">${initials}</div>`;
                        }
                      }}
                    />
                  </div>
                  
                  {/* Menu 3 points en haut à droite */}
                  <button
                    onClick={(e) => handleContextMenu(agent, e)}
                    className="absolute top-2 right-2 p-2 hover:bg-gray-100 rounded-full transition z-10"
                  >
                    <MoreVertical size={18} className="text-gray-600 hover:text-gray-900 transition" />
                  </button>
                </div>

                {/* Contenu Principal */}
                <div className="flex-1 px-4 py-4">
                  <h3 className="font-bold text-lg text-gray-900 mb-1 group-hover:text-white transition-colors">{agent.Nom}</h3>
                  <p className="text-xs text-gray-500 mb-4 truncate group-hover:text-white/90 transition-colors">{agent.email}</p>

                  {/* Rôle, Région et Statut sur la même ligne */}
                  <div className="flex justify-center items-center gap-2 mb-3 flex-wrap">
                    <span 
                      className="inline-flex px-2 py-1 rounded-md text-xs font-semibold text-white group-hover:bg-white/20 transition-colors"
                      style={{ backgroundColor: cardColors.borderColor }}
                    >
                      {agent.Role}
                    </span>
                    <span className={`inline-flex px-2 py-1 rounded-md text-xs font-semibold text-white group-hover:bg-white/20 transition-colors ${
                      agent.REGION === 'OUEST' ? 'bg-blue-600' :
                      agent.REGION === 'EST' ? 'bg-green-600' :
                      agent.REGION === 'SUD' ? 'bg-orange-600' :
                      'bg-purple-600'
                    }`}>
                      {agent.REGION}
                    </span>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-gray-600 text-white group-hover:bg-white/20 transition-colors">
                      <span className={`w-2 h-2 rounded-full ${agent.statut === 'Actif' ? 'bg-green-400' : 'bg-red-400'}`}></span>
                      <span>{agent.statut}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Menu contextuel */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white rounded-lg shadow-lg border border-gray-200 z-50 min-w-[200px]"
          style={{
            top: `${Math.min(contextMenu.position.y, window.innerHeight - 300)}px`,
            left: `${Math.min(contextMenu.position.x, window.innerWidth - 250)}px`
          }}
        >
          <div className="border-b border-gray-200 px-3 py-2 bg-gray-50">
            <p className="font-semibold text-gray-900 text-sm">{contextMenu.agent.Nom}</p>
          </div>

          {canEdit('utilisateurs') && (
            <button
              onClick={() => {
                handleShowResetPasswordModal(contextMenu.agent);
                setContextMenu(null);
              }}
              disabled={actionLoading[`${contextMenu.agent.ID}-reset`]}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition text-sm hover:scale-105"
              title={!canEdit('utilisateurs') ? 'Vous n\'avez pas la permission' : 'Réinitialiser le mot de passe'}
            >
              {actionLoading[`${contextMenu.agent.ID}-reset`] ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <Lock size={14} />
              )}
              <span>Réinitialiser MDP</span>
            </button>
          )}

          {canEdit('utilisateurs') && (
            <button
              onClick={() => handleToggleStatus(contextMenu.agent)}
              disabled={actionLoading[`${contextMenu.agent.ID}-toggle`]}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition text-sm hover:scale-105"
              title={!canEdit('utilisateurs') ? 'Vous n\'avez pas la permission' : 'Changer le statut'}
            >
              {actionLoading[`${contextMenu.agent.ID}-toggle`] ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <UserX size={14} />
              )}
              <span>{contextMenu.agent.statut === 'Actif' ? 'Désactiver' : 'Activer'}</span>
            </button>
          )}

          {canEdit('utilisateurs') && (
            <button
              onClick={() => {
                setEditingAgent(contextMenu.agent);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition text-sm hover:scale-105"
              title="Modifier les informations"
            >
              <Edit2 size={14} />
              <span>Mettre à jour</span>
            </button>
          )}

          {canEdit('utilisateurs') && (
            <button
              onClick={() => {
                handleShowPermissionsModal(contextMenu.agent);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition text-sm hover:scale-105"
              title="Gérer les permissions"
            >
              <Shield size={14} />
              <span>Permissions</span>
            </button>
          )}

          {(canEdit('utilisateurs') || canDelete('utilisateurs')) && (
            <div className="border-t border-gray-200 my-1"></div>
          )}

          {canDelete('utilisateurs') && (
            <button
              onClick={() => {
                handleDeleteAgent(contextMenu.agent);
                setContextMenu(null);
              }}
              disabled={actionLoading[`${contextMenu.agent.ID}-delete`]}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition text-sm rounded-b-lg hover:scale-105"
              title="Supprimer l'agent"
            >
              {actionLoading[`${contextMenu.agent.ID}-delete`] ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              <span>Supprimer</span>
            </button>
          )}

          {!canEdit('utilisateurs') && !canDelete('utilisateurs') && (
            <div className="px-3 py-2 text-xs text-gray-500 text-center">
              Vous n'avez pas les permissions
            </div>
          )}
        </div>
      )}


      {/* Modal d'édition */}
      {editingAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Modifier l'agent</h2>
              <button onClick={() => setEditingAgent(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input
                  type="text"
                  value={editingAgent.Nom}
                  onChange={(e) => setEditingAgent({ ...editingAgent, Nom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editingAgent.email}
                  onChange={(e) => setEditingAgent({ ...editingAgent, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                <select
                  value={editingAgent.Role}
                  onChange={(e) => setEditingAgent({ ...editingAgent, Role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="Administrateur">Administrateur</option>
                  <option value="DR">DR</option>
                  <option value="DG">DG</option>
                  <option value="DOP">DOP</option>
                  <option value="Finance">Finance</option>
                  <option value="Manager">Manager</option>
                  <option value="Gestionnaire">Gestionnaire</option>
                  <option value="Validateur">Validateur</option>
                  <option value="Auditeur">Auditeur</option>
                  <option value="Utilisateur">Utilisateur</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Région</label>
                <select
                  value={editingAgent.REGION}
                  onChange={(e) => setEditingAgent({ ...editingAgent, REGION: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="TOUT">TOUT (Accès à toutes les régions)</option>
                  {regions.filter(r => r !== 'all').map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingAgent({ ...editingAgent, statut: editingAgent.statut === 'Actif' ? 'Inactif' : 'Actif' })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      editingAgent.statut === 'Actif' ? 'bg-green-600' : 'bg-red-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        editingAgent.statut === 'Actif' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-sm font-medium ${
                    editingAgent.statut === 'Actif' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {editingAgent.statut}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setEditingAgent(null)}
                className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editingAgent && actionLoading[`${editingAgent.ID}-edit`]}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {editingAgent && actionLoading[`${editingAgent.ID}-edit`] && (
                  <Loader size={14} className="animate-spin" />
                )}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nouvel Utilisateur */}
      {showNewUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Ajouter un nouvel utilisateur</h2>
              <button onClick={() => setShowNewUserModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input
                  type="text"
                  value={newAgent.Nom}
                  onChange={(e) => setNewAgent({ ...newAgent, Nom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Entrez le nom"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newAgent.email}
                  onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="email@domaine.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                <select
                  value={newAgent.Role}
                  onChange={(e) => setNewAgent({ ...newAgent, Role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="Administrateur">Administrateur</option>
                  <option value="DR">DR</option>
                  <option value="DG">DG</option>
                  <option value="DOP">DOP</option>
                  <option value="Finance">Finance</option>
                  <option value="Manager">Manager</option>
                  <option value="Gestionnaire">Gestionnaire</option>
                  <option value="Validateur">Validateur</option>
                  <option value="Auditeur">Auditeur</option>
                  <option value="Utilisateur">Utilisateur</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Région</label>
                <select
                  value={newAgent.REGION}
                  onChange={(e) => setNewAgent({ ...newAgent, REGION: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="TOUT">TOUT (Accès à toutes les régions)</option>
                  <option value="OUEST">OUEST</option>
                  <option value="EST">EST</option>
                  <option value="SUD">SUD</option>
                </select>
              </div>

              <p className="text-xs text-gray-500 bg-blue-50 p-3 rounded">
                Le mot de passe par défaut sera: <span className="font-bold">SGL</span>
              </p>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowNewUserModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleAddNewUser}
                disabled={actionLoading['0-add']}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {actionLoading['0-add'] && (
                  <Loader size={14} className="animate-spin" />
                )}
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Permissions */}
      {permissionsAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-gray-900">Permissions - {permissionsAgent.Nom}</h2>
              <button onClick={() => setPermissionsAgent(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Onglets */}
            <div className="flex justify-between items-center px-6 pt-4 border-b bg-gray-50">
              <div className="flex gap-2">
                {permissionsTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActivePermissionTab(tab.id)}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                      activePermissionTab === tab.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              
              {/* Bouton Admin */}
              <button
                onClick={handleToggleAdminMode}
                className={`px-4 py-2 text-sm font-medium transition-colors border rounded-lg ${
                  isAdminMode
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-gray-600 text-white border-gray-600 hover:bg-gray-700'
                }`}
              >
                {isAdminMode ? 'Désactiver Admin' : 'Admin'}
              </button>
            </div>

            {/* Section Rôles prédéfinis */}
            <div className="px-6 py-4 bg-gray-50 border-b flex gap-3 items-center flex-wrap">
              <label className="text-sm font-medium text-gray-700">Charger un rôle:</label>
              <select
                value={selectedRoleTemplate}
                onChange={(e) => handleLoadRoleTemplate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">-- Sélectionner un rôle --</option>
                {Object.keys(PREDEFINED_ROLES).map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
                {JSON.parse(localStorage.getItem('sgl_custom_roles') || '{}') && 
                  Object.keys(JSON.parse(localStorage.getItem('sgl_custom_roles') || '{}')).map(role => (
                    <option key={`custom-${role}`} value={role}>{role} (Custom)</option>
                  ))
                }
              </select>
              <button
                onClick={() => setShowSaveRoleModal(true)}
                className="px-4 py-2 text-sm font-medium bg-green-600 text-white hover:bg-green-700 rounded-lg transition"
              >
                Définir comme rôle
              </button>
            </div>

            {/* Contenu des onglets */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {permissionsTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={activePermissionTab === tab.id ? 'block' : 'hidden'}
                >
                  <div className="space-y-6">
                    {tab.menus && tab.menus.map((menuKey) => {
                        const menu = menuStructure.find(m => m.key === menuKey);
                        if (!menu) return null;

                        return (
                          <div key={menu.key}>
                            {/* Titre du menu */}
                            <div className="mb-4">
                              <h3 className="text-base font-bold text-gray-900 border-l-4 border-blue-600 pl-3">
                                {menu.label}
                              </h3>
                            </div>

                            {/* Tableau à 2 colonnes */}
                            <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                              <table className="w-full">
                                <tbody>
                                  {/* Actions du menu principal */}
                                  {menu.actions.map((action) => (
                                    <tr key={action} className="border-b hover:bg-gray-50">
                                      <td className="px-4 py-3 text-sm font-medium text-gray-900 w-2/3">
                                        {menu.label} - {actionLabels[action]}
                                      </td>
                                      <td className="px-4 py-3 text-sm text-right w-1/3">
                                        <label className="flex items-center justify-end gap-2 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={permissions[menu.key]?.[action] || false}
                                            onChange={(e) => setPermissions({
                                              ...permissions,
                                              [menu.key]: {
                                                ...permissions[menu.key],
                                                [action]: e.target.checked
                                              }
                                            })}
                                            className="w-4 h-4 cursor-pointer"
                                          />
                                        </label>
                                      </td>
                                    </tr>
                                  ))}

                                  {/* Sous-menus */}
                                  {menu.subMenus && menu.subMenus.map((subMenu) => (
                                    <React.Fragment key={subMenu.key}>
                                      {/* Ligne séparatrice pour le sous-menu */}
                                      <tr className="bg-gray-50">
                                        <td colSpan={2} className="px-4 py-2">
                                          <p className="text-sm font-semibold text-gray-700">→ {subMenu.label}</p>
                                        </td>
                                      </tr>
                                      {/* Actions du sous-menu */}
                                      {subMenu.actions.map((action) => (
                                        <tr key={`${subMenu.key}-${action}`} className="border-b hover:bg-gray-50">
                                          <td className="px-4 py-3 pl-12 text-sm text-gray-700 w-2/3">
                                            {actionLabels[action]}
                                          </td>
                                          <td className="px-4 py-3 text-sm text-right w-1/3">
                                            <label className="flex items-center justify-end gap-2 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={permissions[subMenu.key]?.[action] || false}
                                                onChange={(e) => setPermissions({
                                                  ...permissions,
                                                  [subMenu.key]: {
                                                    ...permissions[subMenu.key],
                                                    [action]: e.target.checked
                                                  }
                                                })}
                                                className="w-4 h-4 cursor-pointer"
                                              />
                                            </label>
                                          </td>
                                        </tr>
                                      ))}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

            {/* Boutons */}
            <div className="flex gap-3 justify-end px-6 py-4 border-t bg-white sticky bottom-0">
              <button
                onClick={() => setPermissionsAgent(null)}
                className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleSavePermissions}
                disabled={actionLoading[`${permissionsAgent.ID}-permissions`]}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {actionLoading[`${permissionsAgent.ID}-permissions`] && (
                  <Loader size={14} className="animate-spin" />
                )}
                <Shield size={14} />
                Enregistrer les permissions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sauvegarder le rôle */}
      {showSaveRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Définir comme rôle</h2>
              <button onClick={() => setShowSaveRoleModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du rôle</label>
                <input
                  type="text"
                  value={roleNameToSave}
                  onChange={(e) => setRoleNameToSave(e.target.value)}
                  placeholder="Ex: Responsable Facturation"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <p className="text-xs text-gray-500 bg-blue-50 p-3 rounded">
                Ce rôle pourra être réutilisé pour d'autres agents
              </p>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowSaveRoleModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveRoleAsTemplate}
                disabled={actionLoading['0-save-role']}
                className="px-4 py-2 text-white bg-green-600 hover:bg-green-700 rounded-lg transition text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {actionLoading['0-save-role'] && (
                  <Loader size={14} className="animate-spin" />
                )}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UsersPage;

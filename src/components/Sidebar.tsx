import { 
  ChevronDown, 
  Users, 
  LayoutDashboard, 
  Search, 
  FileText, 
  Plus, 
  Clock, 
  CheckCircle, 
  DollarSign, 
  AlertCircle, 
  Calendar,
  Settings,
  Building,
  Tag,
  UserCheck,
  MapPin,
  CreditCard,
  LogOut,
  Lock,
  FileSignature,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { useState } from 'react';
import Swal from 'sweetalert2';
import bcryptjs from 'bcryptjs';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { supabase } from '../services/supabase';

interface SidebarProps {
  activeMenu: string;
  onMenuChange: (menu: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

function Sidebar({ activeMenu, onMenuChange, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const { agent, signOut } = useAuth();
  const { canView, canViewInvoiceTab, canManageOwnSignature } = usePermission();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const navItems = [
    {
      id: 'dashboard-factures',
      label: 'DASHBOARD',
      icon: LayoutDashboard,
    },
    {
      id: 'dashboard-ffg',
      label: 'DASHBOARD FFG',
      icon: LayoutDashboard,
    },
    {
      id: 'search',
      label: 'RECHERCHE ',
      icon: Search,
    },
    {
      id: 'factures',
      label: 'FACTURES',
      icon: FileText,
      subItems: [
        { id: 'factures-new', label: 'Nouvelle facture', icon: Plus },
        { id: 'factures-pending', label: 'En attente validation DR', icon: Clock },
        { id: 'factures-pending-dop', label: 'En attente validation DOP', icon: Clock },
        { id: 'factures-rejected', label: 'Factures Rejetées', icon: AlertCircle },
        { id: 'factures-overdue', label: 'Factures Echues', icon: Calendar },
        { id: 'factures-validated', label: 'Validée (bon à payer)', icon: CheckCircle },
        { id: 'factures-payment-order', label: 'Ordre de paiement', icon: DollarSign },
        { id: 'factures-paid', label: 'Totalement Payées', icon: DollarSign },
        { id: 'factures-partially-paid', label: 'Partiellement payées', icon: DollarSign },
      ],
    },
    {
      id: 'factures-ffg',
      label: 'FACTURES FFG',
      icon: FileText,
      subItems: [
        { id: 'factures-ffg-new', label: 'Nouvelle facture', icon: Plus },
        { id: 'factures-ffg-pending', label: 'En attente validation DR', icon: Clock },
        { id: 'factures-ffg-pending-dop', label: 'En attente validation DOP', icon: Clock },
        { id: 'factures-ffg-rejected', label: 'Factures Rejetées', icon: AlertCircle },
        { id: 'factures-ffg-overdue', label: 'Factures Echues', icon: Calendar },
        { id: 'factures-ffg-validated', label: 'Validée (bon à payer)', icon: CheckCircle },
        { id: 'factures-ffg-payment-order', label: 'Ordre de paiement', icon: DollarSign },
        { id: 'factures-ffg-paid', label: 'Totalement Payées', icon: DollarSign },
        { id: 'factures-ffg-partially-paid', label: 'Partiellement payées', icon: DollarSign },
      ],
    },
    {
      id: 'parameters',
      label: 'PARAMETTRES',
      icon: Settings,
      subItems: [
        { id: 'parameters-suppliers', label: 'Fournisseurs', icon: Building },
        { id: 'parameters-charges', label: 'Types de charges', icon: Tag },
        { id: 'parameters-centres', label: 'Centres de coût', icon: MapPin },
        { id: 'parameters-caisses', label: 'Caisses', icon: Building },
        { id: 'parameters-comptes', label: 'Comptes', icon: CreditCard },
      ],
    },
    {
      id: 'users',
      label: 'UTILISATEURS',
      icon: Users,
      subItems: [
        { id: 'parameters-agents', label: 'Utilisateurs', icon: UserCheck },
        { id: 'users-logs', label: 'LOGs', icon: FileText },
      ],
    },
  ];

  const toggleMenu = (id: string) => {
    setExpandedMenus(prev => {
      if (prev.includes(id)) {
        return prev.filter(menuId => menuId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleMenuClick = (id: string) => {
    onMenuChange(id);
  };

  const isSubMenuActive = (subMenuId: string) => {
    return activeMenu === subMenuId;
  };

  const isExpanded = (id: string) => {
    return expandedMenus.includes(id);
  };

  const iconTooltip = (label: string) => (
    <span className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900/95 backdrop-blur-sm text-white text-[11px] px-2.5 py-1.5 opacity-0 -translate-x-2 scale-95 blur-[1px] group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 group-hover:blur-0 transition-all duration-250 ease-out z-[220] border border-slate-500/80 shadow-2xl">
      {label}
    </span>
  );

  const handleChangePassword = async () => {
    if (!agent?.ID) {
      Swal.fire('Erreur', 'Veuillez vous reconnecter', 'error');
      return;
    }

    const { value: formValues } = await Swal.fire({
      title: 'Changer de mot de passe',
      html: `
        <div class="space-y-4 text-left">
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">Mot de passe actuel</label>
            <div class="relative">
              <input 
                type="password" 
                id="currentPassword" 
                class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent pr-10" 
                placeholder="Entrez votre mot de passe actuel"
              />
              <button 
                type="button"
                id="toggleCurrentPassword"
                class="absolute right-3 top-2.5 text-slate-600 hover:text-slate-800 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">Nouveau mot de passe</label>
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <input 
                  type="password" 
                  id="newPassword" 
                  class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent pr-10" 
                  placeholder="Entrez votre nouveau mot de passe"
                />
              </div>
              <div id="strengthIcon" class="w-6 h-6 flex items-center justify-center relative group cursor-help" title="Critères de force du mot de passe">
                <svg id="strengthSvg" class="w-5 h-5 transition-all duration-300 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path id="strengthPath" d="" class="transition-all duration-300"/>
                </svg>
                <div class="absolute right-0 mt-2 bg-slate-800 text-white text-xs rounded p-2 w-48 hidden group-hover:block z-50 whitespace-normal bottom-full mb-2">
                  <div class="space-y-1">
                    <div><span id="req-length" class="text-gray-400">○</span> 6 caractères minimum</div>
                    <div><span id="req-lower" class="text-gray-400">○</span> Une lettre minuscule</div>
                    <div><span id="req-upper" class="text-gray-400">○</span> Une lettre majuscule</div>
                    <div><span id="req-number" class="text-gray-400">○</span> Un chiffre</div>
                    <div><span id="req-special" class="text-gray-400">○</span> Un caractère spécial (!@#$%^&*)</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">Confirmer le mot de passe</label>
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <input 
                  type="password" 
                  id="confirmPassword" 
                  class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent pr-10" 
                  placeholder="Confirmez votre nouveau mot de passe"
                />
                <button 
                  type="button"
                  id="toggleConfirmPassword"
                  class="absolute right-3 top-2.5 text-slate-600 hover:text-slate-800 transition-colors"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                  </svg>
                </button>
              </div>
              <div id="matchIcon" class="w-6 h-6 flex items-center justify-center"></div>
            </div>
            <div id="matchMessage" class="text-xs mt-1 text-red-600 hidden"></div>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Mettre à jour',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#dc2626',
      didOpen: () => {
        const currentPasswordInput = document.getElementById('currentPassword') as HTMLInputElement;
        const newPasswordInput = document.getElementById('newPassword') as HTMLInputElement;
        const confirmPasswordInput = document.getElementById('confirmPassword') as HTMLInputElement;
        
        // Toggle password visibility
        const setupToggle = (toggleId: string, inputId: string) => {
          const toggleBtn = document.getElementById(toggleId);
          const input = document.getElementById(inputId) as HTMLInputElement;
          
          if (toggleBtn && input) {
            toggleBtn.addEventListener('click', (e) => {
              e.preventDefault();
              input.type = input.type === 'password' ? 'text' : 'password';
            });
          }
        };
        
        setupToggle('toggleCurrentPassword', 'currentPassword');
        setupToggle('toggleConfirmPassword', 'confirmPassword');
        
        // Password strength and match check
        const updatePasswordValidation = () => {
          if (!newPasswordInput || !confirmPasswordInput) return;
          
          const newPass = newPasswordInput.value;
          const confirmPass = confirmPasswordInput.value;
          const matchIcon = document.getElementById('matchIcon');
          const matchMessage = document.getElementById('matchMessage');
          const strengthIcon = document.getElementById('strengthIcon');
          
          // Critères de validation
          const hasLength = newPass.length >= 6;
          const hasLower = /[a-z]/.test(newPass);
          const hasUpper = /[A-Z]/.test(newPass);
          const hasNumber = /[0-9]/.test(newPass);
          const hasSpecial = /[!@#$%^&*]/.test(newPass);
          
          const criteriaCount = [hasLength, hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
          
          // Update requirement icons in tooltip
          const updateReqIcon = (id: string, met: boolean) => {
            const elem = document.getElementById(id);
            if (elem) {
              elem.textContent = met ? '✓' : '○';
              elem.className = met ? 'text-green-400 font-bold' : 'text-gray-400';
            }
          };
          
          updateReqIcon('req-length', hasLength);
          updateReqIcon('req-lower', hasLower);
          updateReqIcon('req-upper', hasUpper);
          updateReqIcon('req-number', hasNumber);
          updateReqIcon('req-special', hasSpecial);
          
          // Update animated icon
          if (strengthIcon) {
            const colors = ['text-gray-400', 'text-orange-400', 'text-yellow-400', 'text-blue-400', 'text-green-500'];
            const svg = document.getElementById('strengthSvg') as SVGElement | null;
            
            // Si tous les critères sont satisfaits, afficher un checkmark vert
            if (criteriaCount === 5 && svg) {
              svg.innerHTML = '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" fill="currentColor"/>';
              svg.setAttribute('viewBox', '0 0 20 20');
              svg.setAttribute('class', 'w-6 h-6 text-green-500 animate-bounce transition-all duration-300');
            } else if (svg) {
              svg.innerHTML = '<circle cx="12" cy="12" r="10"/><path id="strengthPath" d="" class="transition-all duration-300"/>';
              svg.setAttribute('class', `w-5 h-5 transition-all duration-300 ${colors[criteriaCount]}`);
              svg.setAttribute('viewBox', '0 0 24 24');
              
              const newPath = svg.querySelector('#strengthPath') as SVGElement | null;
              
              // Update path based on criteria count
              const paths = [
                '', // 0: empty circle
                'M 12 8 A 4 4 0 0 1 16 12', // 1: quarter
                'M 12 8 A 4 4 0 0 1 16 12 A 4 4 0 0 1 12 16', // 2: half
                'M 12 8 A 4 4 0 0 1 16 12 A 4 4 0 0 1 12 16 A 4 4 0 0 1 8 12', // 3: three quarters
                'M 9 12.5 L 11 15 L 15 9' // 4: checkmark
              ];
              
              if (newPath) {
                newPath.setAttribute('d', paths[criteriaCount] || paths[0]);
                newPath.setAttribute('class', 'transition-all duration-300 stroke-current stroke-2 fill-none');
              }
            }
          }
          
          // Check match
          if (confirmPass.length > 0) {
            if (newPass === confirmPass && newPass.length > 0) {
              if (matchIcon) {
                matchIcon.innerHTML = '<svg class="w-6 h-6 text-green-500 animate-bounce" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>';
                matchIcon.classList.remove('hidden');
              }
              if (matchMessage) matchMessage.classList.add('hidden');
            } else {
              if (matchIcon) {
                matchIcon.innerHTML = '<svg class="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>';
                matchIcon.classList.remove('hidden');
              }
              if (matchMessage) {
                matchMessage.classList.remove('hidden');
                matchMessage.textContent = 'Les mots de passe ne correspondent pas';
              }
            }
          } else {
            if (matchIcon) matchIcon.innerHTML = '';
            if (matchMessage) matchMessage.classList.add('hidden');
          }
        };
        
        newPasswordInput?.addEventListener('input', updatePasswordValidation);
        confirmPasswordInput?.addEventListener('input', updatePasswordValidation);
        
        if (currentPasswordInput) {
          currentPasswordInput.focus();
        }
      },
      preConfirm: () => {
        const currentPassword = (document.getElementById('currentPassword') as HTMLInputElement)?.value;
        const newPassword = (document.getElementById('newPassword') as HTMLInputElement)?.value;
        const confirmPassword = (document.getElementById('confirmPassword') as HTMLInputElement)?.value;

        if (!currentPassword || !newPassword || !confirmPassword) {
          Swal.showValidationMessage('Tous les champs sont obligatoires');
          return false;
        }

        if (newPassword !== confirmPassword) {
          Swal.showValidationMessage('Les nouveaux mots de passe ne correspondent pas');
          return false;
        }

        // Critères stricts
        const hasLength = newPassword.length >= 6;
        const hasLower = /[a-z]/.test(newPassword);
        const hasUpper = /[A-Z]/.test(newPassword);
        const hasNumber = /[0-9]/.test(newPassword);
        const hasSpecial = /[!@#$%^&*]/.test(newPassword);

        if (!hasLength) {
          Swal.showValidationMessage('Le mot de passe doit contenir au moins 6 caractères');
          return false;
        }
        if (!hasLower) {
          Swal.showValidationMessage('Le mot de passe doit contenir au moins une lettre minuscule');
          return false;
        }
        if (!hasUpper) {
          Swal.showValidationMessage('Le mot de passe doit contenir au moins une lettre majuscule');
          return false;
        }
        if (!hasNumber) {
          Swal.showValidationMessage('Le mot de passe doit contenir au moins un chiffre');
          return false;
        }
        if (!hasSpecial) {
          Swal.showValidationMessage('Le mot de passe doit contenir au moins un caractère spécial (!@#$%^&*)');
          return false;
        }

        return { currentPassword, newPassword };
      }
    });

    if (formValues) {
      try {
        // Afficher un loader
        Swal.fire({
          title: 'Mise à jour en cours...',
          html: 'Veuillez patienter',
          icon: undefined,
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        // Récupérer l'agent actuel
        const { data: agentData, error: fetchError } = await supabase
          .from('AGENTS')
          .select('*')
          .eq('ID', agent.ID)
          .single();

        if (fetchError || !agentData) {
          Swal.fire('Erreur', 'Impossible de récupérer vos informations', 'error');
          console.error('Erreur Supabase:', fetchError);
          return;
        }

        // Vérifier le mot de passe actuel
        const password = (agentData as any)['mot de passe'];
        const isPasswordValid = await bcryptjs.compare(formValues.currentPassword, password);

        if (!isPasswordValid) {
          Swal.fire('Erreur', 'Le mot de passe actuel est incorrect', 'error');
          return;
        }

        // Hasher le nouveau mot de passe
        const hashedPassword = await bcryptjs.hash(formValues.newPassword, 10);

        // Mettre à jour le mot de passe avec la notation bracket pour la clé avec espaces
        const updateData: Record<string, string> = {};
        updateData['mot de passe'] = hashedPassword;
        
        const { error: updateError } = await supabase
          .from('AGENTS')
          .update(updateData)
          .eq('ID', agent.ID);

        if (updateError) {
          Swal.fire('Erreur', 'Impossible de mettre à jour votre mot de passe', 'error');
          console.error('Erreur Supabase:', updateError);
          return;
        }

        Swal.fire('Succès', 'Votre mot de passe a été mis à jour avec succès', 'success');
        setShowUserMenu(false);
      } catch (error) {
        console.error('Erreur:', error);
        Swal.fire('Erreur', 'Une erreur est survenue', 'error');
      }
    }
  };

  return (
    <div
      className={`${isCollapsed ? 'w-20' : 'w-64'} relative overflow-visible bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 min-h-screen text-white flex flex-col transition-all duration-300`}
      style={{ fontFamily: '"Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", sans-serif' }}
    >
      {/* Header */}
      <div className={`${isCollapsed ? 'px-3 py-4' : 'px-6 py-5'} border-b border-slate-700/50`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-2 shadow-lg">
            <LayoutDashboard size={20} className="text-white" />
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="text-lg font-bold tracking-tight">PMD</h1>
              <p className="text-xs text-slate-400 font-medium">Dashboard</p>
            </div>
          )}
        </div>
      </div>

      {/* Toggle sur la séparation droite (position demandée) */}
      <button
        onClick={onToggleCollapse}
        className="absolute top-20 -right-3 h-10 w-7 rounded-r-md bg-slate-800 border border-slate-500 border-l-0 text-slate-200 hover:text-white hover:bg-slate-700 transition z-[200] shadow-2xl ring-1 ring-black/30 flex items-center justify-center"
        title={isCollapsed ? 'Afficher le menu' : 'Réduire le menu'}
      >
        {isCollapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isItemExpanded = isExpanded(item.id);

          // Mapping des couleurs sombres et fines pour chaque menu
          const menuColorMap: { [key: string]: { bar: string; accent: string; activeBg: string } } = {
            'dashboard-factures': { bar: 'bg-blue-600', accent: 'text-blue-400', activeBg: 'bg-blue-700' },
            'dashboard-ffg': { bar: 'bg-cyan-600', accent: 'text-cyan-400', activeBg: 'bg-cyan-700' },
            'search': { bar: 'bg-purple-600', accent: 'text-purple-400', activeBg: 'bg-purple-700' },
            'factures': { bar: 'bg-red-600', accent: 'text-red-400', activeBg: 'bg-red-700' },
            'factures-ffg': { bar: 'bg-fuchsia-600', accent: 'text-fuchsia-400', activeBg: 'bg-fuchsia-700' },
            'parameters': { bar: 'bg-amber-600', accent: 'text-amber-400', activeBg: 'bg-amber-700' },
            'users': { bar: 'bg-emerald-600', accent: 'text-emerald-400', activeBg: 'bg-emerald-700' }
          };

          const menuColor = menuColorMap[item.id] || { bar: 'bg-slate-600', accent: 'text-slate-400', activeBg: 'bg-slate-700' };

          // Vérifier les permissions pour chaque menu principal
          const itemPermissionMap: { [key: string]: string } = {
            'dashboard-factures': 'dashboard',
            'dashboard-ffg': 'dashboard_ffg',
            'search': 'recherche',
            'factures': 'factures',
            'factures-ffg': 'factures_ffg',
            'parameters': 'paramettre',
            'users': 'utilisateurs'
          };

          const requiredPermission = itemPermissionMap[item.id];
          if (requiredPermission && !canView(requiredPermission)) {
            return null; // Masquer cet élément si pas de permission
          }

          if (item.subItems) {
            return (
              <>
                {item.id === 'users' && (
                  <div className="my-4 border-t border-slate-600/20"></div>
                )}
                <div key={item.id} className="mb-2 group/menu relative">
                  <button
                    onClick={() => {
                      toggleMenu(item.id);
                    }}
                    className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${isCollapsed ? 'px-2' : 'px-4'} py-3 rounded-lg text-sm font-semibold transition-all duration-300 ease-out relative hover:scale-[1.08] active:scale-[0.98] text-slate-300 hover:text-white`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${menuColor.bar} transition-all duration-300 ease-out`}></div>
                    <Icon size={19} className={`flex-shrink-0 transition-colors duration-300 ease-out ${
                      isItemExpanded ? menuColor.accent : 'group-hover:' + menuColor.accent
                    }`} />
                    {isCollapsed && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-[1.5px] w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.75)] transition-all duration-300 ease-out group-hover:w-6"></span>
                    )}
                    {isCollapsed && iconTooltip(item.label)}
                    {!isCollapsed && (
                      <span className="flex-1 text-left relative">
                        {item.label}
                        <span className="absolute -bottom-1 left-0 h-[1.5px] w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.75)] transition-all duration-300 ease-out group-hover:w-full"></span>
                      </span>
                    )}
                    {!isCollapsed && (
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-300 ease-out flex-shrink-0 ${
                          isItemExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </button>

                  {isItemExpanded && (
                    <div className={`${isCollapsed ? 'mt-1 space-y-1' : 'ml-2 mt-2 space-y-1'} animate-in slide-in-from-top-1 duration-300`}>
                      {item.subItems.map((subItem) => {
                        const SubIcon = subItem.icon;
                        
                        // Mapper les sous-menus aux permissions
                        const subItemPermissionMap: { [key: string]: string } = {
                          'factures-new': 'factures',
                          'factures-pending': 'factures_pending_dr',
                          'factures-pending-dop': 'factures_pending_dop',
                          'factures-pending-dq': 'factures_pending_dq',
                          'factures-rejected': 'factures_rejected',
                          'factures-overdue': 'factures_overdue',
                          'factures-validated': 'factures_validated',
                          'factures-payment-order': 'factures_payment_order',
                          'factures-paid': 'factures_paid',
                          'factures-partially-paid': 'factures_partially_paid',
                          'factures-ffg-new': 'factures_ffg',
                          'factures-ffg-pending': 'factures_ffg_pending_dr',
                          'factures-ffg-pending-dop': 'factures_ffg_pending_dop',
                          'factures-ffg-rejected': 'factures_ffg_rejected',
                          'factures-ffg-overdue': 'factures_ffg_overdue',
                          'factures-ffg-validated': 'factures_ffg_validated',
                          'factures-ffg-payment-order': 'factures_ffg_payment_order',
                          'factures-ffg-paid': 'factures_ffg_paid',
                          'factures-ffg-partially-paid': 'factures_ffg_partially_paid',
                          'parameters-suppliers': 'fournisseurs',
                          'parameters-charges': 'charges',
                          'parameters-centres': 'centres',
                          'parameters-caisses': 'caisses',
                          'parameters-comptes': 'comptes',
                          'users-logs': 'logs',
                        };

                        const requiredSubPermission = subItemPermissionMap[subItem.id];
                        
                        // Pour les onglets de factures, utiliser canViewInvoiceTab au lieu de canView
                        if ((item.id === 'factures' || item.id === 'factures-ffg') && (subItem.id === 'factures-pending' || subItem.id === 'factures-pending-dop' || subItem.id === 'factures-pending-dq' || subItem.id === 'factures-ffg-pending' || subItem.id === 'factures-ffg-pending-dop')) {
                          if (!canViewInvoiceTab(subItem.id)) {
                            return null; // Masquer cet onglet si pas de permission pour la région
                          }
                        } else if (requiredSubPermission && !canView(requiredSubPermission)) {
                          return null; // Masquer ce sous-élément si pas de permission
                        }
                        
                        return (
                          <button
                            key={subItem.id}
                            onClick={() => handleMenuClick(subItem.id)}
                            className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2.5 rounded-lg text-xs transition-all duration-300 ease-out group relative hover:scale-[1.06] active:scale-[0.98] ${
                              isSubMenuActive(subItem.id)
                                ? `${menuColor.activeBg} text-white font-semibold`
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <div className={`absolute left-0 top-0 bottom-0 ${isCollapsed ? 'w-0.5' : 'w-px'} ${menuColor.bar} transition-all duration-300 ease-out`}></div>
                            <SubIcon size={15} className={`flex-shrink-0 transition-colors duration-300 ease-out ${
                              isSubMenuActive(subItem.id) ? menuColor.accent : 'group-hover:' + menuColor.accent
                            }`} />
                            {isCollapsed && (
                              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-px w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] transition-all duration-300 ease-out group-hover:w-5"></span>
                            )}
                            {isCollapsed && iconTooltip(subItem.label)}
                            {!isCollapsed && (
                              <span className="flex-1 text-left relative">
                                {subItem.label}
                                <span className="absolute -bottom-1 left-0 h-px w-0 bg-gradient-to-r from-red-300 via-red-400 to-rose-400 shadow-[0_0_8px_rgba(239,68,68,0.65)] transition-all duration-300 ease-out group-hover:w-full"></span>
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => handleMenuClick(item.id)}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} ${isCollapsed ? 'px-2' : 'px-4'} py-3 rounded-lg text-sm font-semibold transition-all duration-300 ease-out group relative hover:scale-[1.08] active:scale-[0.98] ${
                isSubMenuActive(item.id)
                  ? `${menuColor.activeBg} text-white`
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${menuColor.bar} transition-all duration-300 ease-out`}></div>
              <Icon size={19} className={`flex-shrink-0 transition-colors duration-300 ease-out ${
                isSubMenuActive(item.id) ? menuColor.accent : 'group-hover:' + menuColor.accent
              }`} />
              {isCollapsed && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-[1.5px] w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.75)] transition-all duration-300 ease-out group-hover:w-6"></span>
              )}
              {isCollapsed && iconTooltip(item.label)}
              {!isCollapsed && (
                <span className="relative">
                  {item.label}
                  <span className="absolute -bottom-1 left-0 h-[1.5px] w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.75)] transition-all duration-300 ease-out group-hover:w-full"></span>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="border-t border-slate-700/50 bg-slate-800/50 relative overflow-visible">
        {agent ? (
          <div className={`${isCollapsed ? 'p-2 space-y-2' : 'p-4 space-y-3'}`}>
            {/* User Info - Clickable */}
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} hover:bg-slate-700/40 rounded-lg ${isCollapsed ? 'p-2' : 'p-2.5'} transition-all duration-300 ease-out group`}
            >
              <div className="w-11 h-11 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-lg group-hover:shadow-xl transition-shadow duration-300">
                {(agent.Nom?.[0] || agent.email?.[0] || '?').toUpperCase()}
              </div>
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-white truncate">
                      {agent.Nom || 'Utilisateur'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{agent.Role || 'Agent'}</p>
                    {agent.REGION && (
                      <p className="text-xs text-slate-500 truncate">{agent.REGION}</p>
                    )}
                  </div>
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-300 ease-out flex-shrink-0 text-slate-400 ${
                      showUserMenu ? 'rotate-180' : ''
                    }`}
                  />
                </>
              )}
            </button>

            {/* User Menu Items */}
            {showUserMenu && (
              <div className={`${isCollapsed ? 'bg-slate-700/30' : 'bg-slate-700/20'} space-y-1 rounded-lg p-2 animate-in fade-in-0 slide-in-from-top-1 duration-300 overflow-visible`}>
                <button
                  onClick={() => {
                    handleChangePassword();
                    setShowUserMenu(false);
                  }}
                  className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg text-xs font-semibold transition-all duration-300 ease-out text-slate-300 hover:bg-slate-700/50 hover:text-white hover:scale-[1.06] hover:-translate-y-0.5 active:scale-[0.98] group relative`}
                >
                  <Lock size={15} className="flex-shrink-0" />
                  {isCollapsed && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-px w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] transition-all duration-300 ease-out group-hover:w-5"></span>
                  )}
                  {isCollapsed && iconTooltip('Changer de mot de passe')}
                  {!isCollapsed && (
                    <span className="relative">
                      Changer de mot de passe
                      <span className="absolute -bottom-1 left-0 h-px w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] transition-all duration-300 ease-out group-hover:w-full"></span>
                    </span>
                  )}
                </button>

                {canManageOwnSignature() && (
                  <button
                    onClick={() => {
                      onMenuChange('profile-signature');
                      setShowUserMenu(false);
                    }}
                    className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg text-xs font-semibold transition-all duration-300 ease-out text-slate-300 hover:bg-slate-700/50 hover:text-white hover:scale-[1.06] hover:-translate-y-0.5 active:scale-[0.98] group relative`}
                  >
                    <FileSignature size={15} className="flex-shrink-0" />
                    {isCollapsed && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-px w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] transition-all duration-300 ease-out group-hover:w-5"></span>
                    )}
                    {isCollapsed && iconTooltip('Ma signature')}
                    {!isCollapsed && (
                      <span className="relative">
                        Ma signature
                        <span className="absolute -bottom-1 left-0 h-px w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] transition-all duration-300 ease-out group-hover:w-full"></span>
                      </span>
                    )}
                  </button>
                )}

                <div className="my-1.5 border-t border-slate-600/30"></div>

                <button
                  onClick={() => {
                    setIsLoggingOut(true);
                    setShowUserMenu(false);
                    signOut();
                  }}
                  disabled={isLoggingOut}
                  className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg text-xs font-semibold transition-all duration-300 ease-out text-red-400 hover:bg-red-500/25 hover:text-red-300 hover:scale-[1.06] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group relative`}
                >
                  <LogOut size={15} className="flex-shrink-0" />
                  {isCollapsed && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-px w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] transition-all duration-300 ease-out group-hover:w-5"></span>
                  )}
                  {isCollapsed && iconTooltip(isLoggingOut ? 'Déconnexion...' : 'Déconnexion')}
                  {!isCollapsed && (
                    <span className="relative">
                      {isLoggingOut ? 'Déconnexion...' : 'Déconnexion'}
                      <span className="absolute -bottom-1 left-0 h-px w-0 bg-gradient-to-r from-red-400 via-red-500 to-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] transition-all duration-300 ease-out group-hover:w-full"></span>
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 text-center text-slate-400 text-xs font-medium">
            Authentification requise
          </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;

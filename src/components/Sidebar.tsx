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
  Lock
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
}

function Sidebar({ activeMenu, onMenuChange }: SidebarProps) {
  const { agent, signOut } = useAuth();
  const { canView, canViewInvoiceTab } = usePermission();
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
        { id: 'factures-rejected', label: 'Rejetée', icon: AlertCircle },
        { id: 'factures-overdue', label: 'Facture Echues', icon: Calendar },
        { id: 'factures-validated', label: 'Validée (bon à payer)', icon: CheckCircle },
        { id: 'factures-payment-order', label: 'Ordre de paiement', icon: DollarSign },
        { id: 'factures-paid', label: 'Payé', icon: DollarSign },
        { id: 'factures-partially-paid', label: 'Partiellement payé', icon: DollarSign },
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
    <div className="w-64 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 min-h-screen text-white flex flex-col" style={{ fontFamily: '"Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", sans-serif' }}>
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-2 shadow-lg">
            <LayoutDashboard size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">PMD</h1>
            <p className="text-xs text-slate-400 font-medium">Dashboard</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isItemExpanded = isExpanded(item.id);

          // Mapping des couleurs sombres et fines pour chaque menu
          const menuColorMap: { [key: string]: { bar: string; accent: string; activeBg: string } } = {
            'dashboard-factures': { bar: 'bg-blue-600', accent: 'text-blue-400', activeBg: 'bg-blue-700' },
            'search': { bar: 'bg-purple-600', accent: 'text-purple-400', activeBg: 'bg-purple-700' },
            'factures': { bar: 'bg-red-600', accent: 'text-red-400', activeBg: 'bg-red-700' },
            'parameters': { bar: 'bg-amber-600', accent: 'text-amber-400', activeBg: 'bg-amber-700' },
            'users': { bar: 'bg-emerald-600', accent: 'text-emerald-400', activeBg: 'bg-emerald-700' }
          };

          const menuColor = menuColorMap[item.id] || { bar: 'bg-slate-600', accent: 'text-slate-400', activeBg: 'bg-slate-700' };

          // Vérifier les permissions pour chaque menu principal
          const itemPermissionMap: { [key: string]: string } = {
            'dashboard-factures': 'dashboard',
            'search': 'recherche',
            'factures': 'factures',
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
                <div key={item.id} className="mb-2 group/menu">
                  <button
                    onClick={() => {
                      toggleMenu(item.id);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-300 ease-out relative hover:scale-105 text-slate-300 hover:text-white`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${menuColor.bar} transition-all duration-300 ease-out`}></div>
                    <Icon size={19} className={`flex-shrink-0 transition-colors duration-300 ease-out ${
                      isItemExpanded ? menuColor.accent : 'group-hover:' + menuColor.accent
                    }`} />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-300 ease-out flex-shrink-0 ${
                        isItemExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isItemExpanded && (
                    <div className="ml-2 mt-2 space-y-1 animate-in slide-in-from-top-1 duration-300">
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
                          'parameters-suppliers': 'fournisseurs',
                          'parameters-charges': 'charges',
                          'parameters-centres': 'centres',
                          'parameters-caisses': 'caisses',
                          'parameters-comptes': 'comptes',
                        };

                        const requiredSubPermission = subItemPermissionMap[subItem.id];
                        
                        // Pour les onglets de factures, utiliser canViewInvoiceTab au lieu de canView
                        if (item.id === 'factures' && (subItem.id === 'factures-pending' || subItem.id === 'factures-pending-dop' || subItem.id === 'factures-pending-dq')) {
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
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs transition-all duration-300 ease-out group relative hover:scale-105 ${
                              isSubMenuActive(subItem.id)
                                ? `${menuColor.activeBg} text-white font-semibold`
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${menuColor.bar} transition-all duration-300 ease-out`}></div>
                            <SubIcon size={15} className={`flex-shrink-0 transition-colors duration-300 ease-out ${
                              isSubMenuActive(subItem.id) ? menuColor.accent : 'group-hover:' + menuColor.accent
                            }`} />
                            <span className={`flex-1 text-left`}>{subItem.label}</span>
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
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-300 ease-out group relative hover:scale-105 ${
                isSubMenuActive(item.id)
                  ? `${menuColor.activeBg} text-white`
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${menuColor.bar} transition-all duration-300 ease-out`}></div>
              <Icon size={19} className={`flex-shrink-0 transition-colors duration-300 ease-out ${
                isSubMenuActive(item.id) ? menuColor.accent : 'group-hover:' + menuColor.accent
              }`} />
              <span className="">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="border-t border-slate-700/50 bg-slate-800/50">
        {agent ? (
          <div className="p-4 space-y-3">
            {/* User Info - Clickable */}
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 hover:bg-slate-700/40 rounded-lg p-2.5 transition-all duration-300 ease-out group"
            >
              <div className="w-11 h-11 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-lg group-hover:shadow-xl transition-shadow duration-300">
                {(agent.Nom?.[0] || agent.email?.[0] || '?').toUpperCase()}
              </div>
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
            </button>

            {/* User Menu Items */}
            {showUserMenu && (
              <div className="space-y-1 animate-in slide-in-from-top-1 duration-300 bg-slate-700/20 rounded-lg p-2">
                <button
                  onClick={() => {
                    handleChangePassword();
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-300 ease-out text-slate-300 hover:bg-slate-700/50 hover:text-white"
                >
                  <Lock size={15} className="flex-shrink-0" />
                  <span>Changer de mot de passe</span>
                </button>

                <div className="my-1.5 border-t border-slate-600/30"></div>

                <button
                  onClick={() => {
                    setIsLoggingOut(true);
                    setShowUserMenu(false);
                    signOut();
                  }}
                  disabled={isLoggingOut}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-300 ease-out text-red-400 hover:bg-red-500/25 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LogOut size={15} className="flex-shrink-0" />
                  <span>{isLoggingOut ? 'Déconnexion...' : 'Déconnexion'}</span>
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

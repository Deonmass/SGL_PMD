# SGL PMD - Documentation UI Complète

## Vue d'ensemble de l'architecture

SGL PMD est une application de gestion de factures et de paiements construite avec React + TypeScript et TailwindCSS. L'architecture est modulaire avec une séparation claire entre les composants, les pages, les services et les utilitaires.

---

## 1. Palette de couleurs et thème

### Couleurs principales
```css
/* Indigo (Couleur principale) */
--primary-50: #eef2ff
--primary-100: #e0e7ff
--primary-500: #6366f1
--primary-600: #4f46e5
--primary-700: #4338ca

/* Gris (Texte et fonds) */
--gray-50: #f9fafb
--gray-100: #f3f4f6
--gray-200: #e5e7eb
--gray-300: #d1d5db
--gray-400: #9ca3af
--gray-500: #6b7280
--gray-600: #4b5563
--gray-700: #374151
--gray-800: #1f2937
--gray-900: #111827

/* Couleurs de statut */
--success: #10b981
--warning: #f59e0b
--danger: #ef4444
--info: #3b82f6
```

### Thème sombre (optionnel)
```css
.dark {
  --bg-primary: #1f2937;
  --bg-secondary: #111827;
  --text-primary: #f9fafb;
  --text-secondary: #d1d5db;
}
```

---

## 2. Typographie

### Hiérarchie typographique
```css
/* Titres */
.text-4xl { font-size: 2.25rem; font-weight: 700; } /* H1 */
.text-3xl { font-size: 1.875rem; font-weight: 600; } /* H2 */
.text-2xl { font-size: 1.5rem; font-weight: 600; } /* H3 */
.text-xl { font-size: 1.25rem; font-weight: 500; } /* H4 */

/* Texte */
.text-base { font-size: 1rem; font-weight: 400; }
.text-sm { font-size: 0.875rem; font-weight: 400; }
.text-xs { font-size: 0.75rem; font-weight: 400; }

/* Familles de polices */
font-sans: 'Inter', system-ui, sans-serif
font-mono: 'JetBrains Mono', monospace
```

---

## 3. Espacement et layout

### Système de grille
```css
/* Conteneur principal */
.max-w-6xl { max-width: 72rem; } /* 1152px */
.max-w-7xl { max-width: 80rem; } /* 1280px */

/* Espacement standard */
.p-1 { padding: 0.25rem; }
.p-2 { padding: 0.5rem; }
.p-3 { padding: 0.75rem; }
.p-4 { padding: 1rem; }
.p-6 { padding: 1.5rem; }
.p-8 { padding: 2rem; }

.m-1 { margin: 0.25rem; }
.m-2 { margin: 0.5rem; }
.m-3 { margin: 0.75rem; }
.m-4 { margin: 1rem; }
.m-6 { margin: 1.5rem; }
.m-8 { margin: 2rem; }
```

### Layout responsive
```css
/* Mobile First */
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }

/* Responsive */
.md\:grid-cols-2 { @media (min-width: 768px) { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.lg\:grid-cols-3 { @media (min-width: 1024px) { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.xl\:grid-cols-4 { @media (min-width: 1280px) { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
```

---

## 4. Composants UI principaux

### 4.1 Header
```tsx
interface HeaderProps {}

// Structure
<header className="bg-white shadow">
  <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
    {/* Logo et titre */}
    <div className="flex items-center gap-3">
      <CheckSquare size={32} className="text-indigo-600" />
      <div>
        <h1 className="text-2xl font-bold text-gray-800">SGL PMD</h1>
        <p className="text-sm text-gray-600">Gestionnaire de Projet</p>
      </div>
    </div>
    {/* Version */}
    <div className="text-sm text-gray-600">
      <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
        v0.1.0
      </span>
    </div>
  </div>
</header>
```

### 4.2 Sidebar
```tsx
interface SidebarProps {
  activeMenu: string;
  onMenuChange: (menu: string) => void;
}

// Structure
<aside className="w-64 bg-gray-50 h-screen overflow-y-auto">
  {/* Menu principal */}
  <nav className="p-4 space-y-2">
    {/* Items avec icônes et sous-menus */}
  </nav>
  
  {/* Menu utilisateur */}
  <div className="absolute bottom-0 w-full p-4 border-t">
    {/* Profil utilisateur */}
  </div>
</aside>
```

### 4.3 StatCard
```tsx
interface StatCardProps {
  label: string;
  value: number;
  currency: string;
  bgColor: string;
  textColor: string;
  rubrique?: string;
  montant?: number;
  nombreFactures?: number;
  solde?: number;
  fournisseur?: string;
  subtitle?: string;
  montantPaye?: number;
  montantReste?: number;
  labelMontantPaye?: string;
  labelMontantReste?: string;
  onDetailClick?: () => void;
  icon?: 'calculator' | 'x-circle' | 'alert' | 'trending' | 'none';
  variant?: 'default' | 'compact';
  onHover?: boolean;
}

// Variants
const variants = {
  default: "bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow",
  compact: "bg-white rounded-md shadow p-4 hover:shadow-md transition-shadow"
};
```

### 4.4 InvoiceTable
```tsx
interface InvoiceTableProps {
  invoices: Invoice[];
  agent?: any;
  onView?: (invoice: Invoice) => void;
  onEdit?: (invoice: Invoice) => void;
  onPayment?: (invoice: Invoice) => void;
  onDelete?: (invoice: Invoice) => void;
}

// Structure
<div className="bg-white rounded-lg shadow overflow-hidden">
  {/* Header avec filtres */}
  <div className="p-4 border-b">
    {/* Filtres et recherche */}
  </div>
  
  {/* Tableau */}
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      {/* En-tête */}
      <thead className="bg-gray-50">
        {/* Colonnes */}
      </thead>
      {/* Corps */}
      <tbody className="bg-white divide-y divide-gray-200">
        {/* Lignes */}
      </tbody>
    </table>
  </div>
  
  {/* Pagination */}
  <div className="p-4 border-t">
    {/* Pagination */}
  </div>
</div>
```

### 4.5 Modal (Base)
```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

// Structure
<div className="fixed inset-0 z-50 overflow-y-auto">
  <div className="flex items-center justify-center min-h-screen px-4">
    {/* Overlay */}
    <div className="fixed inset-0 bg-black opacity-50" onClick={onClose} />
    
    {/* Modal */}
    <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>
      
      {/* Body */}
      <div className="p-4">
        {children}
      </div>
      
      {/* Footer */}
      <div className="flex justify-end gap-2 p-4 border-t">
        {/* Actions */}
      </div>
    </div>
  </div>
</div>
```

---

## 5. Formulaires

### 5.1 Structure de formulaire
```tsx
// Container principal
<div className="bg-white rounded-lg shadow-md p-6">
  {/* Header */}
  <div className="mb-6">
    <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
    <p className="text-sm text-gray-600 mt-1">{description}</p>
  </div>
  
  {/* Formulaire */}
  <form className="space-y-6">
    {/* Sections */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Champs */}
    </div>
    
    {/* Actions */}
    <div className="flex justify-end gap-3 pt-6 border-t">
      <button type="button" className="btn-secondary">
        Annuler
      </button>
      <button type="submit" className="btn-primary">
        Enregistrer
      </button>
    </div>
  </form>
</div>
```

### 5.2 Champs de formulaire
```tsx
// Input text
<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700">
    {label}
  </label>
  <input
    type="text"
    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
    placeholder={placeholder}
    {...props}
  />
  {error && <p className="text-sm text-red-600">{error}</p>}
</div>

// Select
<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700">
    {label}
  </label>
  <select
    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
    {...props}
  >
    <option value="">{placeholder}</option>
    {options.map(option => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
</div>

// Textarea
<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700">
    {label}
  </label>
  <textarea
    rows={4}
    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
    placeholder={placeholder}
    {...props}
  />
</div>
```

---

## 6. Boutons

### 6.1 Types de boutons
```tsx
// Primaire
<button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
  {children}
</button>

// Secondaire
<button className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
  {children}
</button>

// Danger
<button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
  {children}
</button>

// Success
<button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
  {children}
</button>

// Outline
<button className="inline-flex items-center px-4 py-2 border border-indigo-600 text-sm font-medium rounded-md text-indigo-600 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
  {children}
</button>
```

### 6.2 Tailles
```tsx
// Small
<button className="px-3 py-1.5 text-xs font-medium rounded">
  {children}
</button>

// Medium (default)
<button className="px-4 py-2 text-sm font-medium rounded-md">
  {children}
</button>

// Large
<button className="px-6 py-3 text-base font-medium rounded-lg">
  {children}
</button>
```

---

## 7. Badges et indicateurs

### 7.1 Badges de statut
```tsx
// Success
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
  {text}
</span>

// Warning
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
  {text}
</span>

// Danger
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
  {text}
</span>

// Info
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
  {text}
</span>

// Gray
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
  {text}
</span>
```

### 7.2 Indicateurs de progression
```tsx
// Barre de progression
<div className="w-full bg-gray-200 rounded-full h-2">
  <div 
    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
    style={{ width: `${percentage}%` }}
  />
</div>

// Progression circulaire
<div className="relative inline-flex items-center justify-center">
  <svg className="w-16 h-16">
    <circle
      cx="32"
      cy="32"
      r="28"
      stroke="currentColor"
      strokeWidth="4"
      fill="none"
      className="text-gray-200"
    />
    <circle
      cx="32"
      cy="32"
      r="28"
      stroke="currentColor"
      strokeWidth="4"
      fill="none"
      strokeDasharray={`${2 * Math.PI * 28}`}
      strokeDashoffset={`${2 * Math.PI * 28 * (1 - percentage / 100)}`}
      className="text-indigo-600 transform -rotate-90 origin-center"
    />
  </svg>
  <span className="absolute text-sm font-medium">{percentage}%</span>
</div>
```

---

## 8. Tables

### 8.1 Structure de table
```tsx
<div className="bg-white shadow overflow-hidden sm:rounded-lg">
  <div className="px-4 py-5 sm:px-6">
    <h3 className="text-lg leading-6 font-medium text-gray-900">{title}</h3>
    <p className="mt-1 max-w-2xl text-sm text-gray-500">{description}</p>
  </div>
  <div className="border-t border-gray-200">
    <dl>
      {/* Lignes */}
      <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
        <dt className="text-sm font-medium text-gray-500">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{value}</dd>
      </div>
    </dl>
  </div>
</div>
```

### 8.2 Tableau de données
```tsx
<div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
  <table className="min-w-full divide-y divide-gray-300">
    <thead className="bg-gray-50">
      <tr>
        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          {header}
        </th>
      </tr>
    </thead>
    <tbody className="bg-white divide-y divide-gray-200">
      {data.map((item) => (
        <tr key={item.id}>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
            {cell}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

---

## 9. Cards

### 9.1 Card simple
```tsx
<div className="bg-white overflow-hidden shadow rounded-lg">
  <div className="px-4 py-5 sm:p-6">
    <div className="flex items-center">
      <div className="flex-shrink-0">
        {icon}
      </div>
      <div className="ml-5 w-0 flex-1">
        <dl>
          <dt className="text-sm font-medium text-gray-500 truncate">{label}</dt>
          <dd className="text-lg font-medium text-gray-900">{value}</dd>
        </dl>
      </div>
    </div>
  </div>
  <div className="bg-gray-50 px-4 py-4 sm:px-6">
    <div className="text-sm">
      {footer}
    </div>
  </div>
</div>
```

### 9.2 Card avec actions
```tsx
<div className="bg-white shadow rounded-lg">
  <div className="px-4 py-5 sm:p-6">
    <div className="flex items-start justify-between">
      <div>
        <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <div className="flex-shrink-0">
        {actions}
      </div>
    </div>
  </div>
</div>
```

---

## 10. Navigation

### 10.1 Menu latéral
```tsx
<nav className="space-y-1">
  {menuItems.map((item) => (
    <button
      key={item.id}
      onClick={() => onMenuChange(item.id)}
      className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full ${
        isActive
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
      {item.label}
    </button>
  ))}
</nav>
```

### 10.2 Tabs
```tsx
<div className="border-b border-gray-200">
  <nav className="-mb-px flex space-x-8">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
          isActive
            ? 'border-indigo-500 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </nav>
</div>
```

---

## 11. Patterns d'interaction

### 11.1 Loading states
```tsx
// Spinner
<div className="flex justify-center items-center py-8">
  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
</div>

// Skeleton
<div className="animate-pulse">
  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
</div>
```

### 11.2 Empty states
```tsx
<div className="text-center py-12">
  <div className="mx-auto h-12 w-12 text-gray-400">
    {emptyIcon}
  </div>
  <h3 className="mt-2 text-sm font-medium text-gray-900">{title}</h3>
  <p className="mt-1 text-sm text-gray-500">{description}</p>
  <div className="mt-6">
    {actionButton}
  </div>
</div>
```

### 11.3 Error states
```tsx
<div className="bg-red-50 border border-red-200 rounded-md p-4">
  <div className="flex">
    <div className="flex-shrink-0">
      <XCircle className="h-5 w-5 text-red-400" />
    </div>
    <div className="ml-3">
      <h3 className="text-sm font-medium text-red-800">{title}</h3>
      <div className="mt-2 text-sm text-red-700">
        {description}
      </div>
    </div>
  </div>
</div>
```

---

## 12. Utilitaires et helpers

### 12.1 Formatters
```tsx
// Currency
export const formatCurrency = (amount: number, currency: string = 'CDF'): string => {
  return new Intl.NumberFormat('fr-CD', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Date
export const formatDate = (date: string | Date): string => {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
};

// Number
export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('fr-FR').format(num);
};
```

### 12.2 Classes utilitaires
```tsx
// Espacement conditionnel
const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

// États interactifs
const interactiveClasses = "transition-all duration-200 hover:scale-105 active:scale-95";

// Focus states
const focusClasses = "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";
```

---

## 13. Responsive design

### 13.1 Breakpoints
```css
/* Mobile */
@media (max-width: 639px) { }

/* Tablet */
@media (min-width: 640px) and (max-width: 1023px) { }

/* Desktop */
@media (min-width: 1024px) { }

/* Large Desktop */
@media (min-width: 1280px) { }
```

### 13.2 Patterns responsive
```tsx
// Grid responsive
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items}
</div>

// Sidebar responsive
<div className="hidden md:flex md:flex-shrink-0">
  <Sidebar />
</div>

// Table responsive
<div className="overflow-x-auto">
  <table className="min-w-full">
    {/* Table content */}
  </table>
</div>
```

---

## 14. Accessibilité

### 14.1 ARIA labels
```tsx
<button
  aria-label="Close modal"
  aria-expanded={isOpen}
  aria-controls="modal-content"
>
  <X />
</button>

<input
  aria-label="Email address"
  aria-describedby="email-help"
  aria-invalid={hasError}
/>
```

### 14.2 Navigation clavier
```tsx
// Focus management
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    onClose();
  }
  if (e.key === 'Enter') {
    onSubmit();
  }
};

// Skip links
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-indigo-600 text-white px-4 py-2 rounded">
  Skip to main content
</a>
```

---

## 15. Performance et optimisation

### 15.1 Lazy loading
```tsx
// Component lazy loading
const LazyComponent = lazy(() => import('./HeavyComponent'));

// Image lazy loading
<img
  src={imageUrl}
  alt={alt}
  loading="lazy"
  className="lazy-load"
/>
```

### 15.2 Virtual scrolling
```tsx
// Pour les grandes listes
import { FixedSizeList as List } from 'react-window';

const VirtualizedList = ({ items }) => (
  <List
    height={400}
    itemCount={items.length}
    itemSize={50}
  >
    {({ index, style }) => (
      <div style={style}>
        {items[index]}
      </div>
    )}
  </List>
);
```

---

## 16. Thèmes et personnalisation

### 16.1 Système de thèmes
```tsx
// Theme provider
interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };
  
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};
```

### 16.2 Variables CSS personnalisées
```css
:root {
  --color-primary: #6366f1;
  --color-secondary: #8b5cf6;
  --color-accent: #ec4899;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}
```

---

## 17. Bonnes pratiques et conventions

### 17.1 Naming conventions
```tsx
// Components: PascalCase
export const InvoiceTable: React.FC<InvoiceTableProps> = ({ invoices }) => {
  // ...
};

// Props interfaces: ComponentProps
interface InvoiceTableProps {
  invoices: Invoice[];
  onEdit?: (invoice: Invoice) => void;
}

// Functions: camelCase
const formatCurrency = (amount: number): string => {
  // ...
};

// Constants: UPPER_SNAKE_CASE
const DEFAULT_PAGE_SIZE = 20;
const API_ENDPOINTS = {
  INVOICES: '/api/invoices',
  PAYMENTS: '/api/payments',
};
```

### 17.2 Structure de composant
```tsx
// 1. Imports
import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

// 2. Types et interfaces
interface ComponentProps {
  // ...
}

// 3. Constants
const DEFAULT_VALUE = '';

// 4. Component principal
export const Component: React.FC<ComponentProps> = ({ ... }) => {
  // 5. Hooks
  const [state, setState] = useState();
  
  // 6. Event handlers
  const handleClick = () => {
    // ...
  };
  
  // 7. Effects
  useEffect(() => {
    // ...
  }, []);
  
  // 8. Render
  return (
    <div className="component">
      {/* JSX */}
    </div>
  );
};
```

---

## 18. Tests et validation

### 18.1 Tests visuels
```tsx
// Storybook stories
export default {
  title: 'Components/StatCard',
  component: StatCard,
} as ComponentMeta<typeof StatCard>;

export const Default: Story<StatCardProps> = {
  args: {
    label: 'Total Factures',
    value: 1000000,
    currency: 'CDF',
    bgColor: 'bg-blue-500',
    textColor: 'text-white',
  },
};
```

### 18.2 Tests d'accessibilité
```tsx
// Tests avec testing-library
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('should be accessible', async () => {
  render(<Component />);
  
  const button = screen.getByRole('button', { name: /submit/i });
  await userEvent.click(button);
  
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
```

---

## Conclusion

Cette documentation UI complète du système SGL PMD fournit une base solide pour :

1. **Cohérence visuelle** : Palette de couleurs, typographie et espacement unifiés
2. **Composants réutilisables** : Structure modulaire et bien définie
3. **Accessibilité** : Support ARIA et navigation clavier
4. **Responsive design** : Adaptation à tous les écrans
5. **Performance** : Optimisations et bonnes pratiques
6. **Maintenabilité** : Conventions claires et documentation exhaustive

Cette architecture peut être facilement adaptée et réutilisée pour d'autres projets avec des besoins similaires de gestion de données et d'interface utilisateur.

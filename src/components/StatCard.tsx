import { ChevronRight, Calculator, XCircle, AlertTriangle, TrendingUp, Loader } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, formatNumber } from '../utils/formatters';

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
  /** Montant principal plus petit (ex. cartes compact de l’onglet Global factures) */
  compactAmountSize?: 'default' | 'reduced';
  onHover?: boolean;
}

function StatCard({ 
  label, 
  value, 
  currency, 
  bgColor, 
  textColor, 
  rubrique, 
  montant, 
  nombreFactures,
  solde,
  fournisseur,
  subtitle,
  montantPaye,
  montantReste,
  labelMontantPaye = 'Payé',
  labelMontantReste = 'Reste',
  onDetailClick,
  icon = 'none',
  variant = 'default',
  compactAmountSize = 'default',
  onHover = true
}: StatCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleDetailClick = () => {
    setIsLoading(true);
    // La callback va ouvrir le modal immédiatement, mais le spinner reste visible
    // pendant un court délai pour confirmer l'action
    onDetailClick?.();
    setTimeout(() => setIsLoading(false), 800);
  };

  const getIconComponent = () => {
    const iconProps = { size: 32, className: 'opacity-40' };
    switch (icon) {
      case 'calculator':
        return <Calculator {...iconProps} />;
      case 'x-circle':
        return <XCircle {...iconProps} />;
      case 'alert':
        return <AlertTriangle {...iconProps} />;
      case 'trending':
        return <TrendingUp {...iconProps} />;
      default:
        return null;
    }
  };

  // Extract color for left bar based on bgColor
  const getColorFromBg = (bg: string): string => {
    if (bg.includes('red')) return '#ef4444';
    if (bg.includes('green')) return '#22c55e';
    if (bg.includes('yellow')) return '#eab308';
    if (bg.includes('blue')) return '#3b82f6';
    if (bg.includes('indigo')) return '#6366f1';
    if (bg.includes('purple')) return '#a855f7';
    return '#6b7280';
  };

  const barColor = getColorFromBg(bgColor);

  // Create gradient shades from barColor
  const adjustBrightness = (hex: string, percent: number): string => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const G = Math.min(255, Math.max(0, (num >> 8 & 0x00FF) + amt));
    const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  };

  const barColorDark = adjustBrightness(barColor, -20);

  // Extract gradient colors for hover state
  const getGradientFromBg = (bg: string): string => {
    // For white cards, use vibrant gradients based on label
    if (bg === 'bg-white' || bg.includes('white')) {
      if (label.includes('Top') || label.includes('Fournisseur')) return 'from-indigo-300 to-purple-300';
      if (label.includes('Rejeté')) return 'from-red-300 to-orange-300';
      if (label.includes('Payée')) return 'from-green-300 to-emerald-300';
      if (label.includes('Centre') || label.includes('coût')) return 'from-blue-300 to-cyan-300';
      if (label.includes('Charge') || label.includes('blocka')) return 'from-orange-300 to-red-300';
      if (label.includes('Age') || label.includes('Balance')) return 'from-amber-300 to-yellow-300';
      return 'from-blue-300 to-indigo-300';
    }
    // For colored cards, extract and lighten the color
    const matches = bg.match(/from-(\w+)-\d+/);
    if (matches) {
      const color = matches[1];
      // Use lighter shades for hover (300-400 instead of 500-600)
      return `from-${color}-300 to-${color}-400`;
    }
    return 'from-blue-300 to-indigo-300';
  };

  const hoverGradient = getGradientFromBg(bgColor);

  const compactIsReduced = compactAmountSize === 'reduced';

  // Variant compact - like in the image
  if (variant === 'compact') {
    return (
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onDetailClick}
        className={`relative overflow-hidden rounded-2xl transition-all duration-300 ease-out cursor-pointer ${bgColor} ${isHovered ? 'shadow-2xl transform scale-105' : 'shadow-lg'}`}
        style={{
          padding: compactIsReduced ? '1.25rem' : '1.5rem',
          minHeight: compactIsReduced ? '176px' : '200px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}
      >
        {/* Top section: label + icon */}
        <div className="flex justify-between items-start">
          <p className={`${textColor} text-sm font-semibold opacity-90`}>
            {label}
          </p>
          <div className={`${textColor} opacity-50`}>
            {getIconComponent()}
          </div>
        </div>

        {/* Center section: main value */}
        <div>
          <p
            className={`${textColor} font-bold leading-tight tracking-tight ${
              compactIsReduced ? 'text-2xl sm:text-3xl' : 'text-4xl'
            }`}
          >
            {formatCurrency(value)}
          </p>
          <p
            className={`${textColor} font-medium opacity-80 mt-1 ${
              compactIsReduced ? 'text-xs sm:text-sm' : 'text-sm'
            }`}
          >
            {currency}
          </p>
        </div>

        {/* Bottom section: count */}
        <div>
          <p className="text-sm opacity-80 underline" style={{ color: isHovered ? 'white' : textColor }}>
            {formatNumber(nombreFactures || 0)} facture{(nombreFactures || 0) > 1 ? 's' : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative overflow-hidden rounded-lg transition-all duration-300 ease-out cursor-pointer shadow-md hover:shadow-lg hover:scale-105"
      style={{
        borderLeft: `4px solid ${barColor}`,
        padding: '1.25rem',
        backgroundColor: isHovered ? barColor : 'white',
        backgroundImage: isHovered ? `linear-gradient(to bottom right, ${barColor}, ${barColorDark})` : 'none',
        color: isHovered ? 'white' : 'inherit'
      }}
    >
      {/* Contenu */}
      <div className="relative z-10">
        {/* Rubrique */}
        {rubrique && (
          <p className="text-xs font-medium mb-1" style={{ color: isHovered ? 'rgba(255,255,255,0.9)' : '#6b7280' }}>
            {rubrique}
          </p>
        )}
        
        {/* Label principal */}
        <p className="text-xs font-semibold mb-2" style={{ color: isHovered ? 'white' : '#374151' }}>
          {label}
        </p>
        
        {/* Fournisseur (pour Top Fournisseur) */}
        {fournisseur && (
          <p className="text-sm font-bold mb-2" style={{ color: isHovered ? 'white' : '#1f2937' }}>
            {fournisseur}
          </p>
        )}
        
        {/* Montant principal */}
        <p className="text-lg font-bold mb-1" style={{ color: isHovered ? 'white' : (bgColor.includes('red') ? '#dc2626' : bgColor.includes('green') ? '#16a34a' : bgColor.includes('yellow') ? '#ca8a04' : bgColor.includes('blue') ? '#2563eb' : bgColor.includes('indigo') ? '#4f46e5' : bgColor.includes('purple') ? '#9333ea' : '#1f2937') }}>
          {formatCurrency(value)} {currency}
        </p>

        {/* Subtitle (montant total pour top fournisseur) */}
        {subtitle && (
          <p className="text-xs mb-2" style={{ color: isHovered ? 'rgba(255,255,255,0.85)' : '#6b7280' }}>
            {subtitle}
          </p>
        )}

        {/* Détails pour Facture Payée Partiellement */}
        {(montantPaye !== undefined || montantReste !== undefined) && (
          <div className="space-y-0.5 my-1 text-xs">
            {montantPaye !== undefined && (
              <p style={{ color: isHovered ? 'rgba(255,255,255,0.9)' : '#4b5563' }}>
                {labelMontantPaye}: <span className="font-semibold">{formatCurrency(montantPaye)} {currency}</span>
              </p>
            )}
            {montantReste !== undefined && (
              <p style={{ color: isHovered ? 'rgba(255,255,255,0.9)' : '#4b5563' }}>
                {labelMontantReste}: <span className="font-semibold">{formatCurrency(montantReste)} {currency}</span>
              </p>
            )}
          </div>
        )}

        {/* Solde (pour Facture payée partiellement - ancien format) */}
        {solde !== undefined && (
          <p className={`text-xs font-medium mt-1 ${isHovered ? 'text-gray-700' : 'text-gray-600'}`}>
            Solde: {formatCurrency(solde)} {currency}
          </p>
        )}
        
        {/* Nombre de factures */}
        {nombreFactures !== undefined && (
          <p className={`text-xs font-medium ${isHovered ? 'text-gray-700' : 'text-gray-600'}`}>
            {formatNumber(nombreFactures)} facture{nombreFactures > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Bouton détail au survol */}
      {isHovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDetailClick();
          }}
          className="absolute top-4 right-4 z-20 p-1.5 rounded-full transition-all duration-200"
          style={{ backgroundColor: barColor }}
          title="Voir les détails"
        >
          {isLoading ? (
            <Loader size={16} className="text-white animate-spin" />
          ) : (
            <ChevronRight size={16} className="text-white" />
          )}
        </button>
      )}
    </div>
  );
}

export default StatCard;

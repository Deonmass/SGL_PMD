import { useMemo, useState } from 'react';
import { Expand, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MonthlyInvoiceStats } from '../services/tableService';

interface MonthlyInvoiceChartProps {
  data: MonthlyInvoiceStats[];
  loading?: boolean;
}

export default function MonthlyInvoiceChart({ data, loading }: MonthlyInvoiceChartProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({
    totalRecu: false,
    totalPaye: false,
    totalReste: false,
  });

  const series = useMemo(() => ([
    { key: 'totalRecu', label: 'Total recu', color: '#3b82f6', countKey: 'nombreFactures' },
    { key: 'totalPaye', label: 'Total paye', color: '#10b981', countKey: 'nombreFacturesPayees' },
    { key: 'totalReste', label: 'Total non paye', color: '#ef4444', countKey: 'nombreFacturesNonPayees' },
  ]), []);

  const formatAmount = (value?: number) => {
    const amount = Number(value || 0);
    return `${Math.round(amount).toLocaleString()} USD`;
  };

  const activePoint = activeIndex !== null && data[activeIndex] ? data[activeIndex] : null;
  const previousPoint = activePoint && activeIndex !== null && activeIndex > 0 ? data[activeIndex - 1] : null;

  const buildInsightText = () => {
    if (!activePoint) return '';
    const unpaidRatio = activePoint.totalRecu > 0 ? (activePoint.totalReste / activePoint.totalRecu) * 100 : 0;
    const monthVariation = previousPoint ? activePoint.totalRecu - previousPoint.totalRecu : 0;
    const monthVariationLabel = previousPoint
      ? monthVariation >= 0
        ? `hausse de ${formatAmount(monthVariation)} des montants recus vs ${previousPoint.month.toLowerCase()}`
        : `baisse de ${formatAmount(Math.abs(monthVariation))} des montants recus vs ${previousPoint.month.toLowerCase()}`
      : 'pas de mois precedent pour comparaison';

    return `${activePoint.month}: non paye ${formatAmount(activePoint.totalReste)} (${unpaidRatio.toFixed(1)}% du recu), ${monthVariationLabel}, ${activePoint.nombreFactures} facture(s) recues.`;
  };

  const toggleSeries = (seriesKey: string) => {
    setHiddenSeries((prev) => ({
      ...prev,
      [seriesKey]: !prev[seriesKey],
    }));
  };

  if (loading) {
    return <div className="text-center py-8">Chargement du graphique...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="text-center py-8 text-gray-500">Aucune donnée disponible</div>;
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded shadow-lg">
          <p className="font-semibold text-gray-800">{label}</p>
          <p className="text-xs text-gray-600 mb-2">{payload[0].payload.nombreFactures} facture(s)</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm font-semibold">
              {entry.name}: {formatAmount(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderLegend = () => {
    const point = activePoint;
    return (
      <div className="flex flex-wrap items-center justify-end gap-3">
        {series.map((item) => {
          const hidden = hiddenSeries[item.key];
          const monthValue = point ? (point as any)[item.key] : null;
          const factCount = point ? ((point as any)[item.countKey] ?? 0) : 0;
          return (
            <button
              key={item.key}
              onClick={() => toggleSeries(item.key)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-xs ${
                hidden ? 'bg-gray-100 text-gray-500 border-gray-300' : 'bg-white text-gray-800 border-gray-400'
              }`}
              type="button"
            >
              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="font-semibold">{item.label}</span>
              {monthValue !== null && (
                <span className="text-gray-600">
                  {formatAmount(monthValue)} | {factCount} fact.
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const renderChart = (height: number, showDenseLabels: boolean) => (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 12, right: 20, left: 20, bottom: 5 }}
        onMouseMove={(state: any) => {
          if (typeof state?.activeTooltipIndex === 'number') {
            setActiveIndex(state.activeTooltipIndex);
          }
        }}
        onMouseLeave={() => setActiveIndex(null)}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" stroke="#6b7280" style={{ fontSize: '12px' }} />
        <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
        <Tooltip content={<CustomTooltip />} />
        {series.map((item) => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            stroke={item.color}
            strokeWidth={2}
            dot={{ fill: item.color, r: 4 }}
            activeDot={{ r: 7 }}
            name={item.label}
            hide={hiddenSeries[item.key]}
            label={
              showDenseLabels
                ? ({ x, y, value, index }: any) => (
                    <text x={x} y={y - 10} fill={item.color} fontSize={10} textAnchor="middle">
                      {`${Math.round(Number(value || 0)).toLocaleString()}$ | ${data[index]?.[item.countKey] || 0}f`}
                    </text>
                  )
                : undefined
            }
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <>
      <div
        className="w-full bg-white rounded-lg border border-gray-200 p-6 cursor-pointer"
        onClick={() => setIsModalOpen(true)}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-800">Évolution mensuelle des factures</h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
          >
            <Expand size={14} />
            Agrandir
          </button>
        </div>
        <div className="mb-3">{renderLegend()}</div>
        {renderChart(400, false)}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-7xl max-h-[92vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Évolution mensuelle des factures - vue détaillée</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded hover:bg-gray-100"
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(92vh-72px)]">
              <div className="mb-2 flex items-start justify-end">
                <p className="text-sm text-gray-700 text-right max-w-3xl">{buildInsightText()}</p>
              </div>
              <div className="mb-4">{renderLegend()}</div>
              {renderChart(560, true)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

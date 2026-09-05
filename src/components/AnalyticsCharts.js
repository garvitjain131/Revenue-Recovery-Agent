'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useDashboardState } from '@/hooks/useDashboardState';
import { ChartSkeleton } from './Skeletons';
import {
  PieChart as PieIcon,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Activity
} from 'lucide-react';

const CHART_COLORS = ['#3D8B6E', '#6A8FB8', '#C4841D', '#8B7355', '#C0392B', '#7E6B8F'];

function formatINR(n) {
  if (n == null || isNaN(n)) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function CustomChartTooltip({ active, payload, label, isCurrency = false, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 12px',
        fontSize: 12,
        boxShadow: 'var(--shadow-md)',
        minWidth: 120,
      }}
    >
      {label && <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>{label}</div>}
      {payload.map((entry, i) => {
        const val = typeof entry.value === 'number'
          ? (isCurrency ? formatINR(entry.value) : entry.value.toLocaleString('en-IN') + unit)
          : entry.value;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color || 'var(--color-brand)' }} />
            <span style={{ fontWeight: 500 }}>{entry.name || 'Value'}:</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', marginLeft: 'auto' }}>{val}</span>
          </div>
        );
      })}
    </div>
  );
}

export function AnalyticsCharts() {
  const { state } = useDashboardState();
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const merchantId = state.merchantId || 'merchant_rzp_test';
        const res = await fetch(`/api/dashboard/analytics?merchant_id=${merchantId}`);
        if (!res.ok) throw new Error('Failed to fetch analytics');
        const json = await res.json();
        if (!cancelled) {
          setChartData(json);
          setLoading(false);
        }
      } catch (err) {
        console.error('[AnalyticsCharts] Error:', err);
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [state.merchantId, state.refreshKey]);

  if (loading || !chartData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ChartSkeleton />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  const timeline = chartData.timeline || [];
  const failureReasons = chartData.failureReasons || [];
  const methodPerformance = chartData.methodPerformance || [];

  const totalFailures = failureReasons.reduce((sum, item) => sum + (item.value || 0), 0);
  const totalRecovered30d = timeline.reduce((sum, item) => sum + (item.recovered || 0), 0);
  const primaryLeak = failureReasons[0]?.name || 'N/A';
  const safestRail = [...methodPerformance].sort((a, b) => a.failureRate - b.failureRate)[0]?.method || 'UPI';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ═══ Executive Insights Strip ═══ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
        }}
      >
        <div
          className="panel"
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--bg-primary)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(192, 57, 43, 0.10)',
              color: 'var(--color-error)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Primary Leak Vector
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
              {primaryLeak}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Accounts for {totalFailures > 0 ? (((failureReasons[0]?.value || 0) / totalFailures) * 100).toFixed(1) : 0}% of failures
            </div>
          </div>
        </div>

        <div
          className="panel"
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--bg-primary)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(61, 139, 110, 0.10)',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Most Reliable Rail
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {safestRail}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Lowest transaction failure probability
            </div>
          </div>
        </div>

        <div
          className="panel"
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--bg-primary)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(106, 143, 184, 0.12)',
              color: 'var(--color-brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Activity size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              30-Day Recovery Velocity
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatINR(totalRecovered30d)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Automated closed-loop recapture
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 30-Day Recovery Revenue Velocity Chart (Full Width) ═══ */}
      <div className="panel">
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="panel-title">
            <TrendingUp size={14} />
            <span>30-Day Revenue Recovery Trajectory</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Zap size={13} />
            <span>Total Recaptured: {formatINR(totalRecovered30d)}</span>
          </div>
        </div>
        <div className="panel-body" style={{ height: 220, padding: '12px 16px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRecovered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3D8B6E" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3D8B6E" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-dim)' }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
                tickFormatter={(v) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`}
                width={50}
              />
              <Tooltip content={<CustomChartTooltip isCurrency={true} />} />
              <Area
                type="monotone"
                dataKey="recovered"
                name="Revenue Recovered"
                stroke="#3D8B6E"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorRecovered)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ═══ 2-Column Analytics: Root Causes & Rail Performance ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        {/* 1. Failure Breakdown by Reason (Donut + Side Legend) */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              <PieIcon size={14} />
              <span>Failure Root Cause Distribution</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {totalFailures.toLocaleString('en-IN')} total failures
            </span>
          </div>
          <div className="panel-body" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 170, height: 170, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={failureReasons}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={74}
                    paddingAngle={3}
                  >
                    {failureReasons.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomChartTooltip unit=" incidents" />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Custom Legend List */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              {failureReasons.map((item, i) => {
                const pct = totalFailures > 0 ? ((item.value / totalFailures) * 100).toFixed(1) : 0;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: CHART_COLORS[i % CHART_COLORS.length],
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        textTransform: 'capitalize',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                      title={item.name}
                    >
                      {item.name}
                    </span>
                    <span className="mono-num" style={{ fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>
                      {item.value}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 42, textAlign: 'right', flexShrink: 0 }}>
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Failure Rate by Payment Method (Bar Chart) */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              <CreditCard size={14} />
              <span>Failure Rate by Payment Rail (%)</span>
            </div>
          </div>
          <div className="panel-body" style={{ height: 200, padding: '12px 16px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={methodPerformance} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="method" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 600 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
                  tickFormatter={(v) => `${v}%`}
                  width={38}
                />
                <Tooltip cursor={{ fill: 'var(--bg-hover)' }} content={<CustomChartTooltip unit="%" />} />
                <Bar dataKey="failureRate" name="Failure Rate" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {methodPerformance.map((entry, i) => {
                    const color = entry.failureRate > 25 ? 'var(--color-error)' : entry.failureRate > 20 ? 'var(--color-warning)' : 'var(--color-brand)';
                    return <Cell key={i} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

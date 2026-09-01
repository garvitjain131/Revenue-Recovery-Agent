'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useDashboardState } from '@/hooks/useDashboardState';
import { ChartSkeleton } from './Skeletons';
import { BarChart3 } from 'lucide-react';

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#06B6D4', '#EF4444', '#8B5CF6', '#EC4899', '#84CC16'];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color, fontSize: 12 }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString('en-IN') : entry.value}
        </p>
      ))}
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
        const res = await fetch(`/api/dashboard/analytics?merchant_id=${state.merchantId}`);
        if (!res.ok) throw new Error('Failed');
        const json = await res.json();
        if (!cancelled) { setChartData(json); setLoading(false); }
      } catch (err) {
        console.error('[AnalyticsCharts]', err);
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [state.merchantId]);

  if (loading || !chartData) {
    return (
      <section className="section mt-xl">
        <h2 className="section-title">
          <span className="section-title-icon"><BarChart3 size={18} /></span>
          Analytics and Performance
        </h2>
        <div className="dashboard-grid-2x2">
          {[...Array(4)].map((_, i) => <ChartSkeleton key={i} />)}
        </div>
      </section>
    );
  }

  return (
    <section className="section mt-xl">
      <h2 className="section-title">
        <span className="section-title-icon"><BarChart3 size={18} /></span>
        Analytics and Performance
      </h2>
      <div className="dashboard-grid-2x2">
        {/* Recovery Funnel */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Recovery Funnel</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData.funnel || []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis type="number" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <YAxis dataKey="stage" type="category" width={90} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {(chartData.funnel || []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Failure Breakdown */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Failure Breakdown</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData.failureReasons || []}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: 'var(--text-dim)' }}
                >
                  {(chartData.failureReasons || []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recovery Timeline */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Recovery Timeline (30 Days)</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData.timeline || []} margin={{ left: 10 }}>
                <defs>
                  <linearGradient id="recoveryGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="recovered" stroke="#10B981" strokeWidth={2} fill="url(#recoveryGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Method Performance */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Failure Rate by Payment Method</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData.methodPerformance || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="method" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} unit="%" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="failureRate" name="Failure Rate %" radius={[4, 4, 0, 0]}>
                  {(chartData.methodPerformance || []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}

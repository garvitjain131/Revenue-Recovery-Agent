'use client';

import { useEffect, useState } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { HeroMetricSkeleton } from './Skeletons';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function formatPercent(n) {
  if (n == null || isNaN(n)) return '0.0%';
  return (n * 100).toFixed(1) + '%';
}

export function HeroMetrics() {
  const { state } = useDashboardState();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
        if (!res.ok) throw new Error('Failed to fetch metrics');
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        console.error('[HeroMetrics] Fetch failed:', err);
        if (!cancelled) setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [state.merchantId]);

  if (loading) {
    return (
      <div className="hero-metrics" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {[...Array(5)].map((_, i) => <HeroMetricSkeleton key={i} />)}
      </div>
    );
  }

  const metrics = data?.metrics || {};

  const cards = [
    {
      label: 'Revenue Processed',
      value: formatCurrency(metrics.total_processed),
      subtitle: `${metrics.total_payments || 0} total transactions`,
      variant: 'default',
    },
    {
      label: 'Revenue at Risk',
      value: formatCurrency(metrics.revenue_at_risk || metrics.total_at_risk),
      subtitle: `${metrics.failed_count || 0} failed payments (${formatPercent(metrics.failure_rate)})`,
      variant: 'danger',
    },
    {
      label: 'Recoverable Revenue',
      value: formatCurrency(metrics.recoverable_revenue),
      subtitle: `${metrics.active_opportunities_count || 0} actionable opportunities`,
      variant: 'warning',
    },
    {
      label: 'Revenue Recovered',
      value: formatCurrency(metrics.total_recovered),
      subtitle: `${metrics.recovered_count || 0} confirmed attributions`,
      variant: 'success',
      highlight: true,
    },
    {
      label: 'Net Recovery',
      value: formatCurrency(metrics.net_recovered || metrics.total_recovered),
      subtitle: `Recovery Rate: ${formatPercent(metrics.recovery_rate)}`,
      variant: 'success',
    },
  ];

  return (
    <div className="hero-metrics" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
      {cards.map((card, idx) => (
        <div
          key={idx}
          className={`metric-card ${card.variant}`}
          style={{
            animation: `fadeSlideIn 0.4s ease ${idx * 60}ms forwards`,
            opacity: 0,
            border: card.highlight ? '2px solid var(--color-success)' : undefined,
            background: card.highlight ? 'rgba(16, 185, 129, 0.05)' : undefined,
          }}
        >
          <div className="metric-label">{card.label}</div>
          <div
            className="metric-value"
            style={{
              fontSize: card.highlight ? 26 : 22,
              fontWeight: 800,
              color: card.highlight ? 'var(--color-success)' : undefined,
            }}
          >
            {card.value}
          </div>
          <div className="metric-subtitle">{card.subtitle}</div>
        </div>
      ))}
    </div>
  );
}

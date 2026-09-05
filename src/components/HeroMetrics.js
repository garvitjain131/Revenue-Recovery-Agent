'use client';

import { useEffect, useState } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function formatPercent(v) {
  if (v == null || isNaN(v)) return '0%';
  return (v * 100).toFixed(1) + '%';
}

export function HeroMetrics() {
  const { state } = useDashboardState();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
        if (!res.ok) throw new Error('Failed');
        const json = await res.json();
        if (!cancelled) {
          setMetrics(json.metrics || {});
          setLoading(false);
        }
      } catch (err) {
        console.error('[HeroMetrics] Error:', err);
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [state.merchantId, state.refreshKey]);

  if (loading || !metrics) {
    return (
      <div className="metric-strip" style={{ minHeight: 80 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="metric-item">
            <div style={{ width: 80, height: 10, background: 'var(--bg-tertiary)', borderRadius: 3, marginBottom: 6 }} />
            <div style={{ width: 100, height: 18, background: 'var(--bg-tertiary)', borderRadius: 3 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="metric-strip">
      {/* Revenue Recovered — Hero */}
      <div className="metric-item hero">
        <div className="metric-item-label">Revenue Recovered</div>
        <div className="metric-item-value hero-val">
          {formatCurrency(metrics.revenue_recovered || metrics.total_recovered)}
        </div>
        <div className="metric-item-sub">
          Recovery rate {formatPercent(metrics.recovery_rate)}
        </div>
      </div>

      {/* Revenue at Risk */}
      <div className="metric-item">
        <div className="metric-item-label">Revenue at Risk</div>
        <div className="metric-item-value" style={{ color: 'var(--color-error)' }}>
          {formatCurrency(metrics.revenue_at_risk || metrics.total_at_risk)}
        </div>
        <div className="metric-item-sub">
          {metrics.failed_count || 0} failed payments
        </div>
      </div>

      {/* Recoverable */}
      <div className="metric-item">
        <div className="metric-item-label">Recoverable</div>
        <div className="metric-item-value" style={{ color: 'var(--color-warning)' }}>
          {formatCurrency(metrics.recoverable_revenue || metrics.total_recoverable)}
        </div>
        <div className="metric-item-sub">
          {metrics.recoverable_count || 0} opportunities
        </div>
      </div>

      {/* Net Recovery */}
      <div className="metric-item">
        <div className="metric-item-label">Net Recovery</div>
        <div className="metric-item-value">
          {formatCurrency(metrics.net_recovery)}
        </div>
        <div className="metric-item-sub">
          After intervention costs
        </div>
      </div>

      {/* Revenue Processed */}
      <div className="metric-item">
        <div className="metric-item-label">Processed</div>
        <div className="metric-item-value">
          {formatCurrency(metrics.total_processed)}
        </div>
        <div className="metric-item-sub">
          Total volume
        </div>
      </div>
    </div>
  );
}

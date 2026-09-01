'use client';

import { useEffect, useState } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { Users, CheckCircle } from 'lucide-react';

export function CustomerScorecard() {
  const { state } = useDashboardState();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/customers/at-risk?merchant_id=${state.merchantId}`);
        if (!res.ok) throw new Error('Failed');
        const json = await res.json();
        if (!cancelled) { setCustomers(json); setLoading(false); }
      } catch (err) {
        console.error('[CustomerScorecard]', err);
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [state.merchantId]);

  const getRiskLevel = (risk) => {
    if (risk > 0.7) return { cls: 'badge-critical', text: 'High Risk', dotCls: 'critical' };
    if (risk > 0.4) return { cls: 'badge-high', text: 'Medium Risk', dotCls: 'warning' };
    return { cls: 'badge-success', text: 'Low Risk', dotCls: 'success' };
  };

  const getBorderColor = (risk) => {
    if (risk > 0.7) return 'var(--color-error)';
    if (risk > 0.4) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  return (
    <div className="card section">
      <div className="section-header">
        <h2 className="section-title">
          <span className="section-title-icon"><Users size={18} /></span>
          At-Risk Customers
        </h2>
        <span className="badge badge-dim">{customers.length} flagged</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ padding: 14, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 12, width: '80%', marginBottom: 4 }} />
              <div className="skeleton" style={{ height: 12, width: '40%' }} />
            </div>
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="empty-state" style={{ padding: 32 }}>
          <div className="empty-state-icon"><CheckCircle size={36} /></div>
          <p>No at-risk customers detected</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {customers.slice(0, 8).map((cust, idx) => {
            const risk = getRiskLevel(cust.churn_risk || 0);
            return (
              <div
                key={cust.id || idx}
                style={{
                  padding: '12px 14px',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: `3px solid ${getBorderColor(cust.churn_risk || 0)}`,
                  animation: `fadeSlideIn 0.3s ease ${idx * 60}ms forwards`,
                  opacity: 0,
                }}
              >
                <div className="flex-between">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`status-dot ${risk.dotCls}`} />
                      {cust.name || cust.id}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {cust.recent_failures || cust.failure_count || 0} failures in 30d
                      {cust.ltv ? ` · LTV ₹${Math.round(cust.ltv).toLocaleString('en-IN')}` : ''}
                    </div>
                  </div>
                  <span className={`badge ${risk.cls}`} style={{ flexShrink: 0 }}>
                    {((cust.churn_risk || 0) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

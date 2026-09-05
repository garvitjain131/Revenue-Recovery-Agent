'use client';

import { useEffect, useState, Fragment } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { Users, CheckCircle2, Zap, Link2, Mail, RefreshCw, Clock } from 'lucide-react';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

const ACTION_ICONS = {
  create_payment_link: Link2,
  send_notification: Mail,
  retry_payment: RefreshCw,
};

export function CustomerScorecard() {
  const { state } = useDashboardState();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  // Feature #5: Expanded customer for timeline
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [customerInterventions, setCustomerInterventions] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/customers/at-risk?merchant_id=${state.merchantId}`);
        if (!res.ok) throw new Error('Failed');
        const json = await res.json();
        if (!cancelled) {
          setCustomers(json);
          setLoading(false);
        }
      } catch (err) {
        console.error('[CustomerScorecard] Error:', err);
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [state.merchantId, state.refreshKey]);

  // Feature #5: Fetch interventions for expanded customer
  const handleExpandCustomer = async (custId) => {
    if (expandedCustomerId === custId) {
      setExpandedCustomerId(null);
      return;
    }
    setExpandedCustomerId(custId);
    setLoadingTimeline(true);
    try {
      // Query interventions for this customer from the dashboard data
      const res = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
      if (res.ok) {
        const data = await res.json();
        const custInterventions = (data.interventions || []).filter(
          (i) => i.customer_id === custId
        );
        setCustomerInterventions(custInterventions);
      }
    } catch (err) {
      console.error('[CustomerScorecard] Timeline fetch error:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <div className="panel-title">
          <Users size={14} />
          <span>At-Risk Customer Telemetry</span>
          <span className="badge badge-dim" style={{ marginLeft: 4, fontSize: 9 }}>
            {customers.length}
          </span>
        </div>
      </div>

      <div className="fintech-table-container" style={{ flex: 1, maxHeight: 420, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 16 }}>
            <div className="spin" style={{ width: 20, height: 20, border: '2px solid var(--color-brand)', borderTopColor: 'transparent', borderRadius: '50%', margin: '16px auto' }} />
          </div>
        ) : customers.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
            <CheckCircle2 size={24} style={{ color: 'var(--color-success)', margin: '0 auto 6px' }} />
            <div>No at-risk customer churn patterns detected.</div>
          </div>
        ) : (
          <table className="fintech-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Failures</th>
                <th style={{ textAlign: 'right' }}>LTV</th>
                <th style={{ textAlign: 'right', width: 75 }}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {customers.slice(0, 8).map((cust, idx) => {
                const riskPercent = Math.round((cust.churn_risk || 0) * 100);
                const isHigh = riskPercent >= 70;
                const isMedium = riskPercent >= 40;
                const isExpanded = expandedCustomerId === cust.id;

                return (
                  <Fragment key={cust.id || idx}>
                    <tr
                      onClick={() => handleExpandCustomer(cust.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
                          {cust.name || cust.id}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {cust.email || 'guest'}
                        </div>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {cust.recent_failures || cust.failure_count || 0} / 30d
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12 }} className="mono-num">
                        {cust.ltv ? formatCurrency(cust.ltv) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span
                          className={`badge ${isHigh ? 'badge-critical' : isMedium ? 'badge-warning' : 'badge-success'}`}
                          style={{ fontSize: 9 }}
                        >
                          {riskPercent}%
                        </span>
                      </td>
                    </tr>
                    {/* ═══ Feature #5: Customer Intervention Timeline ═══ */}
                    {isExpanded && (
                      <tr key={`${cust.id}-timeline`}>
                        <td colSpan={4} style={{ padding: '8px 12px', background: 'var(--bg-tertiary)' }}>
                          {loadingTimeline ? (
                            <div style={{ textAlign: 'center', padding: 8 }}>
                              <div className="spin" style={{ width: 14, height: 14, border: '2px solid var(--color-brand)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto' }} />
                            </div>
                          ) : customerInterventions.length === 0 ? (
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', padding: 8 }}>
                              No past interventions for this customer.
                            </div>
                          ) : (
                            <div style={{ padding: '4px 0' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                                Intervention History
                              </div>
                              {customerInterventions.slice(0, 5).map((intv, i) => {
                                const ActionIcon = ACTION_ICONS[intv.action_type] || Zap;
                                const outcomeClass = intv.execution_status === 'executed'
                                  ? 'outcome-executed'
                                  : intv.execution_status === 'failed'
                                  ? 'outcome-failed'
                                  : 'outcome-pending';

                                return (
                                  <div key={intv.id || i} className={`timeline-item ${outcomeClass}`}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <ActionIcon size={11} style={{ color: 'var(--text-secondary)' }} />
                                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {intv.action_type?.replace(/_/g, ' ')}
                                      </span>
                                      <span className={`badge ${intv.execution_status === 'executed' ? 'badge-success' : intv.execution_status === 'failed' ? 'badge-critical' : 'badge-dim'}`} style={{ fontSize: 8 }}>
                                        {(intv.execution_status || 'pending').toUpperCase()}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1, paddingLeft: 17 }}>
                                      {formatDate(intv.created_at)}
                                      {intv.expected_recovery ? ` · ${formatCurrency(intv.expected_recovery)}` : ''}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { TableSkeleton } from './Skeletons';
import { Target, CheckCircle, Eye, Check, X, ShieldAlert, Sparkles } from 'lucide-react';
import { showToast } from './Toast';

const PRIORITY_CLASSES = { critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium', low: 'badge-low' };

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function RecoveryGrid() {
  const { state, setFilter, selectOpportunity } = useDashboardState();
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const fetchOpps = async () => {
    try {
      const res = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
      if (!res.ok) throw new Error('Fetch failed');
      const json = await res.json();
      setOpportunities(json.opportunities || []);
    } catch (err) {
      console.error('[RecoveryGrid] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpps();
    const interval = setInterval(fetchOpps, 15000);
    return () => clearInterval(interval);
  }, [state.merchantId]);

  const handleQuickApproval = async (e, opp, action) => {
    e.stopPropagation();
    setActingId(opp.id);
    try {
      // Find latest pending intervention for this opportunity
      const detailRes = await fetch(`/api/opportunities/${opp.id}?merchant_id=${state.merchantId}`);
      const detailJson = await detailRes.json();
      const pendingInt = (detailJson.interventions || []).find(i => i.approval_status === 'awaiting_approval');

      if (!pendingInt) {
        showToast('No pending intervention to approve', 'info');
        return;
      }

      const res = await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervention_id: pendingInt.id, action }),
      });

      if (res.ok) {
        showToast(action === 'approve' ? 'Intervention authorized' : 'Intervention rejected', 'success');
        fetchOpps();
      } else {
        showToast('Approval failed', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setActingId(null);
    }
  };

  // Apply filters
  let filtered = opportunities;
  if (state.filters.priority) {
    filtered = filtered.filter(o => (o.priority || '').toLowerCase() === state.filters.priority.toLowerCase());
  }

  // Apply sorting
  filtered = [...filtered].sort((a, b) => {
    return (b.revenue_at_risk || 0) - (a.revenue_at_risk || 0);
  });

  const priorities = ['critical', 'high', 'medium', 'low'];

  return (
    <div className="card section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="section-header">
        <h2 className="section-title">
          <span className="section-title-icon"><Target size={18} /></span>
          Opportunity Inbox ({filtered.length})
        </h2>
        <span className="badge badge-dim">Prioritized by Expected Value</span>
      </div>

      {/* Filter chips */}
      <div className="filter-chips" style={{ marginBottom: 14 }}>
        <button
          className={`chip ${state.filters.priority === null ? 'active' : ''}`}
          onClick={() => setFilter('priority', null)}
        >
          All Opportunities
        </button>
        {priorities.map(p => (
          <button
            key={p}
            className={`chip ${state.filters.priority === p ? 'active' : ''}`}
            onClick={() => setFilter('priority', state.filters.priority === p ? null : p)}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? <TableSkeleton rows={5} /> : (
        <div className="opportunity-list" style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon"><CheckCircle size={36} /></div>
              <p>No active revenue opportunities match the current filters</p>
            </div>
          )}
          {filtered.map((opp, idx) => {
            const priority = (opp.priority || 'medium').toLowerCase();
            const isAwaiting = opp.status === 'awaiting_approval';
            const isRecovered = opp.status === 'recovered';

            return (
              <div
                key={opp.id || idx}
                className={`opportunity-item ${priority}`}
                onClick={() => selectOpportunity(opp.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && selectOpportunity(opp.id)}
                style={{
                  animation: `fadeSlideIn 0.3s ease ${idx * 40}ms forwards`,
                  opacity: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                  <span className={`badge ${PRIORITY_CLASSES[priority] || 'badge-medium'}`} style={{ flexShrink: 0 }}>
                    {priority.toUpperCase()}
                  </span>

                  <div className="opportunity-info" style={{ minWidth: 0 }}>
                    <div className="opportunity-title" style={{ fontSize: 13, fontWeight: 700 }}>
                      {opp.title || opp.type?.replace(/_/g, ' ')}
                    </div>
                    <div className="opportunity-meta" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      <span>{opp.root_cause || 'Transaction rail degradation'}</span>
                      <span>·</span>
                      <span>{((opp.recovery_probability || 0) * 100).toFixed(0)}% confidence</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="opportunity-risk" style={{ fontSize: 15, fontWeight: 800, color: isRecovered ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {formatCurrency(opp.revenue_at_risk)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 600 }}>
                      Exp: {formatCurrency(opp.expected_recovery)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isAwaiting && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={(e) => handleQuickApproval(e, opp, 'approve')}
                        disabled={actingId === opp.id}
                        title="Authorize Intervention"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                      >
                        <Check size={12} /> Approve
                      </button>
                    )}

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => { e.stopPropagation(); selectOpportunity(opp.id); }}
                      title="View Decision & 14-Point Policy Checklist"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                    >
                      <Eye size={12} /> View Decision
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

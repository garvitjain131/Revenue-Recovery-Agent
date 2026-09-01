'use client';

import { useEffect, useState } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { showToast } from './Toast';
import { Search, Zap, RefreshCw, Link2, Mail } from 'lucide-react';

export function OpportunityModal() {
  const { state, closeModal } = useDashboardState();
  const [opportunity, setOpportunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!state.isOpportunityModalOpen || !state.selectedOpportunityId) return;

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/opportunities/${state.selectedOpportunityId}?merchant_id=${state.merchantId}`);
        if (!res.ok) throw new Error('Failed');
        const json = await res.json();
        if (!cancelled) { setOpportunity(json); setLoading(false); }
      } catch (err) {
        console.error('[OpportunityModal]', err);
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [state.selectedOpportunityId, state.isOpportunityModalOpen, state.merchantId]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') closeModal(); };
    if (state.isOpportunityModalOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [state.isOpportunityModalOpen, closeModal]);

  if (!state.isOpportunityModalOpen) return null;

  const handleAction = async (actionType) => {
    setActing(true);
    try {
      const res = await fetch('/api/interventions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: state.merchantId,
          opportunity_id: state.selectedOpportunityId,
          action_type: actionType,
        }),
      });
      if (res.ok) {
        showToast(`Action '${actionType.replace(/_/g, ' ')}' executed`, 'success');
        closeModal();
      } else {
        showToast('Action failed', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setActing(false);
    }
  };

  const opp = opportunity;
  const confPercent = opp ? ((opp.recovery_probability || 0) * 100).toFixed(0) : 0;
  const confClass = confPercent >= 70 ? 'high' : confPercent >= 40 ? 'medium' : 'low';

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal-content" onClick={e => e.stopPropagation()} role="dialog" aria-label="Opportunity Details">
        <button className="modal-close" onClick={closeModal} aria-label="Close">X</button>

        {loading || !opp ? (
          <div className="loading-container">
            <div className="loading-spinner" />
            <span>Loading opportunity...</span>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <span className={`badge ${opp.priority === 'critical' ? 'badge-critical' : opp.priority === 'high' ? 'badge-high' : 'badge-medium'}`}>
                  {opp.priority || 'medium'}
                </span>
                <span className="badge badge-dim">{opp.status || 'detected'}</span>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{opp.title || 'Recovery Opportunity'}</h2>
              <p className="text-muted" style={{ marginTop: 4 }}>{opp.type?.replace(/_/g, ' ')}</p>
            </div>

            {/* Key Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
              <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div className="metric-label">Revenue at Risk</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-error)', marginTop: 4 }}>
                  ₹{Math.round(opp.revenue_at_risk || 0).toLocaleString('en-IN')}
                </div>
              </div>
              <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div className="metric-label">Expected Recovery</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-success)', marginTop: 4 }}>
                  ₹{Math.round(opp.expected_recovery || 0).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Confidence Bar */}
            <div style={{ marginBottom: 20 }}>
              <div className="flex-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Recovery Confidence</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{confPercent}%</span>
              </div>
              <div className="confidence-bar" style={{ height: 8 }}>
                <div className={`confidence-fill ${confClass}`} style={{ width: `${confPercent}%` }} />
              </div>
            </div>

            {/* Root Cause */}
            {opp.root_cause && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Search size={14} /> Root Cause Analysis
                </h3>
                <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                  {opp.root_cause}
                  {opp.root_cause_confidence && (
                    <span className="text-muted" style={{ marginLeft: 8 }}>
                      ({(opp.root_cause_confidence * 100).toFixed(0)}% confidence)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={14} /> Quick Actions
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => handleAction('retry_payment')} disabled={acting}>
                  <RefreshCw size={13} /> Retry Payment
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleAction('create_payment_link')} disabled={acting}>
                  <Link2 size={13} /> Payment Link
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleAction('send_notification')} disabled={acting}>
                  <Mail size={13} /> Send Notification
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

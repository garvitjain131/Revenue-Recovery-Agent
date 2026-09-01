'use client';

import { useEffect, useState } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { showToast } from './Toast';
import {
  Search, ShieldCheck, ShieldAlert, CheckCircle2, XCircle,
  AlertTriangle, DollarSign, ArrowRight, Check, X, Layers
} from 'lucide-react';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function DecisionExplanationModal() {
  const { state, closeModal } = useDashboardState();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!state.isOpportunityModalOpen || !state.selectedOpportunityId) return;

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/opportunities/${state.selectedOpportunityId}?merchant_id=${state.merchantId}`);
        if (!res.ok) throw new Error('Fetch failed');
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        console.error('[DecisionExplanationModal]', err);
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

  const handleInterventionAction = async (action, interventionId) => {
    setActing(true);
    try {
      const res = await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervention_id: interventionId, action }),
      });
      const resJson = await res.json();
      if (res.ok) {
        showToast(action === 'approve' ? 'Intervention approved & executed' : 'Intervention rejected', 'success');
        closeModal();
      } else {
        showToast(`Action failed: ${resJson.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setActing(false);
    }
  };

  const opp = data?.opportunity;
  const strategies = data?.strategies || [];
  const selectedStrategy = data?.selected_strategy || strategies[0] || {};
  const policyDecision = data?.policy_decision || {};
  const checks = policyDecision.checks || [];
  const pendingIntervention = (data?.interventions || []).find(i => i.approval_status === 'awaiting_approval');

  const confPercent = opp ? ((opp.recovery_probability || 0) * 100).toFixed(0) : 0;

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Decision Explanation & Policy Audit"
        style={{ maxWidth: 840, maxHeight: '90vh', overflowY: 'auto' }}
      >
        <button className="modal-close" onClick={closeModal} aria-label="Close">X</button>

        {loading || !opp ? (
          <div className="loading-container" style={{ padding: 48 }}>
            <div className="loading-spinner" />
            <span style={{ marginTop: 12 }}>Loading full decision trail & strategy matrix...</span>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 16, marginBottom: 20 }}>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <span className={`badge ${opp.priority === 'critical' ? 'badge-critical' : opp.priority === 'high' ? 'badge-high' : 'badge-medium'}`}>
                  {opp.priority?.toUpperCase()} PRIORITY
                </span>
                <span className="badge badge-dim">{opp.status?.replace(/_/g, ' ')?.toUpperCase()}</span>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                {opp.title || 'Recovery Opportunity'}
              </h2>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Opportunity ID: <code style={{ color: 'var(--text-secondary)' }}>{opp.id}</code>
                {data.customer ? ` · Customer: ${data.customer.name || data.customer.id}` : ''}
              </div>
            </div>

            {/* Financial Summary Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              <div style={{ padding: '14px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div className="metric-label">Revenue at Risk</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-error)', marginTop: 4 }}>
                  {formatCurrency(opp.revenue_at_risk)}
                </div>
              </div>
              <div style={{ padding: '14px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div className="metric-label">Selected Expected Recovery</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-success)', marginTop: 4 }}>
                  {formatCurrency(selectedStrategy.expected_recovery || opp.expected_recovery)}
                </div>
              </div>
              <div style={{ padding: '14px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div className="metric-label">Recovery Confidence</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-brand)', marginTop: 4 }}>
                  {confPercent}%
                </div>
              </div>
            </div>

            {/* Root Cause Diagnosis */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Search size={16} /> Root Cause Diagnosis
              </h3>
              <div style={{ padding: '14px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--color-brand)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                  {opp.root_cause || 'Elevated transaction failure rate'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {opp.description || 'Deterministic telemetry signals indicate payment rail degradation requiring multi-method alternative flow.'}
                </div>
              </div>
            </div>

            {/* Evaluated Recovery Strategies Comparison */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={16} /> Evaluated Strategy Matrix (Ranked by Net Expected Recovery)
              </h3>
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-tertiary)', textAlign: 'left', color: 'var(--text-tertiary)' }}>
                      <th style={{ padding: '10px 12px' }}>Rank</th>
                      <th style={{ padding: '10px 12px' }}>Strategy Action</th>
                      <th style={{ padding: '10px 12px' }}>Probability</th>
                      <th style={{ padding: '10px 12px' }}>Gross Recovery</th>
                      <th style={{ padding: '10px 12px' }}>Costs / Friction</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Net Expected Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strategies.map((strat, idx) => {
                      const isSelected = strat.selected || idx === 0;
                      return (
                        <tr
                          key={strat.action}
                          style={{
                            background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                            borderTop: '1px solid var(--border-subtle)',
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          <td style={{ padding: '10px 12px' }}>
                            {isSelected ? (
                              <span className="badge badge-success" style={{ fontSize: 10 }}>#1 SELECTED</span>
                            ) : (
                              `#${idx + 1}`
                            )}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                              {strat.name || strat.action}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                              {strat.description}
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {((strat.recovery_probability || 0) * 100).toFixed(0)}%
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--color-success)' }}>
                            {formatCurrency(strat.expected_recovery)}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-tertiary)' }}>
                            -₹{Math.round((strat.intervention_cost || 0) + (strat.expected_risk_cost || 0))}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: isSelected ? 'var(--color-brand)' : 'var(--text-primary)' }}>
                            {formatCurrency(strat.net_expected_recovery)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Why This Action & Why Not Others Explanation */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-success)', marginBottom: 4 }}>
                  Why This Action Was Selected
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong>{selectedStrategy.name || selectedStrategy.action}</strong> yields the highest Net Expected Recovery ({formatCurrency(selectedStrategy.net_expected_recovery)}) among all policy-compatible interventions.
                </div>
              </div>
              <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                  Why Not Lower-Ranked Options?
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Silent retries had lower effectiveness due to rail degradation. Direct notification carried higher customer friction without alternative payment switching.
                </div>
              </div>
            </div>

            {/* 14-Point Policy Guardian Compliance Checklist */}
            <div style={{ marginBottom: 24 }}>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} /> 14-Point Policy Guardian Checklist
                </h3>
                <span className={`badge ${policyDecision.approved ? 'badge-success' : 'badge-warning'}`}>
                  {policyDecision.decision || 'APPROVED'}
                </span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {checks.map((c, idx) => (
                  <div
                    key={c.rule || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '8px 10px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                    }}
                  >
                    {c.passed ? (
                      <CheckCircle2 size={15} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: 1 }} />
                    ) : (
                      <AlertTriangle size={15} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 1 }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name || c.rule}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            {pendingIntervention && (
              <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleInterventionAction('approve', pendingIntervention.id)}
                  disabled={acting}
                  style={{ flex: 1 }}
                >
                  <Check size={14} /> Authorize & Execute Intervention
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => handleInterventionAction('reject', pendingIntervention.id)}
                  disabled={acting}
                  style={{ color: 'var(--color-error)' }}
                >
                  <X size={14} /> Reject
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardState } from '@/hooks/useDashboardState';
import { showToast } from './Toast';
import {
  Search,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Check,
  X,
  Zap,
  CheckCircle,
  FileText,
  ChevronDown,
  ChevronRight,
  GitCompare,
  Receipt
} from 'lucide-react';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function DecisionExplanationModal() {
  const { state, closeModal, triggerRefresh } = useDashboardState();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [simulating, setSimulating] = useState(false);

  // Accordion section visibility
  const [showStrategies, setShowStrategies] = useState(false);
  const [showPolicyChecks, setShowPolicyChecks] = useState(false);
  const [showExecution, setShowExecution] = useState(true);
  const [showTransactions, setShowTransactions] = useState(true);

  // Feature #1: Live policy checklist animation state
  const [policyAnimationComplete, setPolicyAnimationComplete] = useState(false);

  // Feature #4: AI vs Fallback diff toggle
  const [showFallbackDiff, setShowFallbackDiff] = useState(false);

  const fetchOpportunityDetail = async () => {
    if (!state.isOpportunityModalOpen || !state.selectedOpportunityId) return;
    setLoading(true);
    setPolicyAnimationComplete(false);
    try {
      const res = await fetch(`/api/opportunities/${state.selectedOpportunityId}?merchant_id=${state.merchantId}`);
      if (!res.ok) throw new Error('Fetch failed');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('[DecisionExplanationModal] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpportunityDetail();
  }, [state.selectedOpportunityId, state.isOpportunityModalOpen, state.merchantId]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    if (state.isOpportunityModalOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [state.isOpportunityModalOpen, closeModal]);

  if (!state.isOpportunityModalOpen) return null;

  const handleInterventionApproval = async (action, interventionId) => {
    setActing(true);
    try {
      const res = await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervention_id: interventionId, action }),
      });
      const resJson = await res.json();
      if (res.ok) {
        showToast(
          action === 'approve' ? 'Opportunity approved' : 'Opportunity rejected',
          action === 'approve' ? 'success' : 'info'
        );
        fetchOpportunityDetail();
        triggerRefresh();
      } else {
        showToast(`Action failed: ${resJson.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setActing(false);
    }
  };

  const handleSimulatePayment = async (interventionId) => {
    setSimulating(true);
    try {
      const res = await fetch('/api/agent/simulate-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervention_id: interventionId, recovered: true }),
      });
      const resJson = await res.json();
      if (res.ok) {
        if (resJson.attribution_id) {
          showToast(`Recovery confirmed: ₹${resJson.recovered_amount?.toLocaleString('en-IN')} (Attributed 1:1)`, 'success');
        } else {
          showToast(resJson.message || 'Payment outcome recorded', 'info');
        }
        fetchOpportunityDetail();
        triggerRefresh();
      } else {
        showToast(`Simulation failed: ${resJson.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSimulating(false);
    }
  };

  const opp = data?.opportunity;
  const customer = data?.customer;
  const strategies = data?.strategies || [];
  const selectedStrategy = data?.selected_strategy || strategies[0] || {};
  const policyDecision = data?.policy_decision || {};
  const checks = policyDecision.checks || [];
  const interventions = data?.interventions || [];
  const pendingIntervention = interventions.find((i) => i.approval_status === 'awaiting_approval');
  const latestExecutedIntervention = interventions.find((i) => i.execution_status === 'executed');

  // Authoritative Deterministic Recovery Confidence
  const confPercent = opp ? Math.round((opp.recovery_probability || 0) * 100) : 0;

  // Authoritative Autonomy Decision: Derived directly from Policy Guardian evaluation
  let autonomyStatus = 'AUTONOMOUS';
  let autonomyBadgeClass = 'badge-success';

  if (policyDecision.decision === 'BLOCKED' || opp?.status === 'blocked') {
    autonomyStatus = 'BLOCKED';
    autonomyBadgeClass = 'badge-critical';
  } else if (!policyDecision.approved || policyDecision.requires_human || policyDecision.decision === 'REVIEW_REQUIRED' || opp?.status === 'awaiting_approval') {
    autonomyStatus = 'REVIEW REQUIRED';
    autonomyBadgeClass = 'badge-warning';
  }

  // Feature #4: Compute fallback comparison from root cause data
  const diagnosis = data?.diagnosis;
  const hasDiffData = diagnosis && diagnosis.showDiff;

  // Count passed/failed checks
  const passedCount = checks.filter(c => c.passed).length;
  const totalChecks = checks.length || 14;

  return (
    <div className="modal-overlay" onClick={closeModal} role="dialog" aria-modal="true" aria-labelledby="modal-decision-title">
      <div className="modal-surface" style={{ maxWidth: 840 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`badge badge-${opp?.priority === 'critical' ? 'critical' : opp?.priority === 'high' ? 'high' : 'medium'}`}>
              {opp?.priority?.toUpperCase() || 'MEDIUM'}
            </span>
            <span id="modal-decision-title" className="modal-title">
               {opp?.title || 'Recovery Opportunity'}
            </span>
          </div>
          <button className="btn-icon" onClick={closeModal} aria-label="Close dialog">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {loading || !opp ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <div className="spin" style={{ width: 20, height: 20, border: '2px solid var(--color-brand)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 10px' }} />
              <div>Loading...</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 1. Immediate Decision Clarity Viewport */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <div style={{ background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                    Revenue at Risk
                  </div>
                  <div className="mono-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-error)', marginTop: 1 }}>
                    {formatCurrency(opp.revenue_at_risk)}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                    Expected Recovery
                  </div>
                  <div className="mono-num text-success" style={{ fontSize: 16, fontWeight: 700, marginTop: 1 }}>
                    {formatCurrency(selectedStrategy.net_expected_recovery || selectedStrategy.netExpectedRecovery || opp.expected_recovery)}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                    Recovery Confidence
                  </div>
                  <div className="mono-num" style={{ fontSize: 16, fontWeight: 700, color: confPercent >= 70 ? 'var(--color-success)' : 'var(--color-warning)', marginTop: 1 }}>
                    {confPercent}%
                  </div>
                </div>

                <div style={{ background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                    Policy Decision
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <span className={`badge ${autonomyBadgeClass}`} style={{ fontSize: 9 }}>
                      {autonomyStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Root Cause & Recommended Action Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-brand)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                    Root Cause Diagnosis
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', marginTop: 2 }}>
                    {opp.root_cause || 'Payment rail degradation'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {opp.root_cause_reason || 'Elevated failure rate on payment rail'}
                  </div>
                </div>

                <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-success)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                    Recommended Action
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedStrategy.name || selectedStrategy.action?.replace(/_/g, ' ') || 'Create Payment Link'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Highest net expected recovery among eligible strategies.
                  </div>
                </div>
              </div>

              {/* Customer context summary row if present */}
              {customer && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <div>
                    Customer: <strong style={{ color: 'var(--text-primary)' }}>{customer.name || customer.id}</strong> ({customer.email || 'guest'})
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span>Failures: <strong style={{ color: 'var(--text-primary)' }}>{customer.recent_failures || customer.failure_count || 0} / 30d</strong></span>
                    {customer.ltv ? <span>LTV: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(customer.ltv)}</strong></span> : null}
                  </div>
                </div>
              )}

              {/* Affected Transactions Section */}
              {data?.affected_transactions && data.affected_transactions.length > 0 && (
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setShowTransactions(!showTransactions)}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Receipt size={13} />
                      Affected Failed Transactions ({data.affected_transactions.length})
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="badge badge-critical" style={{ fontSize: 9 }}>
                        {data.affected_transactions.length} FAILED
                      </span>
                      {showTransactions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                  </button>

                  <AnimatePresence>
                    {showTransactions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="fintech-table-container" style={{ maxHeight: 220, overflowY: 'auto' }}>
                          <table className="fintech-table" style={{ fontSize: 11 }}>
                            <thead>
                              <tr>
                                <th>Transaction ID</th>
                                <th>Method</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                                <th>Failure Reason</th>
                                <th style={{ textAlign: 'right' }}>Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.affected_transactions.map((tx) => (
                                <tr key={tx.id}>
                                  <td>
                                    <code className="mono-num" style={{ fontSize: 11, color: 'var(--text-primary)' }}>{tx.id}</code>
                                  </td>
                                  <td>
                                    <span style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                                      {tx.method || 'card'}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <span className="mono-num" style={{ fontWeight: 600, color: 'var(--color-error)' }}>
                                      {formatCurrency(tx.amount)}
                                    </span>
                                  </td>
                                  <td>
                                    <span style={{ color: 'var(--color-error)' }}>
                                      {(tx.failure_reason || tx.error_code || 'payment_failed').replace(/_/g, ' ')}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                                    {tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* 3. Section: Strategy Comparison Matrix */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button
                  onClick={() => setShowStrategies(!showStrategies)}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={13} />
                    Compare Alternatives
                  </span>
                  {showStrategies ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {showStrategies && (
                  <div className="fintech-table-container">
                    <table className="fintech-table">
                      <thead>
                        <tr>
                          <th style={{ width: 70 }}>Rank</th>
                          <th>Action</th>
                          <th style={{ textAlign: 'center', width: 75 }}>Probability</th>
                          <th style={{ textAlign: 'right' }}>Gross Value</th>
                          <th style={{ textAlign: 'right' }}>Costs</th>
                          <th style={{ textAlign: 'right' }}>Net Expected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategies.map((strat, idx) => {
                          const isSelected = strat.selected || idx === 0;
                          return (
                            <tr
                              key={strat.action || idx}
                              style={{
                                background: isSelected ? 'var(--color-brand-muted)' : 'transparent',
                                fontWeight: isSelected ? 600 : 400,
                              }}
                            >
                              <td>
                                {isSelected ? (
                                  <span className="badge badge-success" style={{ fontSize: 8 }}>#1 SELECTED</span>
                                ) : (
                                  <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>#{idx + 1}</span>
                                )}
                              </td>
                              <td style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                {strat.name || strat.action?.replace(/_/g, ' ')}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className="mono-num">{Math.round((strat.recovery_probability || 0) * 100)}%</span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className="mono-num text-success">{formatCurrency(strat.expected_recovery)}</span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className="mono-num" style={{ color: 'var(--text-dim)' }}>
                                  -₹{Math.round((strat.intervention_cost || 0) + (strat.expected_risk_cost || 0))}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className="mono-num" style={{ fontWeight: 700, color: isSelected ? 'var(--color-brand-light)' : 'var(--text-primary)', fontSize: 12 }}>
                                  {formatCurrency(strat.net_expected_recovery)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ═══ Feature #1: Live Policy Checklist Widget ═══ */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button
                  onClick={() => { setShowPolicyChecks(!showPolicyChecks); setPolicyAnimationComplete(false); }}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={13} />
                    Policy Guardian — 14 Safety Checks
                  </span>
                  <span className={`badge ${policyDecision.approved ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: 9 }}>
                    {passedCount} / {totalChecks} Passed
                  </span>
                </button>

                <AnimatePresence>
                  {showPolicyChecks && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                        {checks.map((c, idx) => (
                          <motion.div
                            key={c.rule || idx}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.12, duration: 0.25, ease: 'easeOut' }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 8px',
                              background: 'var(--bg-tertiary)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 11,
                              border: `1px solid ${c.passed ? 'var(--color-success-border)' : 'var(--color-warning-border)'}`,
                            }}
                          >
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: idx * 0.12 + 0.1, duration: 0.2, type: 'spring', stiffness: 300 }}
                            >
                              {c.passed ? (
                                <CheckCircle2 size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                              ) : (
                                <AlertTriangle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                              )}
                            </motion.div>
                            <div style={{ minWidth: 0, flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || c.rule}</span>
                              {c.actual && <span className="mono-num" style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>{c.actual}</span>}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ═══ Feature #4: AI vs Fallback Diff View ═══ */}
              {diagnosis && (
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setShowFallbackDiff(!showFallbackDiff)}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <GitCompare size={13} />
                      AI vs Rule-Based Fallback
                    </span>
                    {hasDiffData ? (
                      <span className="badge badge-warning" style={{ fontSize: 9 }}>DIFFERS</span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: 9 }}>AGREE</span>
                    )}
                  </button>

                  <AnimatePresence>
                    {showFallbackDiff && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}
                      >
                        {hasDiffData ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                            {/* AI Diagnosis */}
                            <div style={{ padding: 10, borderRight: '1px solid var(--border-subtle)' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-brand-light)', marginBottom: 6 }}>
                                AI Diagnosis (Gemini)
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                                {diagnosis.ai?.root_cause || opp.root_cause || '—'}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Action: <strong>{diagnosis.ai?.recommended_action?.replace(/_/g, ' ') || '—'}</strong>
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                Confidence: <span className="mono-num">{Math.round((diagnosis.ai?.confidence || 0) * 100)}%</span>
                                {' · '}Risk: <span style={{ textTransform: 'capitalize' }}>{diagnosis.ai?.risk_level || '—'}</span>
                              </div>
                            </div>
                            {/* Fallback Diagnosis */}
                            <div style={{ padding: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                                Rule-Based Fallback
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                                {diagnosis.fallback?.root_cause || '—'}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Action: <strong>{diagnosis.fallback?.recommended_action?.replace(/_/g, ' ') || '—'}</strong>
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                Confidence: <span className="mono-num">{Math.round((diagnosis.fallback?.confidence || 0) * 100)}%</span>
                                {' · '}Risk: <span style={{ textTransform: 'capitalize' }}>{diagnosis.fallback?.risk_level || '—'}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle2 size={14} style={{ color: 'var(--color-success)' }} />
                            AI and rule-based fallback agree on root cause and recommended action.
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* 5. Section: Execution & Attribution Status */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 12, background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={13} />
                  Recovery Status
                </div>

                {latestExecutedIntervention ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="flex-between" style={{ fontSize: 11 }}>
                      <div>
                        Status:{' '}
                        <strong style={{ color: opp.status === 'recovered' ? 'var(--color-success)' : 'var(--color-brand-light)' }}>
                          {opp.status === 'recovered' ? 'Payment Recovered' : 'Payment Link Dispatched'}
                        </strong>
                      </div>
                      {latestExecutedIntervention.razorpay_payment_link_id && (
                        <div style={{ color: 'var(--text-tertiary)' }}>
                          Link ID: <code style={{ color: 'var(--text-primary)' }}>{latestExecutedIntervention.razorpay_payment_link_id}</code>
                        </div>
                      )}
                    </div>

                    {opp.status === 'recovered' ? (
                      <div style={{ padding: '8px 10px', background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)' }}>
                            Recovered: {formatCurrency(opp.actual_recovery || opp.expected_recovery)}
                          </span>
                        </div>
                        <span className="badge badge-success" style={{ fontSize: 8 }}>
                          Attributed 1:1
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          Confirm customer payment recovery:
                        </span>
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleSimulatePayment(latestExecutedIntervention.id)}
                          disabled={simulating}
                          id="simulate-recovery-btn"
                        >
                          <CheckCircle2 size={11} />
                          {simulating ? 'Processing...' : 'Confirm Recovery'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : pendingIntervention ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Intervention queued and awaiting human authorization.
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleInterventionApproval('approve', pendingIntervention.id)}
                        disabled={acting}
                        id="approve-intervention-btn"
                      >
                        <Check size={11} /> Authorize & Execute
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleInterventionApproval('reject', pendingIntervention.id)}
                        disabled={acting}
                        style={{ color: 'var(--color-error)' }}
                      >
                        <X size={11} /> Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    No intervention executed yet. Run agent or approve recommended actions.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

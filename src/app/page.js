'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Formatting Helpers ────────────────────────────────────────

function formatCurrency(amount) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${Math.round(amount).toLocaleString()}`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function getStepIcon(type) {
  const icons = {
    observe: '🔍', detect: '📡', opportunity_created: '🎯',
    investigate: '🔬', root_cause: '🩺', evaluate: '📊',
    options_calculated: '⚖️', recommendation: '🧠', policy_check: '🛡️',
    policy_result: '✅', execute: '⚡', tool_result: '✓',
    tool_failed: '✗', retry: '🔄', retry_success: '✓', retry_failed: '✗',
    action_blocked: '🚫', observe_mode: '👁️', review_mode: '⏸️',
    complete: '🏁', error: '❌', kill_switch: '🔴',
    decision: '💡',
  };
  return icons[type] || '●';
}

function getStepClass(type) {
  if (['tool_result', 'complete', 'retry_success'].includes(type)) return 'success';
  if (['tool_failed', 'retry_failed', 'error', 'action_blocked'].includes(type)) return 'failed';
  if (['policy_check', 'review_mode'].includes(type)) return 'warning';
  return '';
}

function getPriorityLabel(priority) {
  const labels = { critical: '!', high: '↑', medium: '–', low: '↓' };
  return labels[priority] || '–';
}

function getStatusBadge(status) {
  const map = {
    detected: { label: 'Detected', cls: 'blue' },
    investigating: { label: 'Investigating', cls: 'blue' },
    analyzed: { label: 'Analyzed', cls: 'purple' },
    recommended: { label: 'Recommended', cls: 'purple' },
    awaiting_approval: { label: 'Awaiting Approval', cls: 'amber' },
    action_executed: { label: 'Executed', cls: 'blue' },
    recovered: { label: 'Recovered', cls: 'green' },
    not_recovered: { label: 'Not Recovered', cls: 'red' },
    execution_failed: { label: 'Failed', cls: 'red' },
    policy_rejected: { label: 'Policy Rejected', cls: 'red' },
    merchant_rejected: { label: 'Rejected', cls: 'red' },
  };
  return map[status] || { label: status, cls: 'dim' };
}

// ─── Main Page ─────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agentRunning, setAgentRunning] = useState(false);
  const [latestRun, setLatestRun] = useState(null);
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [mode, setMode] = useState('autonomous');

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      const json = await res.json();
      setData(json);
      setMode(json.merchant?.operating_mode || 'autonomous');
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Run the agent
  const runAgent = async () => {
    setAgentRunning(true);
    setLatestRun(null);
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: 'merchant_demo', trigger: 'manual' }),
      });
      const result = await res.json();
      setLatestRun(result);
      await fetchData(); // refresh dashboard
    } catch (err) {
      console.error('Agent run failed:', err);
      setLatestRun({ outcome: 'error', steps: [{ type: 'error', detail: err.message, timestamp: new Date().toISOString() }] });
    } finally {
      setAgentRunning(false);
    }
  };

  // Change operating mode
  const changeMode = async (newMode) => {
    setMode(newMode);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operating_mode: newMode }),
      });
      await fetchData();
    } catch (err) {
      console.error('Mode change failed:', err);
    }
  };

  // Approve intervention
  const handleApproval = async (intervention_id, action) => {
    try {
      await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervention_id, action }),
      });
      await fetchData();
    } catch (err) {
      console.error('Approval failed:', err);
    }
  };

  // Simulate recovery
  const simulateRecovery = async (intervention_id) => {
    try {
      await fetch('/api/agent/simulate-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervention_id, recovered: true }),
      });
      await fetchData();
    } catch (err) {
      console.error('Simulation failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="app-layout">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          Loading Revenue Intelligence Agent...
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || {};
  const opportunities = data?.opportunities || [];
  const pendingApprovals = data?.pending_approvals || [];
  const interventions = data?.interventions || [];
  const auditLogs = data?.audit_logs || [];

  // Pick the latest run to display (from agent response or from data)
  const displayRun = latestRun || (data?.agent_runs?.[0] || null);

  return (
    <div className="app-layout">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header-left">
          <div>
            <div className="app-logo">Revenue Intelligence Agent</div>
            <div className="app-logo-sub">{data?.merchant?.name || 'Merchant'} · Opportunity Engine</div>
          </div>
        </div>
        <div className="app-header-right">
          <div className="mode-switcher">
            {['observe', 'review', 'autonomous'].map(m => (
              <button
                key={m}
                className={`mode-option ${mode === m ? 'active' : ''}`}
                onClick={() => changeMode(m)}
              >
                {m === 'observe' ? '👁️ Observe' : m === 'review' ? '⏸️ Review' : '⚡ Autonomous'}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            onClick={runAgent}
            disabled={agentRunning}
          >
            {agentRunning ? (
              <><div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div> Running...</>
            ) : (
              '▶ Run Agent'
            )}
          </button>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────── */}
      <main className="app-main">
        {/* Metrics Strip */}
        <div className="metrics-strip animate-in">
          <div className="metric-cell">
            <span className="metric-label">Revenue at Risk</span>
            <span className="metric-value danger">{formatCurrency(metrics.revenue_at_risk || 0)}</span>
            <span className="metric-sub">{metrics.failed_payments || 0} failed payments</span>
          </div>
          <div className="metric-cell">
            <span className="metric-label">Failure Rate</span>
            <span className="metric-value warning">{formatPercent(metrics.failure_rate || 0)}</span>
            <span className="metric-sub">{metrics.total_payments || 0} total payments</span>
          </div>
          <div className="metric-cell">
            <span className="metric-label">Recovered</span>
            <span className="metric-value success">{formatCurrency(metrics.total_recovered || 0)}</span>
            <span className="metric-sub">{formatPercent(metrics.recovery_rate || 0)} recovery rate</span>
          </div>
          <div className="metric-cell">
            <span className="metric-label">Total Revenue</span>
            <span className="metric-value neutral">{formatCurrency(metrics.total_revenue || 0)}</span>
            <span className="metric-sub">{metrics.successful_payments || 0} successful</span>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="dashboard-grid">
          {/* ── Left Column ──────────────────────────────────── */}
          <div>
            {/* Pending Approvals */}
            {pendingApprovals.length > 0 && (
              <div className="section animate-in">
                <div className="section-header">
                  <span className="section-title">⏳ Awaiting Approval</span>
                  <span className="badge amber">{pendingApprovals.length}</span>
                </div>
                <div className="opportunity-list">
                  {pendingApprovals.map(intv => (
                    <div key={intv.id} className="opportunity-item high" style={{ flexWrap: 'wrap' }}>
                      <div className="opportunity-info">
                        <div className="opportunity-title">
                          {intv.action_type?.replace(/_/g, ' ')} — {formatCurrency(intv.expected_recovery)}
                        </div>
                        <div className="opportunity-meta">
                          <span>Confidence: {(intv.confidence * 100).toFixed(0)}%</span>
                          <span>Risk: {intv.risk_level}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-success btn-sm" onClick={() => handleApproval(intv.id, 'approve')}>
                          ✓ Approve
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleApproval(intv.id, 'reject')}>
                          ✗ Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Opportunities */}
            <div className="section animate-in">
              <div className="section-header">
                <span className="section-title">Revenue Opportunities</span>
                <span className="badge blue">{opportunities.length}</span>
              </div>
              {opportunities.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📊</div>
                  <div>No opportunities detected yet.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Click "Run Agent" to scan for revenue leakage.</div>
                </div>
              ) : (
                <div className="opportunity-list">
                  {opportunities.map((opp, i) => {
                    const statusBadge = getStatusBadge(opp.status);
                    return (
                      <div
                        key={opp.id}
                        className={`opportunity-item ${opp.priority}`}
                        onClick={() => setSelectedOpp(selectedOpp?.id === opp.id ? null : opp)}
                      >
                        <div className={`opportunity-priority ${opp.priority}`}>
                          {getPriorityLabel(opp.priority)}
                        </div>
                        <div className="opportunity-info">
                          <div className="opportunity-title">{opp.title}</div>
                          <div className="opportunity-meta">
                            <span className={`badge ${statusBadge.cls}`}>{statusBadge.label}</span>
                            <span>{formatPercent(opp.recovery_probability)} recovery chance</span>
                          </div>
                        </div>
                        <div className="opportunity-amounts">
                          <div className="opportunity-risk">{formatCurrency(opp.revenue_at_risk)}</div>
                          <div className="opportunity-expected">
                            {formatCurrency(opp.expected_recovery)} expected
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Opportunity Detail */}
            {selectedOpp && (
              <div className="section animate-in">
                <div className="detail-panel">
                  <div className="detail-panel-header">
                    <span className="detail-panel-title">Why This Action?</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedOpp(null)}>Close</button>
                  </div>
                  <div className="detail-panel-body">
                    {selectedOpp.root_cause && (
                      <div className="explanation">
                        <div className="explanation-section">
                          <div className="explanation-label">Root Cause</div>
                          <div className="explanation-text">{selectedOpp.root_cause}</div>
                        </div>
                        <div className="explanation-section">
                          <div className="explanation-label">Confidence</div>
                          <div className="explanation-text">{(selectedOpp.root_cause_confidence * 100).toFixed(0)}%</div>
                          <div className="confidence-bar">
                            <div
                              className={`confidence-fill ${selectedOpp.root_cause_confidence >= 0.8 ? 'high' : selectedOpp.root_cause_confidence >= 0.6 ? 'medium' : 'low'}`}
                              style={{ width: `${selectedOpp.root_cause_confidence * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="explanation-section">
                          <div className="explanation-label">Expected Recovery</div>
                          <div className="explanation-text">{formatCurrency(selectedOpp.expected_recovery)}</div>
                        </div>
                        {selectedOpp.actual_recovery > 0 && (
                          <div className="explanation-section">
                            <div className="explanation-label">Actual Recovery</div>
                            <div className="explanation-text" style={{ color: 'var(--accent-green)' }}>
                              {formatCurrency(selectedOpp.actual_recovery)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ marginTop: 12 }}>
                      <div className="detail-row">
                        <span className="detail-label">Type</span>
                        <span className="detail-value">{selectedOpp.type?.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Priority</span>
                        <span className="detail-value">
                          <span className={`badge ${selectedOpp.priority === 'critical' ? 'red' : selectedOpp.priority === 'high' ? 'amber' : 'blue'}`}>
                            {selectedOpp.priority}
                          </span>
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Revenue at Risk</span>
                        <span className="detail-value" style={{ color: 'var(--accent-red)' }}>{formatCurrency(selectedOpp.revenue_at_risk)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Interventions</span>
                        <span className="detail-value">{selectedOpp.intervention_count} / {selectedOpp.max_interventions}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Executed Interventions with Simulate Recovery */}
            {interventions.filter(i => i.execution_status === 'executed' && !i.resolved_at).length > 0 && (
              <div className="section animate-in">
                <div className="section-header">
                  <span className="section-title">Awaiting Outcome</span>
                </div>
                <div className="opportunity-list">
                  {interventions.filter(i => i.execution_status === 'executed' && !i.resolved_at).map(intv => (
                    <div key={intv.id} className="opportunity-item medium">
                      <div className="opportunity-info">
                        <div className="opportunity-title">{intv.action_type?.replace(/_/g, ' ')}</div>
                        <div className="opportunity-meta">
                          <span>Expected: {formatCurrency(intv.expected_recovery)}</span>
                        </div>
                      </div>
                      <button className="btn btn-success btn-sm" onClick={() => simulateRecovery(intv.id)}>
                        💰 Simulate Payment
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right Column: Agent Activity ──────────────────── */}
          <div>
            <div className="section">
              <div className="section-header">
                <span className="section-title">Agent Activity</span>
                {displayRun && (
                  <span className={`badge ${displayRun.outcome === 'executed' ? 'green' : displayRun.outcome === 'error' ? 'red' : 'blue'}`}>
                    {displayRun.outcome}
                  </span>
                )}
              </div>

              {displayRun ? (
                <div className="timeline">
                  {(displayRun.steps || []).map((step, i) => {
                    const detail = typeof step.detail === 'object' ? step.detail : null;
                    const detailText = typeof step.detail === 'string' ? step.detail : null;

                    return (
                      <div key={i} className={`timeline-step ${getStepClass(step.type)}`}>
                        <div className="timeline-time">
                          {getStepIcon(step.type)} {formatTime(step.timestamp)} · {step.elapsed_ms}ms
                        </div>
                        <div className="timeline-title">
                          {step.type.replace(/_/g, ' ')}
                        </div>
                        <div className="timeline-detail">
                          {detailText && detailText}
                          {detail && (
                            <>
                              {detail.anomalies_found !== undefined && (
                                <div>{detail.anomalies_found} anomalies, {detail.failed_payments} failures, {formatCurrency(detail.revenue_at_risk || 0)} at risk</div>
                              )}
                              {detail.cause && <div>{detail.cause}</div>}
                              {detail.confidence !== undefined && detail.cause && (
                                <div>Confidence: {(detail.confidence * 100).toFixed(0)}%</div>
                              )}
                              {detail.action && <div>Action: {detail.action.replace(/_/g, ' ')}</div>}
                              {detail.reason && <div>{detail.reason}</div>}
                              {detail.approved !== undefined && (
                                <div>{detail.approved ? '✅ Approved' : '❌ Rejected'}: {detail.reason}</div>
                              )}
                              {detail.checks && (
                                <div className="check-list" style={{ marginTop: 6 }}>
                                  {detail.checks.map((c, j) => (
                                    <div key={j} className={`check-item ${c.passed ? 'passed' : 'failed'}`}>
                                      <span className="check-icon">{c.passed ? '✓' : '✗'}</span>
                                      <span className="check-text">{c.name.replace(/_/g, ' ')}: {c.detail}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {detail.payment_link_id && <div>Link: {detail.payment_link_id}</div>}
                              {detail.options && (
                                <div style={{ marginTop: 4 }}>
                                  {detail.options.map((o, j) => (
                                    <div key={j} style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                                      {o.action.replace(/_/g, ' ')} → {formatCurrency(o.expected_recovery)}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">🤖</div>
                  <div>No agent activity yet.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Run the agent to see its reasoning here.</div>
                </div>
              )}
            </div>

            {/* Audit Trail */}
            {auditLogs.length > 0 && (
              <div className="section">
                <div className="section-header">
                  <span className="section-title">Audit Trail</span>
                  <span className="badge dim">{auditLogs.length}</span>
                </div>
                <div className="opportunity-list">
                  {auditLogs.slice(0, 10).map((log, i) => (
                    <div key={i} className="opportunity-item low" style={{ cursor: 'default' }}>
                      <div className="opportunity-info">
                        <div className="opportunity-title" style={{ fontSize: 12 }}>
                          {log.event_type.replace(/_/g, ' ')}
                        </div>
                        <div className="opportunity-meta">
                          <span>{formatTime(log.created_at)}</span>
                          {log.event_data?.revenue_at_risk && (
                            <span>{formatCurrency(log.event_data.revenue_at_risk)}</span>
                          )}
                          {log.event_data?.amount && (
                            <span>{formatCurrency(log.event_data.amount)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

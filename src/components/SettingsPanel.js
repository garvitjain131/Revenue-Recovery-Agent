'use client';

import { useState, useEffect } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { showToast } from './Toast';
import {
  Sliders,
  Save,
  Play,
  RotateCcw,
  BarChart3,
  RefreshCw
} from 'lucide-react';

export function SettingsPanel() {
  const { state, toggleSettings, triggerRefresh } = useDashboardState();
  const [settings, setSettings] = useState({
    operating_mode: 'autonomous',
    max_auto_transaction: 25000,
    high_value_threshold: 100000,
    minimum_confidence: 70,
    min_expected_recovery: 500,
    daily_recovery_budget: 50000,
    max_recovery_attempts: 3,
    contact_start_hour: 8,
    contact_cutoff_hour: 22,
    kill_switch: false,
  });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Feature #6: What-if impact data
  const [opportunities, setOpportunities] = useState([]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`/api/settings?merchant_id=${state.merchantId}`);
        if (!res.ok) return;
        const data = await res.json();
        setSettings((prev) => ({
          ...prev,
          operating_mode: data.operating_mode || 'autonomous',
          ...data.guardrails,
          minimum_confidence: Math.round((data.guardrails?.minimum_confidence || 0.7) * 100),
        }));
      } catch (err) {
        console.error('[SettingsPanel] Fetch failed:', err);
      }
    };
    if (state.isSettingsPanelOpen) {
      fetchSettings();
      // Feature #6: Fetch opportunities for what-if computation
      const fetchOpps = async () => {
        try {
          const res = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
          if (res.ok) {
            const data = await res.json();
            setOpportunities(data.opportunities || []);
          }
        } catch {}
      };
      fetchOpps();
    }
  }, [state.merchantId, state.isSettingsPanelOpen]);

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardrails = { ...settings };
      const operating_mode = guardrails.operating_mode;
      delete guardrails.operating_mode;
      guardrails.minimum_confidence = guardrails.minimum_confidence / 100;

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: state.merchantId,
          operating_mode,
          guardrails,
        }),
      });

      if (res.ok) {
        showToast('Guardrails saved', 'success');
        triggerRefresh();
        toggleSettings();
      } else {
        showToast('Failed to save guardrails', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStats, setProcessStats] = useState(null);

  const handleRunAgent = async () => {
    try {
      showToast('Agent batch processing initiated...', 'info');
      setIsProcessing(true);
      const res = await fetch('/api/agent/run', { method: 'POST', body: JSON.stringify({ merchant_id: state.merchantId, batch: true }) });
      if (res.ok) {
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/agent/status?merchant_id=${state.merchantId}`);
            if (statusRes.ok) {
              const data = await statusRes.json();
              const counts = data.counts || {};
              const processing = counts['processing'] || 0;
              const detected = counts['detected'] || 0;
              const executed = counts['action_executed'] || 0;
              const blocked = counts['blocked'] || 0;
              
              setProcessStats({ processing, detected, executed, blocked });
              triggerRefresh();

              if (processing === 0 && detected === 0) {
                clearInterval(pollInterval);
                setIsProcessing(false);
                showToast('Batch processing completed successfully!', 'success');
              }
            }
          } catch (err) {
            console.error('Polling error', err);
          }
        }, 3000);
      } else {
        setIsProcessing(false);
        showToast('Failed to start batch processing', 'error');
      }
    } catch (err) {
      setIsProcessing(false);
      showToast('Error starting agent', 'error');
    }
  };

  const handleResetDemo = async () => {
    if (!confirm('Reset all demo data? This cannot be undone.')) return;
    try {
      showToast('Resetting demo data...', 'info');
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      if (res.ok) {
        showToast('Demo data reset', 'success');
        triggerRefresh();
        toggleSettings();
      }
    } catch {}
  };

  const handleSync = async () => {
    setSyncing(true);
    showToast('Syncing with Razorpay...', 'info');
    try {
      const res = await fetch(`/api/merchants/sync`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: state.merchantId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          showToast(`Synced! Fetched ${data.details?.payments?.imported || 0} payments.`, 'success');
          triggerRefresh(); // Refresh dashboard data
        } else {
          showToast(data.error || 'Failed to sync with Razorpay', 'error');
        }
      } else {
        showToast('API Error during sync', 'error');
      }
    } catch (err) {
      showToast('Network error during sync', 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (!state.isSettingsPanelOpen) return null;

  return (
    <div className="modal-overlay" onClick={toggleSettings} role="dialog" aria-modal="true">
      <div className="modal-surface" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sliders size={15} />
            Policy Guardrail Configuration
          </div>
          <button className="btn-icon" onClick={toggleSettings} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Live API Integration */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Live API Integration</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleSync}
                disabled={syncing}
                style={{ fontSize: 11, padding: '4px 10px', height: 'auto' }}
              >
                <RefreshCw size={12} className={syncing ? 'spin' : ''} />
                {syncing ? 'Syncing...' : 'Sync Razorpay Data'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Keys are loaded from <code>.env.local</code>. Click sync to fetch the latest 100 payments and customers from your Razorpay test environment.
            </div>
          </div>

          {/* 1. Operating Mode */}
          <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Operating Autonomy Mode
            </div>
            <div className="segmented-control" style={{ width: '100%', display: 'flex' }}>
              {['observe', 'review', 'autonomous'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`segmented-btn ${settings.operating_mode === mode ? 'active' : ''}`}
                  onClick={() => handleChange('operating_mode', mode)}
                  style={{ flex: 1, padding: '5px 8px', textAlign: 'center' }}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
              {settings.operating_mode === 'observe' && 'Observe mode: Recommendations logged without execution.'}
              {settings.operating_mode === 'review' && 'Review mode: Interventions require merchant sign-off.'}
              {settings.operating_mode === 'autonomous' && 'Autonomous execution enabled for eligible low-risk actions.'}
            </div>
          </div>

          {/* 2. Financial Limits */}
          <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
              Financial Limits
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="flex-between">
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>Daily Recovery Budget</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>₹</span>
                  <input
                    type="number"
                    value={settings.daily_recovery_budget}
                    onChange={(e) => handleChange('daily_recovery_budget', parseInt(e.target.value) || 0)}
                    style={{ width: 95, padding: '4px 6px', textAlign: 'right', background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div className="flex-between">
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>Maximum Autonomous Transaction</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>₹</span>
                  <input
                    type="number"
                    value={settings.max_auto_transaction}
                    onChange={(e) => handleChange('max_auto_transaction', parseInt(e.target.value) || 0)}
                    style={{ width: 95, padding: '4px 6px', textAlign: 'right', background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div className="flex-between">
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>High-Value Escalation Threshold</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>₹</span>
                  <input
                    type="number"
                    value={settings.high_value_threshold}
                    onChange={(e) => handleChange('high_value_threshold', parseInt(e.target.value) || 0)}
                    style={{ width: 95, padding: '4px 6px', textAlign: 'right', background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div className="flex-between">
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>Minimum Recovery Confidence</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    value={settings.minimum_confidence}
                    onChange={(e) => handleChange('minimum_confidence', parseInt(e.target.value))}
                    style={{ width: 80 }}
                  />
                  <span className="mono-num" style={{ fontSize: 12, fontWeight: 700, minWidth: 32, textAlign: 'right' }}>
                    {settings.minimum_confidence}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ Feature #6: What-if Impact Preview ═══ */}
          {opportunities.length > 0 && (
            <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart3 size={13} />
                Impact Preview — {opportunities.length} open opportunities
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
                With confidence floor at <strong>{settings.minimum_confidence}%</strong> and max auto transaction at <strong>₹{(settings.max_auto_transaction || 0).toLocaleString('en-IN')}</strong>:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {(() => {
                  const confThreshold = (settings.minimum_confidence || 70) / 100;
                  const maxAuto = settings.max_auto_transaction || 25000;
                  const highValue = settings.high_value_threshold || 100000;

                  let autoCount = 0, reviewCount = 0, blockCount = 0;
                  for (const opp of opportunities) {
                    const conf = opp.recovery_probability || 0;
                    const amount = opp.revenue_at_risk || 0;
                    if (amount > highValue || conf < confThreshold || amount > maxAuto) {
                      if (opp.status === 'blocked') blockCount++;
                      else reviewCount++;
                    } else {
                      autoCount++;
                    }
                  }

                  return (
                    <>
                      <div style={{ textAlign: 'center', padding: '6px 0', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-success-border)' }}>
                        <div className="mono-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-success)' }}>{autoCount}</div>
                        <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-success)' }}>Auto-Execute</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: '6px 0', background: 'var(--color-warning-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-warning-border)' }}>
                        <div className="mono-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-warning)' }}>{reviewCount}</div>
                        <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-warning)' }}>Review</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: '6px 0', background: 'var(--color-error-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-error-border)' }}>
                        <div className="mono-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-error)' }}>{blockCount}</div>
                        <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-error)' }}>Blocked</div>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 6, fontStyle: 'italic' }}>
                * Preview only. Changes are not saved until you click "Save Guardrails".
              </div>
            </div>
          )}

          {/* 3. Operational Rules */}
          <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
              Contact Controls
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="flex-between">
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>Permitted Contact Hours</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <select
                    value={settings.contact_start_hour}
                    onChange={(e) => handleChange('contact_start_hour', parseInt(e.target.value))}
                    style={{ padding: '3px 4px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-sm)' }}
                  >
                    {[...Array(24)].map((_, h) => (
                      <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>to</span>
                  <select
                    value={settings.contact_cutoff_hour}
                    onChange={(e) => handleChange('contact_cutoff_hour', parseInt(e.target.value))}
                    style={{ padding: '3px 4px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-sm)' }}
                  >
                    {[...Array(24)].map((_, h) => (
                      <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-between">
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>Maximum Attempts per Opportunity</span>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={settings.max_recovery_attempts}
                  onChange={(e) => handleChange('max_recovery_attempts', parseInt(e.target.value) || 1)}
                  style={{ width: 50, padding: '4px 6px', textAlign: 'right', background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>

          {/* 4. Developer Tools (Absorbed from header) */}
          <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
              Developer & Testing
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={handleRunAgent} style={{ flex: 1 }} disabled={isProcessing}>
                <Play size={12} /> {isProcessing ? 'Processing...' : 'Run Agent Cycle'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleResetDemo} style={{ flex: 1, color: 'var(--color-error)' }} disabled={isProcessing}>
                <RotateCcw size={12} /> Reset Database
              </button>
              {isProcessing && processStats && (
                <div style={{ width: '100%', marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <strong>Progress:</strong> {processStats.processing} processing, {processStats.detected} remaining in queue.
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
              * These controls are exposed for demonstration and testing purposes.
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={toggleSettings} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} id="save-guardrails-btn">
            <Save size={12} />
            {saving ? 'Saving...' : 'Save Guardrails'}
          </button>
        </div>
      </div>
    </div>
  );
}

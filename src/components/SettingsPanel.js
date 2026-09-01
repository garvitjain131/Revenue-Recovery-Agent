'use client';

import { useState, useEffect } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { showToast } from './Toast';
import { Settings, AlertTriangle, Save, ShieldCheck, DollarSign } from 'lucide-react';

export function SettingsPanel() {
  const { state, toggleSettings } = useDashboardState();
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

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`/api/settings?merchant_id=${state.merchantId}`);
        if (!res.ok) return;
        const data = await res.json();
        setSettings(prev => ({
          ...prev,
          operating_mode: data.operating_mode || 'autonomous',
          ...data.guardrails,
          minimum_confidence: (data.guardrails?.minimum_confidence || 0.7) * 100,
        }));
      } catch (err) {
        console.error('[Settings] Fetch failed:', err);
      }
    };
    fetchSettings();
  }, [state.merchantId]);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardrails = { ...settings };
      const operating_mode = guardrails.operating_mode;
      delete guardrails.operating_mode;
      guardrails.minimum_confidence = guardrails.minimum_confidence / 100;

      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: state.merchantId, operating_mode, guardrails }),
      });
      showToast('Policy Guardian guardrails saved', 'success');
      toggleSettings();
    } catch (err) {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!state.isSettingsPanelOpen) return null;

  return (
    <div className="modal-overlay" onClick={toggleSettings}>
      <div className="modal-content" onClick={e => e.stopPropagation()} role="dialog" aria-label="Policy Guardian Settings" style={{ maxWidth: 580 }}>
        <button className="modal-close" onClick={toggleSettings} aria-label="Close settings">X</button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={20} /> Policy Guardian Configuration
        </h2>

        {/* Operating Mode */}
        <div className="settings-group">
          <h3>Operating Mode & Autonomy Level</h3>
          <div className="mode-switcher" style={{ marginTop: 8 }}>
            {['observe', 'review', 'autonomous'].map(mode => (
              <button
                key={mode}
                className={`mode-option ${settings.operating_mode === mode ? 'active' : ''}`}
                onClick={() => handleChange('operating_mode', mode)}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
            {settings.operating_mode === 'observe' && 'OBSERVE: Detects & scores leaks. Logs recommendations without executing financial actions.'}
            {settings.operating_mode === 'review' && 'REVIEW: Prepares optimal recovery actions & queues them for human authorization.'}
            {settings.operating_mode === 'autonomous' && 'AUTONOMOUS: Automatically executes low-risk recovery actions within strict 14-point guardrails.'}
          </p>
        </div>

        {/* Financial Boundaries & Budget */}
        <div className="settings-group">
          <h3>Financial Boundaries & Operational Budget</h3>
          
          <div className="settings-row">
            <span className="settings-label">Daily Recovery Budget (INR)</span>
            <input
              type="number"
              value={settings.daily_recovery_budget}
              onChange={(e) => handleChange('daily_recovery_budget', parseInt(e.target.value) || 0)}
              style={{ width: 140, textAlign: 'right' }}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">Max Auto-Execute Limit (INR)</span>
            <input
              type="number"
              value={settings.max_auto_transaction}
              onChange={(e) => handleChange('max_auto_transaction', parseInt(e.target.value) || 0)}
              style={{ width: 140, textAlign: 'right' }}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">High-Value Threshold (INR)</span>
            <input
              type="number"
              value={settings.high_value_threshold}
              onChange={(e) => handleChange('high_value_threshold', parseInt(e.target.value) || 0)}
              style={{ width: 140, textAlign: 'right' }}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">Min Confidence Floor (%)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, maxWidth: 200 }}>
              <input
                type="range" min="50" max="95"
                value={settings.minimum_confidence}
                onChange={(e) => handleChange('minimum_confidence', parseInt(e.target.value))}
              />
              <span className="settings-value">{settings.minimum_confidence}%</span>
            </div>
          </div>
        </div>

        {/* Contact Protection */}
        <div className="settings-group">
          <h3>Contact Hours & Fatigue Protection</h3>
          <div className="settings-row">
            <span className="settings-label">Permissible Window</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select value={settings.contact_start_hour} onChange={(e) => handleChange('contact_start_hour', parseInt(e.target.value))} style={{ width: 80 }}>
                {[...Array(24)].map((_, h) => <option key={h} value={h}>{h}:00</option>)}
              </select>
              <span>to</span>
              <select value={settings.contact_cutoff_hour} onChange={(e) => handleChange('contact_cutoff_hour', parseInt(e.target.value))} style={{ width: 80 }}>
                {[...Array(24)].map((_, h) => <option key={h} value={h}>{h}:00</option>)}
              </select>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">Max Attempts per Opportunity</span>
            <input
              type="number"
              min="1" max="5"
              value={settings.max_recovery_attempts}
              onChange={(e) => handleChange('max_recovery_attempts', parseInt(e.target.value) || 1)}
              style={{ width: 80, textAlign: 'right' }}
            />
          </div>
        </div>

        {/* Emergency Stop */}
        <div className="settings-group" style={{ borderBottom: 'none' }}>
          <h3 style={{ color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> Emergency Kill Switch
          </h3>
          <div className="settings-row">
            <div>
              <span className="settings-label">Halt All Operations</span>
              <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Immediately disables all autonomous tool execution</p>
            </div>
            <button
              className={`btn btn-sm ${settings.kill_switch ? 'btn-danger' : 'btn-ghost'}`}
              onClick={() => handleChange('kill_switch', !settings.kill_switch)}
              style={{ minWidth: 90 }}
            >
              {settings.kill_switch ? 'ACTIVE' : 'DISABLED'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
            <Save size={14} />
            {saving ? 'Saving...' : 'Save Guardrails'}
          </button>
          <button className="btn btn-ghost" onClick={toggleSettings}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

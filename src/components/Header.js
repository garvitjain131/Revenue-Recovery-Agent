'use client';

import { useState, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { useDashboardState } from '@/hooks/useDashboardState';
import { showToast } from './Toast';
import { Logo } from './Logo';
import {
  Upload, RefreshCw, Sun, Moon, Settings, Play,
  AlertOctagon, RotateCcw, ShieldCheck
} from 'lucide-react';

export function Header({ onRunAgent, onSync, onUpload }) {
  const { theme, toggleTheme } = useTheme();
  const { state, toggleSettings, setMerchant } = useDashboardState();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [merchants, setMerchants] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchDashboardMeta = async () => {
    try {
      const res = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
      if (res.ok) {
        const json = await res.json();
        setKillSwitchActive(Boolean(json.merchant?.guardrails?.kill_switch));
      }
    } catch {}
  };

  useEffect(() => {
    fetchDashboardMeta();
  }, [state.merchantId]);

  useEffect(() => {
    const fetchMerchants = async () => {
      try {
        const res = await fetch('/api/merchants');
        if (res.ok) {
          const data = await res.json();
          setMerchants(data);
          if (!state.merchantId && data.length > 0) {
            setMerchant(data[0].id);
          }
        }
      } catch (err) {
        console.error('[Header] Failed to fetch merchants:', err);
      }
    };
    fetchMerchants();
  }, []);

  const handleRunAgent = async () => {
    setIsRunning(true);
    showToast('Autonomous agent scanning transaction rails...', 'info');
    try {
      if (onRunAgent) await onRunAgent();
      else {
        const res = await fetch('/api/agent/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merchant_id: state.merchantId }),
        });
        const data = await res.json();
        if (res.ok) {
          showToast(`Agent loop complete: ${data.outcome?.toUpperCase() || 'PROCESSED'}`, 'success');
          fetchDashboardMeta();
        } else {
          showToast('Agent error: ' + (data.error || 'Unknown'), 'error');
        }
      }
    } catch (err) {
      showToast('Agent run failed: ' + err.message, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleResetDemo = async () => {
    if (!confirm('Reset demo dataset to initial reproducible state?')) return;
    setIsResetting(true);
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      if (res.ok) {
        showToast('Demo dataset restored to initial state', 'success');
        window.location.reload();
      } else {
        showToast('Reset failed', 'error');
      }
    } catch (err) {
      showToast('Error resetting demo: ' + err.message, 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleToggleKillSwitch = async () => {
    const newStatus = !killSwitchActive;
    if (newStatus && !confirm('EMERGENCY KILL SWITCH: Halt all autonomous actions immediately?')) return;

    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: state.merchantId,
          guardrails: { kill_switch: newStatus },
        }),
      });
      setKillSwitchActive(newStatus);
      showToast(newStatus ? 'KILL SWITCH ACTIVATED: Agent halted' : 'Kill switch deactivated', newStatus ? 'error' : 'success');
    } catch (err) {
      showToast('Failed to toggle kill switch', 'error');
    }
  };

  return (
    <header className="app-header" role="banner">
      <div className="app-header-left">
        <div className="app-logo-container">
          <div className="app-logo-mark">
            <Logo size={32} />
          </div>
          <div className="app-logo-text">
            <span className="app-logo-name">Revenue Recovery Agent</span>
            <span className="app-logo-sub">Razorpay Opportunity Engine</span>
          </div>
        </div>

        {killSwitchActive ? (
          <span className="badge badge-critical" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertOctagon size={12} /> KILL SWITCH ACTIVE
          </span>
        ) : (
          <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ShieldCheck size={12} /> POLICY GUARDIAN ACTIVE
          </span>
        )}
      </div>

      <div className="app-header-right">
        {/* Merchant Selector */}
        <select
          value={mounted ? (state.merchantId || '') : ''}
          onChange={(e) => setMerchant(e.target.value)}
          aria-label="Select merchant profile"
          style={{
            padding: '6px 10px',
            fontSize: 12,
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            maxWidth: 200,
          }}
        >
          {!mounted ? (
            <option value="">Loading...</option>
          ) : merchants.length === 0 ? (
            <option value={state.merchantId || ''}>{state.merchantId || 'Loading...'}</option>
          ) : (
            merchants.map(m => (
              <option key={m.id} value={m.id}>{m.name || m.id}</option>
            ))
          )}
        </select>

        {/* Reset Demo Button */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleResetDemo}
          disabled={isResetting}
          title="Restore pristine demo dataset"
        >
          <RotateCcw size={13} className={isResetting ? 'spin' : ''} />
          Reset Demo
        </button>

        {/* Emergency Kill Switch Button */}
        <button
          className={`btn btn-sm ${killSwitchActive ? 'btn-danger' : 'btn-ghost'}`}
          onClick={handleToggleKillSwitch}
          title="Emergency Stop"
          style={{ borderColor: killSwitchActive ? undefined : 'var(--color-error)' }}
        >
          <AlertOctagon size={13} style={{ color: killSwitchActive ? '#fff' : 'var(--color-error)' }} />
          {killSwitchActive ? 'HALTED' : 'Kill Switch'}
        </button>

        {/* Theme Toggle */}
        <button className="btn-icon" onClick={toggleTheme} title="Switch theme" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Settings */}
        <button className="btn-icon" onClick={toggleSettings} title="Settings" aria-label="Open settings">
          <Settings size={15} />
        </button>

        {/* Run Agent */}
        <button className="btn btn-primary" onClick={handleRunAgent} disabled={isRunning || killSwitchActive}>
          {isRunning ? (
            <><span className="loading-spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Analyzing...</>
          ) : (
            <><Play size={13} /> Run Agent</>
          )}
        </button>
      </div>
    </header>
  );
}

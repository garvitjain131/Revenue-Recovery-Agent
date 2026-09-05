'use client';

import { useState, useEffect, useRef } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { showToast } from './Toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertOctagon,
  ChevronDown,
  Check,
  TrendingUp,
  Play,
  RefreshCw,
  Eye,
  Zap,
} from 'lucide-react';

function formatTickerCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function Header() {
  const {
    state,
    setMerchant,
    openKillSwitchModal,
    triggerRefresh,
  } = useDashboardState();

  const [merchants, setMerchants] = useState([]);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [operatingMode, setOperatingMode] = useState('AUTONOMOUS'); // 'OBSERVE' | 'AUTONOMOUS'
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  // Feature #2: Money Saved Ticker state
  const [totalRecovered, setTotalRecovered] = useState(0);
  const [prevRecovered, setPrevRecovered] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStats, setProcessStats] = useState(null);
  const [progressPercent, setProgressPercent] = useState(0);

  const handleSyncData = async () => {
    try {
      setIsSyncing(true);
      showToast('Syncing mock transactions...', 'info');
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: state.merchantId }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastSyncedAt(data.last_synced_at);
        const msg = data.total_synced != null
          ? `Synced ${data.total_synced} transactions (${data.captured_count} captured, ${data.failed_count} failed)`
          : data.message || 'Transactions synced successfully';
        showToast(msg, 'success');
        triggerRefresh();
      } else {
        showToast(data.error || 'Sync failed', 'error');
      }
    } catch (err) {
      showToast('Sync error: ' + err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleModeToggle = async (newMode) => {
    const upperMode = newMode.toUpperCase();
    if (operatingMode === upperMode) return;
    setOperatingMode(upperMode);
    try {
      showToast(`Operating mode switched to ${upperMode}`, 'info');
      const merchantId = state.merchantId || 'merchant_rzp_test';
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId, operating_mode: newMode.toLowerCase() }),
      });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      triggerRefresh();
    } catch (err) {
      console.error('Failed to update mode setting:', err);
      showToast('Failed to update mode: ' + err.message, 'error');
    }
  };

  const handleRunAgent = async () => {
    const currentMode = operatingMode.toLowerCase() === 'observe' ? 'observe' : 'autonomous';
    try {
      showToast(`Running Agent in ${currentMode.toUpperCase()} mode...`, 'info');
      setIsProcessing(true);
      setProgressPercent(5);

      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: state.merchantId,
          mode: currentMode,
        }),
      });

      if (res.status === 202 || res.ok) {
        let pollCount = 0;
        const pollInterval = setInterval(async () => {
          pollCount++;
          try {
            const statusRes = await fetch(`/api/agent/status?merchant_id=${state.merchantId}`);
            if (statusRes.ok) {
              const data = await statusRes.json();
              const summary = data.summary || {};
              const counts = data.counts || {};
              const processing = summary.processing ?? (counts['processing'] || 0);
              const detected = summary.detected ?? (counts['detected'] || 0);
              const percent = summary.progress_percent ?? Math.min(95, pollCount * 15);

              setProgressPercent(percent);
              setProcessStats(summary);
              triggerRefresh();

              // If processing has concluded (after initial grace period of 1 poll)
              if (pollCount > 1 && processing === 0 && detected === 0) {
                clearInterval(pollInterval);
                setProgressPercent(100);
                setTimeout(() => {
                  setIsProcessing(false);
                  setProcessStats(null);
                  setProgressPercent(0);
                }, 2000);
                showToast(`Agent completed run in ${currentMode.toUpperCase()} mode!`, 'success');
              }
            }
          } catch (err) {
            console.error('Polling error:', err);
          }
        }, 3000);
      } else {
        setIsProcessing(false);
        showToast('Failed to start agent run', 'error');
      }
    } catch (err) {
      setIsProcessing(false);
      showToast('Error starting agent: ' + err.message, 'error');
    }
  };

  // Fetch merchants
  useEffect(() => {
    fetch('/api/merchants')
      .then((r) => r.json())
      .then((data) => setMerchants(data || []))
      .catch(() => {});
  }, []);

  // Auto-select first merchant
  useEffect(() => {
    if (!state.merchantId && merchants.length > 0) {
      setMerchant(merchants[0].id);
    }
  }, [merchants, state.merchantId, setMerchant]);

  // Fetch settings & recovered revenue
  useEffect(() => {
    if (!state.merchantId) return;
    const fetchData = async () => {
      try {
        // Fetch settings
        const settingsRes = await fetch(`/api/settings?merchant_id=${state.merchantId}`);
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setKillSwitchActive(!!data.guardrails?.kill_switch);
          setOperatingMode((data.operating_mode || 'autonomous').toUpperCase());
        }
        // Fetch dashboard metrics for recovered revenue (Feature #2)
        const dashRes = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
        if (dashRes.ok) {
          const dashData = await dashRes.json();
          const recovered = dashData.metrics?.total_recovered || 0;
          setPrevRecovered(totalRecovered);
          setTotalRecovered(recovered);
        }
      } catch {}
    };
    fetchData();
    // Poll every 15s for live ticker updates
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [state.merchantId, state.refreshKey]);


  return (
    <header className="fintech-header">
      {/* Left — Brand */}
      <div className="header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRight: '1px solid var(--border-medium)', paddingRight: 16, marginRight: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-brand-light)' }}>
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 1000, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1 }}>Opportunity Engine</span>
          </div>
        </div>

        {/* ═══ Feature #2: Money Saved Ticker ═══ */}
        {totalRecovered >= 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-md)' }}>
            <TrendingUp size={13} style={{ color: 'var(--color-success)' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Saved</span>
            <AnimatePresence mode="wait">
              <motion.span
                key={totalRecovered}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="mono-num"
                style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success)', letterSpacing: '-0.02em' }}
              >
                {formatTickerCurrency(totalRecovered)}
              </motion.span>
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Right — Controls */}
      <div className="header-right">
        {/* Merchant */}
        <select
          className="header-control"
          value={state.merchantId || ''}
          onChange={(e) => setMerchant(e.target.value)}
          style={{ cursor: 'pointer', appearance: 'auto', paddingRight: 24 }}
        >
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <div className="header-divider" />

        {/* Sync Data Button */}
        <button
          className="header-control"
          onClick={handleSyncData}
          disabled={isSyncing}
          title={lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Sync mock transactions without running AI'}
          style={{ cursor: isSyncing ? 'not-allowed' : 'pointer', gap: 6 }}
        >
          <RefreshCw size={13} style={{ color: 'var(--color-brand)', transform: isSyncing ? 'rotate(180deg)' : 'none', transition: 'transform 0.5s' }} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>
            {isSyncing ? 'SYNCING...' : 'SYNC DATA'}
          </span>
        </button>

        <div className="header-divider" />

        {/* Operating Mode Segmented Toggle: Observe vs Autonomous */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '2px',
            gap: '2px',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <button
            type="button"
            onClick={() => handleModeToggle('observe')}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: operatingMode === 'OBSERVE' ? '#2563EB' : 'transparent',
              color: operatingMode === 'OBSERVE' ? '#FFFFFF' : 'var(--text-secondary)',
              boxShadow: operatingMode === 'OBSERVE' ? '0 1px 4px rgba(37, 99, 235, 0.25)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s ease-in-out',
            }}
            title="Observe Mode: Diagnose & Recommend without automatic execution"
          >
            <Eye size={12} style={{ color: operatingMode === 'OBSERVE' ? '#93C5FD' : 'var(--text-dim)' }} />
            <span>Observe</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle('autonomous')}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: operatingMode === 'AUTONOMOUS' ? '#1E293B' : 'transparent',
              color: operatingMode === 'AUTONOMOUS' ? '#FFFFFF' : 'var(--text-secondary)',
              boxShadow: operatingMode === 'AUTONOMOUS' ? '0 1px 4px rgba(0, 0, 0, 0.2)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s ease-in-out',
            }}
            title="Autonomous Mode: Full automated closed-loop recovery"
          >
            <Zap size={12} style={{ color: operatingMode === 'AUTONOMOUS' ? '#10B981' : 'var(--text-dim)' }} />
            <span>Autonomous</span>
          </button>
        </div>

        <div className="header-divider" />

        {/* Run Agent Button */}
        <button
          className="header-control"
          onClick={handleRunAgent}
          disabled={isProcessing || killSwitchActive}
          title={`Run Agent in ${operatingMode} mode`}
          style={{
            cursor: (isProcessing || killSwitchActive) ? 'not-allowed' : 'pointer',
            gap: 8,
            opacity: (isProcessing || killSwitchActive) ? 0.7 : 1,
            background: isProcessing ? 'var(--bg-active)' : undefined,
            minWidth: 110,
          }}
        >
          <Play size={13} style={{ color: 'var(--color-primary)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 60 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}>
              {isProcessing ? 'RUNNING...' : 'RUN AGENT'}
            </span>
            {isProcessing ? (
              <span style={{ fontSize: 9, color: 'var(--color-brand)', fontWeight: 600 }}>
                {progressPercent}%
              </span>
            ) : (
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                {operatingMode}
              </span>
            )}
          </div>
        </button>

        <div className="header-divider" />

        {/* ═══ Feature #11: Persistent Kill Switch ═══ */}
        <button
          className={`header-control ${killSwitchActive ? 'kill-switch-halted' : ''}`}
          onClick={openKillSwitchModal}
          title={killSwitchActive ? 'Agent halted — click to resume' : 'Emergency stop'}
          style={{
            cursor: 'pointer',
            gap: 6,
            color: killSwitchActive ? 'var(--color-error)' : 'var(--text-secondary)',
            borderColor: killSwitchActive ? 'var(--color-error-border)' : undefined,
          }}
        >
          <AlertOctagon size={14} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>
            {killSwitchActive ? 'HALTED' : 'Kill Switch'}
          </span>
          <span className={`header-status-dot ${killSwitchActive ? 'inactive' : 'active'}`} />
        </button>
      </div>

      {/* Progress Bar Display */}
      {isProcessing && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: 'rgba(0,0,0,0.06)',
          overflow: 'hidden',
          zIndex: 10
        }}>
          <motion.div
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #10b981)',
              width: `${progressPercent}%`,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ ease: 'easeOut', duration: 0.3 }}
          />
        </div>
      )}
    </header>
  );
}

'use client';

import { useState } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { showToast } from './Toast';
import { AlertOctagon } from 'lucide-react';

export function KillSwitchModal({ killSwitchActive, onToggleSuccess }) {
  const { state, closeKillSwitchModal, triggerRefresh } = useDashboardState();
  const [loading, setLoading] = useState(false);

  if (!state.isKillSwitchModalOpen) return null;

  const handleConfirm = async () => {
    setLoading(true);
    const newStatus = !killSwitchActive;
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: state.merchantId,
          guardrails: { kill_switch: newStatus },
        }),
      });

      if (res.ok) {
        showToast(
          newStatus ? 'Kill switch activated' : 'Kill switch deactivated',
          newStatus ? 'error' : 'success'
        );
        triggerRefresh();
        if (onToggleSuccess) onToggleSuccess(newStatus);
        closeKillSwitchModal();
      } else {
        showToast('Failed to update kill switch state', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={closeKillSwitchModal} role="dialog" aria-modal="true">
      <div className="modal-surface" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6, color: killSwitchActive ? 'var(--color-success)' : 'var(--color-error)' }}>
            <AlertOctagon size={16} />
            {killSwitchActive ? 'Resume Agent Operations' : 'Emergency Stop Agent'}
          </div>
          <button className="btn-icon" onClick={closeKillSwitchModal} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {killSwitchActive ? (
            <div>
              <p style={{ marginBottom: 8, color: 'var(--text-primary)', fontWeight: 600 }}>
                Operations currently suspended.
              </p>
              <p>
                Deactivating will restore recovery operations within guardrail limits.
              </p>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-primary)' }}>
                Immediately halt autonomous execution?
              </p>
              <p style={{ marginBottom: 8 }}>
                Activating blocks all automated recovery actions immediately.
              </p>
              <ul style={{ paddingLeft: 16, color: 'var(--text-tertiary)', fontSize: 11, lineHeight: 1.5 }}>
                <li>All autonomous actions halted</li>
                <li>Pending actions require manual review</li>
                <li>Monitoring continues normally</li>
              </ul>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={closeKillSwitchModal} disabled={loading}>
            Cancel
          </button>
          <button
            className={`btn btn-sm ${killSwitchActive ? 'btn-success' : 'btn-danger'}`}
            onClick={handleConfirm}
            disabled={loading}
            id="confirm-kill-switch-btn"
          >
            {loading ? 'Updating...' : killSwitchActive ? 'Resume Operations' : 'Activate Kill Switch'}
          </button>
        </div>
      </div>
    </div>
  );
}

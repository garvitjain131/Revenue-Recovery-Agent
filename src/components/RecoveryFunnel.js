'use client';

import { TrendingUp, ArrowDown } from 'lucide-react';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function RecoveryFunnel({ funnelData = [] }) {
  if (!funnelData || funnelData.length === 0) return null;

  return (
    <div className="card section" style={{ marginBottom: 24 }}>
      <div className="section-header">
        <h2 className="section-title">
          <span className="section-title-icon"><TrendingUp size={18} /></span>
          Revenue Recovery Funnel
        </h2>
        <span className="badge badge-dim">Continuous Closed-Loop Attribution</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${funnelData.length}, 1fr)`,
        gap: 12,
        position: 'relative',
        padding: '12px 0',
      }}>
        {funnelData.map((stage, idx) => {
          const isFinal = idx === funnelData.length - 1;
          const isAtRisk = stage.stage === 'At Risk';
          return (
            <div
              key={stage.stage}
              style={{
                background: isFinal
                  ? 'rgba(16, 185, 129, 0.08)'
                  : isAtRisk
                  ? 'rgba(239, 68, 68, 0.08)'
                  : 'var(--bg-tertiary)',
                border: isFinal
                  ? '1px solid rgba(16, 185, 129, 0.3)'
                  : isAtRisk
                  ? '1px solid rgba(239, 68, 68, 0.3)'
                  : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 14px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>
                    Step {idx + 1}
                  </span>
                  <span className="badge badge-dim" style={{ fontSize: 10 }}>
                    {stage.count} {stage.count === 1 ? 'record' : 'records'}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {stage.label}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: isFinal ? 'var(--color-success)' : isAtRisk ? 'var(--color-error)' : 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                }}>
                  {formatCurrency(stage.value)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

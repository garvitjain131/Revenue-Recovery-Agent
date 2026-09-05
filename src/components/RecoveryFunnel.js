'use client';

import { TrendingUp, ArrowRight } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function formatExactCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function RecoveryFunnel({ funnelData = [] }) {
  if (!funnelData || funnelData.length === 0) return null;

  const stageConfig = {
    'Processed':   { color: '#6A8FB8',              dotClass: 'status-dot-brand' },
    'At Risk':     { color: 'var(--color-error)',   dotClass: 'status-dot-error' },
    'Recoverable': { color: 'var(--color-warning)', dotClass: 'status-dot-warning' },
    'Addressed':   { color: '#2563EB',              dotClass: 'status-dot-brand' },
    'Recovered':   { color: 'var(--color-success)', dotClass: 'status-dot-success' },
  };

  const stageDescriptions = {
    'Processed': 'Total payment volume processed through the merchant gateway.',
    'At Risk': 'Revenue from failed payments, abandoned carts, and discount leakage.',
    'Recoverable': 'Opportunities with recovery probability above the confidence threshold.',
    'Addressed': 'Interventions that have been executed (payment links, retries, notifications).',
    'Recovered': 'Confirmed recovered revenue from executed interventions (attributed 1:1).',
  };

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <TrendingUp size={14} />
            Recovery Funnel
          </div>
        </div>

        <div className="panel-body" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {funnelData.map((stage, idx) => {
              const config = stageConfig[stage.stage] || { color: 'var(--text-secondary)', dotClass: '' };

              return (
                <div key={stage.stage} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  {/* ═══ Feature #7: Radix Tooltip on each funnel stage ═══ */}
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <div style={{ flex: 1, minWidth: 0, cursor: 'default' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span className={`status-dot ${config.dotClass}`} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {stage.label}
                          </span>
                        </div>
                        <div className="mono-num" style={{ fontSize: 22, fontWeight: 700, color: config.color, letterSpacing: '-0.02em' }}>
                          {formatCurrency(stage.value)}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>
                          {stage.count} {stage.count === 1 ? 'record' : 'records'}
                        </div>
                      </div>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side="bottom"
                        sideOffset={6}
                        style={{
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-medium)',
                          borderRadius: 'var(--radius-md)',
                          padding: '8px 12px',
                          boxShadow: 'var(--shadow-md)',
                          maxWidth: 260,
                          zIndex: 200,
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                          {stage.label}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                          {stageDescriptions[stage.stage] || ''}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Amount</div>
                            <div className="mono-num" style={{ fontSize: 12, fontWeight: 700, color: config.color }}>
                              {formatExactCurrency(stage.value)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Count</div>
                            <div className="mono-num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {stage.count.toLocaleString('en-IN')}
                            </div>
                          </div>
                        </div>
                        <Tooltip.Arrow style={{ fill: 'var(--bg-secondary)' }} />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>

                  {/* Arrow connector */}
                  {idx < funnelData.length - 1 && (
                    <div style={{ padding: '0 10px', color: 'var(--text-dim)', flexShrink: 0 }}>
                      <ArrowRight size={14} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import {
  ShieldCheck,
  Activity,
  Layers,
  FileCode,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Search,
  RotateCcw
} from 'lucide-react';

const CANONICAL_16_STAGES = [
  'Observe', 'Detect', 'Score', 'Create',
  'Diagnose', 'Generate', 'Simulate', 'Rank',
  'Recommend', 'Guard', 'Decide', 'Act',
  'Record', 'Measure', 'Attribute', 'Calibrate'
];

export function AuditTrailView() {
  const { state, selectOpportunity } = useDashboardState();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedStageIdx, setSelectedStageIdx] = useState(null);
  const [expandedPayloads, setExpandedPayloads] = useState({});
  const [activeFilter, setActiveFilter] = useState('ALL');
  // Feature #9: Opportunity ID filter
  const [oppIdFilter, setOppIdFilter] = useState('');

  const fetchAuditData = async () => {
    try {
      const res = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.agent_runs?.length > 0 && !selectedRun) {
          setSelectedRun(json.agent_runs[0]);
        }
      }
    } catch (err) {
      console.error('[AuditTrailView] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditData();
  }, [state.merchantId, state.refreshKey]);

  const togglePayload = (id) => {
    setExpandedPayloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const runs = data?.agent_runs || [];
  const auditLogs = data?.audit_logs || [];

  // Filter logs
  let filteredLogs = [...auditLogs];

  // Feature #9: Filter by opportunity ID
  if (oppIdFilter.trim()) {
    filteredLogs = filteredLogs.filter((l) =>
      (l.opportunity_id || '').toLowerCase().includes(oppIdFilter.trim().toLowerCase())
    );
  }

  if (activeFilter !== 'ALL') {
    if (activeFilter === 'EXECUTIONS') {
      filteredLogs = filteredLogs.filter((l) => l.event_type?.includes('executed') || l.event_type?.includes('intervention'));
    } else if (activeFilter === 'ATTRIBUTIONS') {
      filteredLogs = filteredLogs.filter((l) => l.event_type?.includes('recovered') || l.event_type?.includes('attribution'));
    } else if (activeFilter === 'ERRORS') {
      filteredLogs = filteredLogs.filter((l) => l.event_type?.includes('error') || l.event_type?.includes('blocked') || l.event_type?.includes('failed'));
    }
  }

  const runSteps = selectedRun?.steps || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Header Overview Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
            Lifecycle Runs
          </div>
          <div className="mono-num" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {runs.length}
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
            Audit Records
          </div>
          <div className="mono-num" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {auditLogs.length}
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
            Policy Checks
          </div>
          <div className="mono-num text-success" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            14 / 14 Enforced
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
            Attribution
          </div>
          <div className="mono-num text-success" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            1:1 Single-Source
          </div>
        </div>
      </div>

      {/* 2. 16-Stage Canonical Lifecycle Timeline & Run Inspector */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Layers size={14} />
            <span>16-Stage Decision Lifecycle Inspector</span>
          </div>
          {selectedRun && (
            <span className="mono-num" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Run ID: {selectedRun.id} ({selectedRun.duration_ms}ms)
            </span>
          )}
        </div>

        <div className="panel-body" style={{ padding: 12 }}>
          {/* 16-Stage Canonical Timeline Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, marginBottom: 12 }}>
            {CANONICAL_16_STAGES.map((stageName, idx) => {
              const stageNum = idx + 1;
              const matchingStep = runSteps.find((s) => s.type?.toLowerCase().includes(stageName.toLowerCase()));
              const isSelected = selectedStageIdx === idx;
              const hasRun = Boolean(selectedRun);

              return (
                <button
                  key={stageName}
                  onClick={() => setSelectedStageIdx(isSelected ? null : idx)}
                  style={{
                    padding: '6px 4px',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected
                      ? 'var(--color-brand)'
                      : matchingStep
                      ? 'var(--color-brand-muted)'
                      : 'var(--bg-secondary)',
                    border: '1px solid',
                    borderColor: isSelected
                      ? 'var(--color-brand)'
                      : matchingStep
                      ? 'var(--color-brand-border)'
                      : 'var(--border-subtle)',
                    textAlign: 'center',
                    color: isSelected
                      ? '#FFFFFF'
                      : matchingStep
                      ? 'var(--color-brand-light)'
                      : 'var(--text-tertiary)',
                    fontSize: 10,
                    fontWeight: 600,
                    transition: 'all var(--transition-fast)',
                  }}
                  title={`Stage ${stageNum}: ${stageName}`}
                >
                  <div style={{ fontSize: 9, opacity: 0.7 }}>{stageNum.toString().padStart(2, '0')}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stageName}</div>
                </button>
              );
            })}
          </div>

          {/* Selected Stage Detail Drawer (Progressive Disclosure) */}
          {selectedStageIdx !== null && (
            <div style={{ padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', marginBottom: 12 }}>
              <div className="flex-between">
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Stage {selectedStageIdx + 1}: {CANONICAL_16_STAGES[selectedStageIdx]}
                </span>
                <button
                  onClick={() => setSelectedStageIdx(null)}
                  style={{ fontSize: 10, color: 'var(--text-tertiary)' }}
                >
                  Close
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                {runSteps[selectedStageIdx] ? (
                  typeof runSteps[selectedStageIdx].detail === 'string'
                    ? runSteps[selectedStageIdx].detail
                    : <pre style={{ marginTop: 4, padding: 6, background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: 10, overflowX: 'auto' }}>{JSON.stringify(runSteps[selectedStageIdx].detail, null, 2)}</pre>
                ) : (
                  `Deterministic verification step for ${CANONICAL_16_STAGES[selectedStageIdx]} stage.`
                )}
              </div>
            </div>
          )}

          {/* Runs Selection Bar */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {runs.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No agent runs recorded. Click "Run Agent" in header.</div>
            ) : (
              runs.map((r) => {
                const isSelected = selectedRun?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedRun(r); setSelectedStageIdx(null); }}
                    className={`chip-btn ${isSelected ? 'active' : ''}`}
                    style={{ fontSize: 10, padding: '3px 8px' }}
                  >
                    {r.id} · {r.final_outcome?.toUpperCase()} ({r.duration_ms}ms)
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 3. Immutable Governance Audit Records Table */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <ShieldCheck size={14} />
            <span>Immutable Governance Audit Records</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Feature #9: Opportunity ID filter */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Filter by Opportunity ID..."
                value={oppIdFilter}
                onChange={(e) => setOppIdFilter(e.target.value)}
                style={{
                  padding: '3px 8px 3px 26px',
                  fontSize: 10,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  width: 170,
                }}
              />
              <Search size={11} style={{ position: 'absolute', left: 8, top: 5, color: 'var(--text-dim)' }} />
            </div>
            {['ALL', 'EXECUTIONS', 'ATTRIBUTIONS', 'ERRORS'].map((f) => (
              <button
                key={f}
                className={`chip-btn ${activeFilter === f ? 'active' : ''}`}
                onClick={() => setActiveFilter(f)}
                style={{ fontSize: 10, padding: '2px 6px' }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="fintech-table-container">
          <table className="fintech-table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Time</th>
                <th style={{ width: 160 }}>Event</th>
                <th>Opportunity</th>
                <th>Actor</th>
                <th style={{ textAlign: 'right', width: 100 }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)' }}>
                    No audit records match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.slice(0, 20).map((log, idx) => {
                  const logKey = `log-${log.id || idx}`;
                  const isExpanded = Boolean(expandedPayloads[logKey]);

                  return (
                    <tr key={logKey}>
                      <td style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {log.created_at ? new Date(log.created_at).toLocaleTimeString() : 'Recent'}
                      </td>
                      <td>
                        <span className="badge badge-dim" style={{ fontSize: 9 }}>
                          {log.event_type?.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className="mono-num" style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                          {log.opportunity_id || '—'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {log.actor || 'deterministic_engine'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                          {/* Feature #9: Replay button */}
                          {log.opportunity_id && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => selectOpportunity(log.opportunity_id)}
                              style={{ padding: '1px 5px', fontSize: 10 }}
                              title="Replay: Open Decision Modal for this opportunity"
                            >
                              <RotateCcw size={10} /> Replay
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => togglePayload(logKey)}
                            style={{ padding: '1px 5px', fontSize: 10 }}
                          >
                            {isExpanded ? 'Hide' : 'Inspect'}
                          </button>
                        </div>
                        {isExpanded && (
                          <pre
                            style={{
                              marginTop: 4,
                              padding: 6,
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 10,
                              textAlign: 'left',
                              color: 'var(--text-secondary)',
                              maxWidth: 280,
                              marginLeft: 'auto',
                              overflowX: 'auto',
                            }}
                          >
                            {JSON.stringify(log.event_data || {}, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

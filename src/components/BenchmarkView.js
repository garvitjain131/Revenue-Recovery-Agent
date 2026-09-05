'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Award, ShieldCheck, RefreshCw, TrendingUp } from 'lucide-react';
import { showToast } from './Toast';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function formatPercent(n) {
  if (n == null || isNaN(n)) return '0.0%';
  return (n * 100).toFixed(1) + '%';
}

const SYSTEM_COLORS = {
  baseline_do_nothing: '#64748B',
  baseline_naive_retry: '#F59E0B',
  baseline_rule_based: '#06B6D4',
  full_agent: '#10B981',
};

export function BenchmarkView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchBenchmark = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/benchmark');
      if (!res.ok) throw new Error('Failed to fetch benchmark');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('[BenchmarkView] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBenchmark();
  }, []);

  const handleRunSimulation = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: Date.now() }),
      });
      const json = await res.json();
      if (res.ok) {
        setData(json);
        showToast('Recovery simulation completed', 'success');
      } else {
        showToast(`Simulation error: ${json.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setRunning(false);
    }
  };

  const results = data?.results || [];
  const fullAgentResult = results.find((r) => r.system_type === 'full_agent');
  const ruleBasedResult = results.find((r) => r.system_type === 'baseline_rule_based');
  const naiveRetryResult = results.find((r) => r.system_type === 'baseline_naive_retry');

  const chartData = results.map((r) => ({
    name: r.system_name?.split(':')[0]?.trim() || r.system_type,
    fullName: r.system_name,
    recovered: r.revenue_recovered,
    netRecovery: r.net_recovery,
    recoveryRate: Math.round((r.recovery_rate || 0) * 1000) / 10,
    type: r.system_type,
  }));

  const multiplier = fullAgentResult && ruleBasedResult && ruleBasedResult.recovery_rate > 0
    ? (fullAgentResult.recovery_rate / ruleBasedResult.recovery_rate).toFixed(1)
    : null;

  const insightText = multiplier
    ? `Recovery Agent recovered ${multiplier}× more revenue than the rule-based baseline.`
    : 'Evaluating recovery performance against baselines.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header & Simulation Action */}
      <div className="flex-between">
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Award size={16} />
            Recovery Performance Benchmarks
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Comparative analysis across 5,000 transactions
          </div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleRunSimulation}
          disabled={running || loading}
          id="rerun-benchmark-btn"
        >
          <RefreshCw size={11} className={running ? 'spin' : ''} />
          {running ? 'Evaluating...' : 'Re-Run Benchmark'}
        </button>
      </div>

      {/* Dynamic Data-Backed Insight Banner */}
      <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', borderLeft: '3px solid var(--color-success)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--color-success)', marginRight: 4 }}>
          Insight:
        </strong>
        {insightText}
      </div>

      {loading ? (
        <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <div className="spin" style={{ width: 20, height: 20, border: '2px solid var(--color-brand)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 8px' }} />
          <div>Evaluating baseline systems...</div>
        </div>
      ) : (
        <>
          {/* Table-First Systems Comparison */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <ShieldCheck size={14} />
                <span>System Comparison</span>
              </div>
            </div>

            <div className="fintech-table-container">
              <table className="fintech-table">
                <thead>
                  <tr>
                    <th>System</th>
                    <th style={{ textAlign: 'right' }}>Revenue Recovered</th>
                    <th style={{ textAlign: 'right' }}>Net Recovery</th>
                    <th style={{ textAlign: 'center' }}>Recovery Rate</th>
                    <th style={{ textAlign: 'right' }}>Interventions</th>
                    <th style={{ textAlign: 'right' }}>Unnecessary</th>
                    <th style={{ textAlign: 'right' }}>Violations</th>
                    <th style={{ textAlign: 'right' }}>Unauthorized</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((res) => {
                    const isFullAgent = res.system_type === 'full_agent';
                    return (
                      <tr
                        key={res.system_type}
                        style={{
                          background: isFullAgent ? 'rgba(16, 185, 129, 0.04)' : 'transparent',
                          fontWeight: isFullAgent ? 600 : 400,
                        }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: isFullAgent ? 'var(--color-success)' : 'var(--text-primary)' }}>
                              {res.system_name}
                            </span>
                            {isFullAgent && (
                              <span className="badge badge-success" style={{ fontSize: 8 }}>OUR SYSTEM</span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono-num">
                          <span style={{ color: isFullAgent ? 'var(--color-success)' : 'var(--text-primary)' }}>
                            {formatCurrency(res.revenue_recovered)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono-num">
                          {formatCurrency(res.net_recovery)}
                        </td>
                        <td style={{ textAlign: 'center' }} className="mono-num">
                          <span style={{ fontWeight: 700, color: isFullAgent ? 'var(--color-success)' : 'var(--text-secondary)' }}>
                            {formatPercent(res.recovery_rate)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono-num">
                          {res.interventions_count}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono-num">
                          <span style={{ color: res.unnecessary_interventions > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
                            {res.unnecessary_interventions}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono-num">
                          <span style={{ color: res.policy_violations > 0 ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 700 }}>
                            {res.policy_violations}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono-num">
                          <span style={{ color: res.unauthorized_executions > 0 ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 700 }}>
                            {res.unauthorized_executions}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Charts & Verifiable Guarantees */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
            {/* Chart: Recovered Revenue Comparison */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <TrendingUp size={14} />
                  <span>Recovered Revenue by Architecture (INR)</span>
                </div>
              </div>
              <div className="panel-body" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                    <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                    <Tooltip
                      formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Recovered Revenue']}
                      contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)', borderRadius: 4, fontSize: 11 }}
                    />
                    <Bar dataKey="recovered" radius={[2, 2, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SYSTEM_COLORS[entry.type] || '#4F46E5'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Verifiable Safety Guarantees */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <ShieldCheck size={14} />
                  <span>Verifiable Safety Guarantees</span>
                </div>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
                <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-success)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Zero Unauthorized Executions</div>
                  <div style={{ color: 'var(--text-tertiary)', marginTop: 1 }}>
                    All executions pass 14-point Policy Guardian validation.
                  </div>
                </div>

                <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-success)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Deterministic Idempotency</div>
                  <div style={{ color: 'var(--text-tertiary)', marginTop: 1 }}>
                    SHA-256 key prevents duplicate customer outreach.
                  </div>
                </div>

                <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-success)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Single-Source Attribution</div>
                  <div style={{ color: 'var(--text-tertiary)', marginTop: 1 }}>
                    Revenue attributed 1:1 to original transactions.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

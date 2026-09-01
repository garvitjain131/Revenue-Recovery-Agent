'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Award, ShieldCheck, RefreshCw, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';
import { showToast } from './Toast';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

const SYSTEM_COLORS = {
  baseline_do_nothing: '#94A3B8',
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
    showToast('Executing 5,000 transaction benchmark simulation...', 'info');
    try {
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: Date.now() }),
      });
      const json = await res.json();
      if (res.ok) {
        setData(json);
        showToast('Benchmark simulation completed across all 4 systems', 'success');
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

  const chartData = results.map(r => ({
    name: r.system_name.split(':')[0],
    fullName: r.system_name,
    recovered: r.revenue_recovered,
    netRecovery: r.net_recovery,
    type: r.system_type,
  }));

  return (
    <div className="section" style={{ marginTop: 24 }}>
      <div className="section-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 className="section-title">
            <span className="section-title-icon"><Award size={18} /></span>
            Empirical Evaluation & Baseline Comparisons
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Evaluating closed-loop performance against simpler baseline recovery architectures over a verified 5,000-transaction dataset.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleRunSimulation}
          disabled={running || loading}
        >
          <RefreshCw size={14} className={running ? 'spin' : ''} />
          {running ? 'Simulating 5,000 Transations...' : 'Re-Run Benchmark Simulation'}
        </button>
      </div>

      {loading ? (
        <div className="card loading-container" style={{ padding: 48 }}>
          <div className="loading-spinner" />
          <span style={{ marginTop: 12 }}>Evaluating 4 recovery systems across benchmark dataset...</span>
        </div>
      ) : (
        <>
          {/* Side-by-Side System Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {results.map((res) => {
              const isFullAgent = res.system_type === 'full_agent';
              return (
                <div
                  key={res.system_type}
                  className="card"
                  style={{
                    background: isFullAgent ? 'rgba(16, 185, 129, 0.06)' : 'var(--bg-surface)',
                    border: isFullAgent ? '2px solid var(--color-success)' : '1px solid var(--border-subtle)',
                    padding: '18px 16px',
                    position: 'relative',
                  }}
                >
                  {isFullAgent && (
                    <div style={{
                      position: 'absolute',
                      top: -10,
                      right: 12,
                      background: 'var(--color-success)',
                      color: '#000',
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 10,
                      letterSpacing: '0.05em',
                    }}>
                      OUR SYSTEM
                    </div>
                  )}

                  <div style={{ fontSize: 13, fontWeight: 700, color: isFullAgent ? 'var(--color-success)' : 'var(--text-primary)', marginBottom: 12 }}>
                    {res.system_name}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div className="metric-label" style={{ fontSize: 11 }}>Revenue Recovered</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                      {formatCurrency(res.revenue_recovered)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Recovery Rate: <strong>{(res.recovery_rate * 100).toFixed(1)}%</strong>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
                    <div className="flex-between">
                      <span style={{ color: 'var(--text-tertiary)' }}>Net Recovery:</span>
                      <span style={{ fontWeight: 700, color: isFullAgent ? 'var(--color-success)' : 'var(--text-secondary)' }}>
                        {formatCurrency(res.net_recovery)}
                      </span>
                    </div>
                    <div className="flex-between">
                      <span style={{ color: 'var(--text-tertiary)' }}>Interventions:</span>
                      <span>{res.interventions_count}</span>
                    </div>
                    <div className="flex-between">
                      <span style={{ color: 'var(--text-tertiary)' }}>Unnecessary Outreach:</span>
                      <span style={{ color: res.unnecessary_interventions > 0 ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 600 }}>
                        {res.unnecessary_interventions}
                      </span>
                    </div>
                    <div className="flex-between">
                      <span style={{ color: 'var(--text-tertiary)' }}>Policy Violations:</span>
                      <span style={{ color: res.policy_violations > 0 ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 600 }}>
                        {res.policy_violations}
                      </span>
                    </div>
                    <div className="flex-between">
                      <span style={{ color: 'var(--text-tertiary)' }}>Unauthorized Executions:</span>
                      <span style={{ color: res.unauthorized_executions > 0 ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 700 }}>
                        {res.unauthorized_executions}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Benchmark Charts & Safety Guarantees */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={16} /> Recovered Revenue by Architecture (INR)
              </h3>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                    <Tooltip
                      formatter={(val) => [`₹${val.toLocaleString('en-IN')}`, 'Recovered Revenue']}
                      contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-medium)', borderRadius: 6 }}
                    />
                    <Bar dataKey="recovered" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SYSTEM_COLORS[entry.type] || '#6366F1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={16} /> Verifiable Safety Guarantees
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
                <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-success)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Architectural Zero Unauthorized Executions</div>
                  <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Every financial action passes through deterministic 14-point Policy Guardian. LLM cannot invoke tools directly.
                  </div>
                </div>

                <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-success)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Deterministic Idempotency Protection</div>
                  <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Prevents duplicate messaging, payment link spam, or double-retries on repeated runs.
                  </div>
                </div>

                <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-success)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Single-Source Revenue Attribution</div>
                  <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Attributed revenue is tied 1:1 to original transactions, eliminating double-counting.
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

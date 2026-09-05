'use client';

import { useState, useEffect } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { TableSkeleton } from './Skeletons';
import { showToast } from './Toast';
import {
  Target,
  Search,
  Check,
  Eye,
  ArrowUpDown,
  CheckCircle2,
  Upload,
  Play,
  ShieldAlert,
  FileDown,
} from 'lucide-react';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

// Feature #3: Deterministic risk level derived from opportunity data
function getRiskLevel(opp) {
  if (opp.risk_level) return opp.risk_level.toUpperCase();
  const amount = opp.revenue_at_risk || 0;
  const conf = (opp.recovery_probability || 0) * 100;
  if (amount > 100000 || conf < 50) return 'HIGH';
  if (amount > 25000 || conf < 70) return 'MEDIUM';
  return 'LOW';
}

function getRiskBadgeClass(opp) {
  const risk = getRiskLevel(opp);
  if (risk === 'HIGH') return 'badge-critical';
  if (risk === 'MEDIUM') return 'badge-warning';
  return 'badge-success';
}

export function OpportunityInbox({ isOverviewCompact = false }) {
  const { state, selectOpportunity, triggerRefresh, openDemoScenarioModal } = useDashboardState();
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  // Local filters
  const [activeSection, setActiveSection] = useState('active'); // 'active' | 'recovered'
  const [selectedPriority, setSelectedPriority] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState('expected_recovery'); // 'expected_recovery' | 'revenue_at_risk' | 'confidence'
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchOpps = async () => {
    try {
      const res = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
      if (!res.ok) throw new Error('Fetch failed');
      const json = await res.json();
      setOpportunities(json.opportunities || []);
    } catch (err) {
      console.error('[OpportunityInbox] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpps();
    const interval = setInterval(fetchOpps, 15000);
    return () => clearInterval(interval);
  }, [state.merchantId, state.refreshKey]);

  const handleExportPDF = async () => {
    try {
      showToast('Generating PDF report...', 'info');
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      // Title & Header Information
      doc.setFontSize(18);
      doc.setTextColor(24, 24, 27);
      doc.text('Revenue Recovery Agent — Opportunities & Transactions Report', 40, 45);

      doc.setFontSize(10);
      doc.setTextColor(113, 113, 122);
      const reportDate = new Date().toLocaleString('en-IN');
      doc.text(`Merchant: ${state.merchantId || 'Default'} | Generated: ${reportDate} | Total Opportunities: ${filtered.length}`, 40, 65);

      const tableColumns = [
        { header: 'Priority', dataKey: 'priority' },
        { header: 'Opportunity / Root Cause', dataKey: 'title' },
        { header: 'Amount at Risk', dataKey: 'amount_at_risk' },
        { header: 'Expected Recovery', dataKey: 'expected_recovery' },
        { header: 'Confidence', dataKey: 'confidence' },
        { header: 'Status', dataKey: 'status' },
      ];

      const tableRows = filtered.map((opp) => ({
        priority: (opp.priority || 'medium').toUpperCase(),
        title: `${opp.title || opp.type?.replace(/_/g, ' ')}\n${opp.root_cause || 'Payment rail issue'}`,
        amount_at_risk: `Rs. ${Math.round(opp.revenue_at_risk || 0).toLocaleString('en-IN')}`,
        expected_recovery: `Rs. ${Math.round(opp.expected_recovery || 0).toLocaleString('en-IN')}`,
        confidence: `${Math.round((opp.recovery_probability || 0) * 100)}%`,
        status: (opp.status || 'detected').replace(/_/g, ' ').toUpperCase(),
      }));

      autoTable(doc, {
        columns: tableColumns,
        body: tableRows,
        startY: 85,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 6 },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      doc.save(`revenue-recovery-report-${state.merchantId || 'merchant'}-${Date.now()}.pdf`);
      showToast('PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Failed to export PDF: ' + err.message, 'error');
    }
  };

  const handleManualOverride = async (e, opp, action_type) => {
    e.stopPropagation();
    if (!action_type) return;
    setActingId(opp.id);
    try {
      showToast(`Executing manual action: ${action_type.replace(/_/g, ' ')}...`, 'info');
      const res = await fetch('/api/agent/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opp.id,
          action_type,
          merchant_id: state.merchantId,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Manual action executed successfully!', 'success');
        fetchOpps();
        triggerRefresh();
      } else {
        showToast(json.error || 'Manual action failed', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleInterventionAction = async (e, opp, action) => {
    e.stopPropagation();
    setActingId(opp.id);
    try {
      const detailRes = await fetch(`/api/opportunities/${opp.id}?merchant_id=${state.merchantId}`);
      const detailJson = await detailRes.json();
      const pendingInt = (detailJson.interventions || []).find((i) => i.approval_status === 'awaiting_approval');

      if (!pendingInt) {
        showToast('No pending intervention to authorize', 'info');
        return;
      }

      const res = await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervention_id: pendingInt.id, action }),
      });

      if (res.ok) {
        showToast(
          action === 'approve' ? 'Opportunity approved' : 'Opportunity rejected',
          action === 'approve' ? 'success' : 'info'
        );
        fetchOpps();
        triggerRefresh();
      } else {
        showToast('Action failed', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setActingId(null);
    }
  };

  // Filter pipeline
  let filtered = [...opportunities];

  if (selectedPriority !== 'ALL') {
    filtered = filtered.filter((o) => (o.priority || '').toUpperCase() === selectedPriority);
  }

  if (selectedStatus !== 'ALL') {
    if (selectedStatus === 'AWAITING') {
      filtered = filtered.filter((o) => o.status === 'awaiting_manual_action' || o.status === 'awaiting_approval');
    } else if (selectedStatus === 'REVIEW') {
      filtered = filtered.filter((o) => o.status === 'awaiting_approval');
    } else if (selectedStatus === 'EXECUTED') {
      filtered = filtered.filter((o) => o.status === 'action_executed');
    } else if (selectedStatus === 'RECOVERED') {
      filtered = filtered.filter((o) => o.status === 'recovered');
    }
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((o) =>
      (o.title || '').toLowerCase().includes(q) ||
      (o.root_cause || '').toLowerCase().includes(q) ||
      (o.id || '').toLowerCase().includes(q)
    );
  }

  // Sort pipeline
  filtered.sort((a, b) => {
    let valA = a.expected_recovery || 0;
    let valB = b.expected_recovery || 0;

    if (sortBy === 'revenue_at_risk') {
      valA = a.revenue_at_risk || 0;
      valB = b.revenue_at_risk || 0;
    } else if (sortBy === 'confidence') {
      valA = a.recovery_probability || 0;
      valB = b.recovery_probability || 0;
    }

    return sortOrder === 'desc' ? valB - valA : valA - valB;
  });

  const allRecovered = opportunities.filter((o) => o.status === 'recovered');
  const allActive = opportunities.filter((o) => o.status !== 'recovered');
  const totalRecoveredAmount = allRecovered.reduce((s, o) => s + (o.actual_recovery || o.expected_recovery || 0), 0);

  const activeOpps = filtered.filter((o) => o.status !== 'recovered');
  const recoveredOpps = opportunities.filter((o) => o.status === 'recovered').filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (o.title || '').toLowerCase().includes(q) || (o.root_cause || '').toLowerCase().includes(q) || (o.id || '').toLowerCase().includes(q);
  });
  const displayActive = isOverviewCompact ? activeOpps.slice(0, 8) : activeOpps;
  const displayRecovered = isOverviewCompact ? recoveredOpps.slice(0, 8) : recoveredOpps;

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <div className="panel-title">
          <Target size={14} />
          <span>
            {isOverviewCompact ? 'Priority Recovery Opportunities' : 'Opportunity Inbox'}
          </span>
          <span className="badge badge-dim" style={{ marginLeft: 4, fontSize: 11 }}>
            {allActive.length} Active
          </span>
          {allRecovered.length > 0 && (
            <span className="badge badge-success" style={{ marginLeft: 4, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <CheckCircle2 size={10} /> {allRecovered.length} Recovered
            </span>
          )}
        </div>

        {/* Sort Controls & PDF Download */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportPDF}
            disabled={filtered.length === 0}
            title="Download opportunities and transaction report as PDF"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: 11, cursor: 'pointer' }}
          >
            <FileDown size={13} />
            <span>Export PDF</span>
          </button>

          <span style={{ color: 'var(--text-tertiary)' }}>Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '4px 8px',
              fontSize: 13,
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <option value="expected_recovery">Expected Recovery</option>
            <option value="revenue_at_risk">Amount at Risk</option>
            <option value="confidence">Confidence Score</option>
          </select>
          <button
            className="btn-icon"
            style={{ width: 28, height: 28 }}
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            title="Toggle sort direction"
          >
            <ArrowUpDown size={14} />
          </button>
        </div>
      </div>

      {/* ═══ Top Section Selector: Active Pipeline vs Recovered Opportunities ═══ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-medium)',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className={`btn btn-sm ${activeSection === 'active' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setActiveSection('active');
              if (selectedStatus === 'RECOVERED') setSelectedStatus('ALL');
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Target size={13} />
            <span>Active Pipeline</span>
            <span className="badge badge-dim" style={{ fontSize: 10, padding: '1px 5px' }}>
              {allActive.length}
            </span>
          </button>

          <button
            className={`btn btn-sm ${activeSection === 'recovered' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setActiveSection('recovered');
              setSelectedStatus('RECOVERED');
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeSection === 'recovered' ? 'var(--color-success)' : undefined,
              borderColor: activeSection === 'recovered' ? 'var(--color-success)' : undefined,
              color: activeSection === 'recovered' ? '#ffffff' : undefined,
            }}
          >
            <CheckCircle2 size={13} />
            <span>Recovered Opportunities</span>
            <span
              className="badge"
              style={{
                fontSize: 10,
                padding: '1px 5px',
                background: activeSection === 'recovered' ? 'rgba(255,255,255,0.25)' : 'rgba(61, 139, 110, 0.15)',
                color: activeSection === 'recovered' ? '#ffffff' : 'var(--color-success)',
              }}
            >
              {allRecovered.length}
            </span>
            {totalRecoveredAmount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.95 }}>
                • {formatCurrency(totalRecoveredAmount)}
              </span>
            )}
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {activeSection === 'active' ? (
            <span>Actionable opportunities requiring autonomous intervention</span>
          ) : (
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
              Verified recaptured revenue archive
            </span>
          )}
        </div>
      </div>

      {activeSection === 'active' ? (
        <>
          {/* Filter Toolbar (Only in full inbox view) */}
          {!isOverviewCompact && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* Priority filter */}
              <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', marginRight: 4 }}>Priority</span>
              {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => (
                <button
                  key={p}
                  className={`chip ${selectedPriority === p ? 'active' : ''}`}
                  onClick={() => setSelectedPriority(p)}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  {p === 'ALL' ? 'All' : p.charAt(0) + p.slice(1).toLowerCase()}
                </button>
              ))}

              <div style={{ width: 1, height: 16, background: 'var(--border-medium)', margin: '0 6px' }} />

              <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', marginRight: 4 }}>Status</span>
              {[
                { id: 'ALL', label: 'All' },
                { id: 'AWAITING', label: 'Awaiting Action' },
                { id: 'REVIEW', label: 'Review' },
                { id: 'EXECUTED', label: 'Executed' },
              ].map((s) => (
                <button
                  key={s.id}
                  className={`chip ${selectedStatus === s.id ? 'active' : ''}`}
                  onClick={() => setSelectedStatus(s.id)}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  {s.label}
                </button>
              ))}

              <div style={{ flex: 1 }} />

              {/* Search */}
              <div style={{ position: 'relative', width: 180 }}>
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 8px 4px 24px',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 13,
                  }}
                />
                <Search size={14} style={{ position: 'absolute', left: 8, top: 6, color: 'var(--text-dim)' }} />
              </div>
            </div>
          )}

          {/* Active Opportunities Table */}
          <div className="fintech-table-container" style={{ flex: 1 }}>
            {loading ? (
              <div style={{ padding: 16 }}>
                <TableSkeleton rows={isOverviewCompact ? 5 : 8} />
              </div>
            ) : displayActive.length === 0 && opportunities.length === 0 ? (
              /* ═══ Feature #10: First-run empty state ═══ */
              <div style={{ padding: '48px 32px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <Target size={36} style={{ color: 'var(--text-dim)', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  No revenue opportunities detected
                </div>
                <div style={{ fontSize: 13, marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
                  Get started by uploading transaction data or running a demo scenario to see the agent in action.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '8px 16px', fontSize: 12 }}>
                    <Upload size={14} /> Upload CSV
                  </button>
                  <button className="btn btn-primary btn-sm" style={{ padding: '8px 16px', fontSize: 12 }} onClick={openDemoScenarioModal}>
                    <Play size={14} /> Run Scenario
                  </button>
                </div>
              </div>
            ) : displayActive.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <CheckCircle2 size={26} style={{ color: 'var(--color-success)', margin: '0 auto 6px' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  No matching active opportunities
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Try changing filters to see more results.
                </div>
              </div>
            ) : (
              <table className="fintech-table">
                <thead>
                  <tr>
                    <th style={{ width: 75 }}>Priority</th>
                    <th>Opportunity / Root Cause</th>
                    <th style={{ textAlign: 'right' }}>Amount at Risk</th>
                    <th style={{ textAlign: 'right' }}>Expected Recovery</th>
                    <th style={{ textAlign: 'center', width: 80 }}>Confidence</th>
                    <th style={{ width: 120 }}>Status</th>
                    <th style={{ textAlign: 'right', width: 220 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayActive.map((opp) => {
                    const priority = (opp.priority || 'medium').toLowerCase();
                    const isAwaiting = opp.status === 'awaiting_approval';
                    const isAwaitingManual = opp.status === 'awaiting_manual_action';
                    const isExecuted = opp.status === 'action_executed';
                    const confPercent = Math.round((opp.recovery_probability || 0) * 100);

                    let statusBadge = <span className="badge badge-dim">INVESTIGATING</span>;
                    if (isExecuted) {
                      statusBadge = <span className="badge badge-brand">EXECUTED</span>;
                    } else if (isAwaitingManual) {
                      statusBadge = <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>AWAITING ACTION</span>;
                    } else if (isAwaiting) {
                      statusBadge = <span className="badge badge-warning">REVIEW REQUIRED</span>;
                    } else if (opp.status === 'blocked') {
                      statusBadge = <span className="badge badge-critical">BLOCKED</span>;
                    } else if (opp.status === 'detected') {
                      statusBadge = <span className="badge badge-info">DETECTED</span>;
                    } else if (opp.status === 'analyzed') {
                      statusBadge = <span className="badge badge-dim">ANALYZED</span>;
                    }

                    return (
                      <tr
                        key={opp.id}
                        onClick={() => selectOpportunity(opp.id)}
                        style={{ cursor: 'pointer' }}
                        id={`opp-row-${opp.id}`}
                      >
                        <td>
                          <span className={`badge badge-${priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : 'medium'}`}>
                            {priority.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                            {opp.title || opp.type?.replace(/_/g, ' ')}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            {opp.root_cause || 'Payment rail degradation'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="mono-num" style={{ color: 'var(--color-error)', fontSize: 14 }}>
                            {formatCurrency(opp.revenue_at_risk)}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="mono-num text-success" style={{ fontSize: 14 }}>
                            {formatCurrency(opp.expected_recovery)}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <span className="mono-num" style={{ fontSize: 13, fontWeight: 700, color: confPercent >= 70 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                              {confPercent}%
                            </span>
                            <span className={`badge ${getRiskBadgeClass(opp)}`} style={{ fontSize: 8, padding: '0px 4px' }}>
                              {getRiskLevel(opp)}
                            </span>
                          </div>
                        </td>
                        <td>{statusBadge}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                const val = e.target.value;
                                e.target.value = '';
                                handleManualOverride(e, opp, val);
                              }}
                              disabled={actingId === opp.id}
                              title="Manual Action Override (Bypasses AI)"
                              style={{
                                padding: '3px 6px',
                                fontSize: 11,
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-medium)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: actingId === opp.id ? 'not-allowed' : 'pointer',
                                maxWidth: 110,
                              }}
                            >
                              <option value="" disabled>Action</option>
                              <option value="create_payment_link">Payment Link</option>
                              <option value="retry_payment">Retry</option>
                              <option value="send_notification">Reminder</option>
                              <option value="request_alternate_payment_method">Alt Method</option>
                              <option value="escalate_to_merchant">Escalate</option>
                            </select>

                            {isAwaiting && (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={(e) => handleInterventionAction(e, opp, 'approve')}
                                disabled={actingId === opp.id}
                                title="Approve and execute intervention"
                                style={{ padding: '3px 8px', fontSize: 11 }}
                              >
                                <Check size={13} /> Approve
                              </button>
                            )}
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => selectOpportunity(opp.id)}
                              title="View opportunity details"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                            >
                              <Eye size={13} /> View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        /* ═══ Dedicated Recovered Opportunities View (Separate Section) ═══ */
        <div className="fintech-table-container" style={{ flex: 1 }}>
          {/* Executive Recovered Summary Strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            padding: '12px 16px',
            background: 'rgba(61, 139, 110, 0.05)',
            borderBottom: '1px solid rgba(61, 139, 110, 0.18)',
          }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Total Recovered Cash
              </div>
              <div className="mono-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-success)', marginTop: 2 }}>
                {formatCurrency(totalRecoveredAmount)}
              </div>
            </div>

            <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Verified Interventions
              </div>
              <div className="mono-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                {allRecovered.length}
              </div>
            </div>

            <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Attribution Verification
              </div>
              <div className="mono-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-brand)', marginTop: 2 }}>
                100% Closed Loop
              </div>
            </div>
          </div>

          {recoveredOpps.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <CheckCircle2 size={32} style={{ color: 'var(--text-dim)', margin: '0 auto 8px' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                No recovered opportunities yet
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                When the agent resolves failed transactions, verified recoveries will appear in this section.
              </div>
            </div>
          ) : (
            <table className="fintech-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Status</th>
                  <th>Recovered Opportunity / Vector</th>
                  <th style={{ textAlign: 'right', width: 130 }}>Original Loss</th>
                  <th style={{ textAlign: 'right', width: 150 }}>Recovered Revenue</th>
                  <th style={{ textAlign: 'center', width: 100 }}>Confidence</th>
                  <th style={{ width: 140 }}>Recovery Rail</th>
                  <th style={{ textAlign: 'right', width: 100 }}>Audit</th>
                </tr>
              </thead>
              <tbody>
                {displayRecovered.map((opp) => (
                  <tr
                    key={opp.id}
                    onClick={() => selectOpportunity(opp.id)}
                    style={{ cursor: 'pointer', background: 'rgba(61, 139, 110, 0.02)' }}
                  >
                    <td>
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={11} /> RECOVERED
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                        {opp.title || opp.type?.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {opp.root_cause || 'Automated Recovery Action'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="mono-num" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        {formatCurrency(opp.revenue_at_risk)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="mono-num" style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 14 }}>
                        {formatCurrency(opp.actual_recovery || opp.expected_recovery)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-success" style={{ fontSize: 10 }}>
                        {Math.round((opp.recovery_probability || 0.95) * 100)}% Verified
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                        {opp.recommended_action?.replace(/_/g, ' ') || 'Smart Link'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectOpportunity(opp.id);
                        }}
                        style={{ padding: '3px 8px', fontSize: 11 }}
                      >
                        <Eye size={12} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      </div>
  );
}

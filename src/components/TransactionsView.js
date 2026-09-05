'use client';

import { useState, useEffect } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { showToast } from './Toast';
import {
  Receipt,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  CreditCard,
  Smartphone,
  Building,
  Copy,
  Check,
  FileDown,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

export function TransactionsView() {
  const { state, triggerRefresh } = useDashboardState();
  const [transactions, setTransactions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'captured' | 'failed'
  const [methodFilter, setMethodFilter] = useState('all'); // 'all' | 'upi' | 'card' | 'netbanking'
  const [searchQuery, setSearchQuery] = useState('');
  const [limit, setLimit] = useState('all'); // 'all' by default to display all records
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, hasMore: false });

  const fetchTransactions = async (pageToFetch = page) => {
    try {
      setLoading(true);
      const isAll = limit === 'all';
      const parsedLimit = isAll ? 'all' : parseInt(limit, 10);
      const offset = isAll ? 0 : (pageToFetch - 1) * parsedLimit;

      const params = new URLSearchParams({
        merchant_id: state.merchantId || 'merchant_rzp_test',
        status: statusFilter,
        method: methodFilter,
        search: searchQuery,
        limit: parsedLimit,
        offset: offset,
      });
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch transactions');
      const data = await res.json();
      setTransactions(data.transactions || []);
      setMetrics(data.metrics || null);
      setPagination(data.pagination || {
        total: data.transactions?.length || 0,
        limit: parsedLimit,
        offset: offset,
        page: pageToFetch,
        totalPages: 1,
        hasMore: false,
      });
    } catch (err) {
      console.error('[TransactionsView] Fetch error:', err);
      showToast('Error loading transactions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions(page);
    const interval = setInterval(() => fetchTransactions(page), 15000);
    return () => clearInterval(interval);
  }, [state.merchantId, statusFilter, methodFilter, searchQuery, limit, page, state.refreshKey]);

  const handleSyncData = async () => {
    try {
      setIsSyncing(true);
      showToast('Syncing latest transactions...', 'info');
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: state.merchantId || 'merchant_rzp_test' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync transactions');

      const syncedCount = data.total_synced ?? ((data.captured_count || 0) + (data.failed_count || 0));
      showToast(`Successfully synced ${syncedCount} transactions!`, 'success');
      setPage(1);
      await fetchTransactions(1);
      triggerRefresh();
    } catch (err) {
      console.error('[TransactionsView] Sync error:', err);
      showToast('Sync error: ' + err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportCSV = () => {
    if (transactions.length === 0) {
      showToast('No transactions to export', 'info');
      return;
    }
    const headers = ['Transaction ID', 'Customer ID', 'Amount (INR)', 'Method', 'Status', 'Failure Reason', 'Error Code', 'Date'];
    const rows = transactions.map((t) => [
      t.id,
      t.customer_id || '',
      t.amount,
      t.method || '',
      t.status,
      t.failure_reason || '',
      t.error_code || '',
      t.created_at,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `transactions-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV exported successfully!', 'success');
  };

  const getMethodIcon = (method) => {
    switch (method?.toLowerCase()) {
      case 'upi':
        return <Smartphone size={13} style={{ color: '#8b5cf6' }} />;
      case 'card':
        return <CreditCard size={13} style={{ color: '#3b82f6' }} />;
      case 'netbanking':
        return <Building size={13} style={{ color: '#10b981' }} />;
      default:
        return <Receipt size={13} style={{ color: 'var(--text-dim)' }} />;
    }
  };

  const totalCount = pagination?.total ?? transactions.length;
  const parsedLimit = limit === 'all' ? totalCount : parseInt(limit, 10);
  const startRow = totalCount === 0 ? 0 : (limit === 'all' ? 1 : (page - 1) * parsedLimit + 1);
  const endRow = limit === 'all' ? totalCount : Math.min(page * parsedLimit, totalCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ═══ Metrics Cards ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <div className="panel" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
            Total Transactions
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            {metrics?.total_count?.toLocaleString('en-IN') || 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            Raw ingested volume
          </div>
        </div>

        <div className="panel" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle2 size={13} />
            <span>Captured Revenue</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-success)' }}>
            {formatCurrency(metrics?.captured_volume || 0)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            {metrics?.captured_count || 0} successful payments
          </div>
        </div>

        <div className="panel" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-error)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <XCircle size={13} />
            <span>Failed Revenue at Risk</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-error)' }}>
            {formatCurrency(metrics?.failed_volume || 0)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            {metrics?.failed_count || 0} failed payments
          </div>
        </div>

        <div className="panel" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-brand)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <TrendingUp size={13} />
            <span>Success Rate</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            {metrics?.success_rate || 0}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            Baseline healthy target: 95%+
          </div>
        </div>
      </div>

      {/* ═══ Main Transactions Panel ═══ */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Panel Header */}
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="panel-title">
            <Receipt size={15} />
            <span>Raw Transaction Stream</span>
            <span className="badge badge-dim" style={{ marginLeft: 6, fontSize: 11 }}>
              {limit === 'all'
                ? `${transactions.length} displayed (All)`
                : `${transactions.length} of ${totalCount} displayed`}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleExportCSV}
              disabled={transactions.length === 0}
              title="Export visible transactions to CSV"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}
            >
              <FileDown size={13} />
              <span>Export CSV</span>
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={handleSyncData}
              disabled={isSyncing}
              title="Sync and refresh latest transactions from gateway"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 12, cursor: isSyncing ? 'not-allowed' : 'pointer' }}
            >
              <RefreshCw size={13} className={isSyncing ? 'spin-animation' : ''} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Transactions'}</span>
            </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--bg-secondary)' }}>
          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', marginRight: 4 }}>
              Status
            </span>
            {[
              { id: 'all', label: 'All' },
              { id: 'captured', label: 'Captured (Success)' },
              { id: 'failed', label: 'Failed' },
            ].map((s) => (
              <button
                key={s.id}
                className={`chip ${statusFilter === s.id ? 'active' : ''}`}
                onClick={() => { setStatusFilter(s.id); setPage(1); }}
                style={{ padding: '3px 9px', fontSize: 11 }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 16, background: 'var(--border-medium)' }} />

          {/* Method Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', marginRight: 4 }}>
              Method
            </span>
            {[
              { id: 'all', label: 'All' },
              { id: 'upi', label: 'UPI' },
              { id: 'card', label: 'Card' },
              { id: 'netbanking', label: 'Netbanking' },
            ].map((m) => (
              <button
                key={m.id}
                className={`chip ${methodFilter === m.id ? 'active' : ''}`}
                onClick={() => { setMethodFilter(m.id); setPage(1); }}
                style={{ padding: '3px 9px', fontSize: 11 }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 16, background: 'var(--border-medium)' }} />

          {/* Rows Limit Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', marginRight: 4 }}>
              Display
            </span>
            {[
              { id: 'all', label: 'All' },
              { id: '250', label: '250' },
              { id: '100', label: '100' },
              { id: '50', label: '50' },
              { id: '25', label: '25' },
            ].map((r) => (
              <button
                key={r.id}
                className={`chip ${limit === r.id ? 'active' : ''}`}
                onClick={() => { setLimit(r.id); setPage(1); }}
                style={{ padding: '3px 8px', fontSize: 11 }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Search Box */}
          <div style={{ position: 'relative', width: 220 }}>
            <input
              type="text"
              placeholder="Search ID, method, error..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              style={{
                width: '100%',
                padding: '5px 8px 5px 26px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
              }}
            />
            <Search size={13} style={{ position: 'absolute', left: 8, top: 7, color: 'var(--text-dim)' }} />
          </div>
        </div>

        {/* Transactions Table */}
        <div className="fintech-table-container" style={{ maxHeight: 540, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <RefreshCw size={20} className="spin-animation" style={{ margin: '0 auto 8px', color: 'var(--color-brand)' }} />
              <div>Loading transaction stream...</div>
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <Receipt size={32} style={{ margin: '0 auto 8px', color: 'var(--text-dim)' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                No transactions found
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Click <strong>"Sync Transactions"</strong> above to ingest a new batch from gateway.
              </div>
            </div>
          ) : (
            <table className="fintech-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-secondary)' }}>
                <tr>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 190 }}>Transaction ID</th>
                  <th style={{ width: 150 }}>Customer ID</th>
                  <th style={{ width: 110 }}>Method</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Amount</th>
                  <th>Failure Reason / Code</th>
                  <th style={{ textAlign: 'right', width: 150 }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const isCaptured = t.status === 'captured' || t.status === 'authorized';
                  return (
                    <tr key={t.id}>
                      {/* Status */}
                      <td>
                        {isCaptured ? (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={11} /> CAPTURED
                          </span>
                        ) : (
                          <span className="badge badge-critical" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <XCircle size={11} /> FAILED
                          </span>
                        )}
                      </td>

                      {/* Transaction ID */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="mono-num" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                            {t.id}
                          </span>
                          <button
                            className="btn-icon"
                            onClick={() => handleCopyId(t.id)}
                            title="Copy Transaction ID"
                            style={{ width: 20, height: 20, padding: 2 }}
                          >
                            {copiedId === t.id ? <Check size={11} style={{ color: 'var(--color-success)' }} /> : <Copy size={11} />}
                          </button>
                        </div>
                      </td>

                      {/* Customer ID */}
                      <td>
                        <span className="mono-num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {t.customer_id || '—'}
                        </span>
                      </td>

                      {/* Method */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, textTransform: 'capitalize' }}>
                          {getMethodIcon(t.method)}
                          <span>{t.method || '—'}</span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td style={{ textAlign: 'right' }}>
                        <span className="mono-num" style={{ fontWeight: 600, fontSize: 13, color: isCaptured ? 'var(--color-success)' : 'var(--color-error)' }}>
                          {formatCurrency(t.amount)}
                        </span>
                      </td>

                      {/* Failure Reason */}
                      <td>
                        {isCaptured ? (
                          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                        ) : (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-error)' }}>
                              {(t.failure_reason || 'Unknown failure').replace(/_/g, ' ')}
                            </div>
                            {t.error_code && (
                              <div className="mono-num" style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                                {t.error_code}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Timestamp */}
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {formatDate(t.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderTop: '1px solid var(--border-medium)',
            background: 'var(--bg-secondary)',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          <div>
            Showing <strong style={{ color: 'var(--text-primary)' }}>{startRow}</strong> to{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{endRow}</strong> of{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{totalCount.toLocaleString('en-IN')}</strong> transactions
          </div>

          {limit !== 'all' && pagination.totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '3px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <ChevronLeft size={13} />
                <span>Prev</span>
              </button>

              <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: '0 6px' }}>
                Page <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> of{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{pagination.totalPages}</strong>
              </span>

              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= pagination.totalPages || loading}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                style={{ padding: '3px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span>Next</span>
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

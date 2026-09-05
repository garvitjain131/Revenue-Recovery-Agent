'use client';

import { useState, useEffect } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { LayoutDashboard, Target, Sliders, Menu, Receipt } from 'lucide-react';

export function Sidebar() {
  const { state, setActiveTab, toggleSettings, toggleSidebar } = useDashboardState();
  const [oppCount, setOppCount] = useState(0);
  const [txnCount, setTxnCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
        if (res.ok) {
          const json = await res.json();
          setOppCount((json.opportunities || []).length);
        }
        const txnRes = await fetch(`/api/transactions?merchant_id=${state.merchantId}&limit=1`);
        if (txnRes.ok) {
          const txnJson = await txnRes.json();
          setTxnCount(txnJson.metrics?.total_count || 0);
        }
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => clearInterval(interval);
  }, [state.merchantId, state.refreshKey]);

  return (
    <aside className={`fintech-sidebar ${!state.isSidebarOpen ? 'sidebar-closed' : ''}`}>
      <div style={{ display: 'flex', justifyContent: state.isSidebarOpen ? 'flex-end' : 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-medium)' }}>
        <button className="btn-icon" onClick={toggleSidebar} aria-label="Toggle Sidebar" style={{ padding: 4, background: 'transparent', border: 'none' }}>
          <Menu size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-item ${state.activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <div className="sidebar-nav-item-left">
            <LayoutDashboard size={15} />
            <span>Overview</span>
          </div>
        </button>

        <button
          className={`sidebar-nav-item ${state.activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('inbox')}
        >
          <div className="sidebar-nav-item-left">
            <Target size={15} />
            <span>Opportunities</span>
          </div>
          {oppCount > 0 && (
            <span className="sidebar-count">{oppCount}</span>
          )}
        </button>

        <button
          className={`sidebar-nav-item ${state.activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          <div className="sidebar-nav-item-left">
            <Receipt size={15} />
            <span>Transactions</span>
          </div>
          {txnCount > 0 && (
            <span className="sidebar-count" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              {txnCount}
            </span>
          )}
        </button>

        <div className="sidebar-separator" />

        <button
          className="sidebar-nav-item"
          onClick={toggleSettings}
        >
          <div className="sidebar-nav-item-left">
            <Sliders size={15} />
            <span>Policy Guardrails</span>
          </div>
        </button>
      </nav>
    </aside>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { HeroMetrics } from '@/components/HeroMetrics';
import { RecoveryFunnel } from '@/components/RecoveryFunnel';
import { RecoveryGrid } from '@/components/RecoveryGrid';
import { CustomerScorecard } from '@/components/CustomerScorecard';
import { AnalyticsCharts } from '@/components/AnalyticsCharts';
import { ActivityFeed } from '@/components/ActivityFeed';
import { BenchmarkView } from '@/components/BenchmarkView';
import { DecisionExplanationModal } from '@/components/DecisionExplanationModal';
import { useDashboardState } from '@/hooks/useDashboardState';
import {
  LayoutDashboard, Target, Award, ShieldCheck,
  TrendingUp, RefreshCw, DollarSign
} from 'lucide-react';

export default function Page() {
  const { state } = useDashboardState();
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`/api/dashboard?merchant_id=${state.merchantId}`);
      if (res.ok) {
        const json = await res.json();
        setDashboardData(json);
      }
    } catch (err) {
      console.error('[Dashboard Page] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, [state.merchantId]);

  return (
    <div className="dashboard-content" style={{ animation: 'fadeIn 0.4s ease' }}>
      <a href="#main" className="skip-to-content">Skip to content</a>

      {/* Top Hero Metrics Strip */}
      <HeroMetrics />

      {/* Navigation Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: 20,
        paddingBottom: 4,
      }}>
        <button
          className={`chip ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}
        >
          <LayoutDashboard size={15} /> Command Center
        </button>

        <button
          className={`chip ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('inbox')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}
        >
          <Target size={15} /> Opportunity Inbox
          {dashboardData?.opportunities?.length ? (
            <span className="badge badge-dim" style={{ marginLeft: 4, padding: '1px 6px', fontSize: 10 }}>
              {dashboardData.opportunities.length}
            </span>
          ) : null}
        </button>

        <button
          className={`chip ${activeTab === 'benchmark' ? 'active' : ''}`}
          onClick={() => setActiveTab('benchmark')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}
        >
          <Award size={15} /> Benchmark & Evaluation
        </button>

        <button
          className={`chip ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}
        >
          <ShieldCheck size={15} /> Governance & Audit Trail
        </button>
      </div>

      {/* Tab 1: Overview Command Center */}
      {activeTab === 'overview' && (
        <div>
          {/* Recovery Funnel */}
          <RecoveryFunnel funnelData={dashboardData?.funnel} />

          <div className="dashboard-grid" style={{ marginBottom: 24 }}>
            <RecoveryGrid />
            <CustomerScorecard />
          </div>

          <AnalyticsCharts />
          <ActivityFeed />
        </div>
      )}

      {/* Tab 2: Opportunity Inbox */}
      {activeTab === 'inbox' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          <RecoveryGrid />
          <CustomerScorecard />
        </div>
      )}

      {/* Tab 3: Empirical Benchmark & Evaluations */}
      {activeTab === 'benchmark' && (
        <BenchmarkView />
      )}

      {/* Tab 4: Governance & Audit Trail */}
      {activeTab === 'audit' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          <ActivityFeed />
        </div>
      )}

      {/* Decision Explanation Modal */}
      <DecisionExplanationModal />
    </div>
  );
}

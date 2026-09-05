'use client';

import { useState, useEffect } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { HeroMetrics } from '@/components/HeroMetrics';
import { RecoveryFunnel } from '@/components/RecoveryFunnel';
import { OpportunityInbox } from '@/components/OpportunityInbox';
import { AnalyticsCharts } from '@/components/AnalyticsCharts';

import { TransactionsView } from '@/components/TransactionsView';

export default function Page() {
  const { state } = useDashboardState();
  const [dashboardData, setDashboardData] = useState(null);

  const fetchDashboard = async () => {
    try {
      const merchantId = state.merchantId || 'merchant_rzp_test';
      const res = await fetch(`/api/dashboard?merchant_id=${merchantId}`);
      if (res.ok) {
        const json = await res.json();
        setDashboardData(json);
      }
    } catch (err) {
      console.error('[Dashboard] Fetch error:', err);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, [state.merchantId, state.refreshKey]);

  return (
    <div>
      {/* Overview */}
      {state.activeTab === 'overview' && (
        <>
          <HeroMetrics />
          <RecoveryFunnel funnelData={dashboardData?.funnel} />
          <div style={{ marginTop: 16 }}>
            <OpportunityInbox isOverviewCompact={true} />
          </div>
          <div style={{ marginTop: 16 }}>
            <AnalyticsCharts />
          </div>
        </>
      )}

      {/* Opportunities */}
      {state.activeTab === 'inbox' && (
        <OpportunityInbox isOverviewCompact={false} />
      )}

      {/* Transactions Explorer */}
      {state.activeTab === 'transactions' && (
        <TransactionsView />
      )}
    </div>
  );
}

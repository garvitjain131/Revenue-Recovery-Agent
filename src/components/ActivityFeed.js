'use client';

import { useEffect, useRef, useState } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { ActivitySkeleton } from './Skeletons';
import {
  Activity, CheckCircle, XCircle, Clock, Search, Link2, Mail,
  RefreshCw, Target, Microscope, ClipboardList, Zap, DollarSign,
  Play, AlertTriangle, Inbox
} from 'lucide-react';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const ICON_MAP = {
  completed: CheckCircle,
  success: CheckCircle,
  recovered: DollarSign,
  error: XCircle,
  failed: XCircle,
  pending: Clock,
  investigating: Search,
  create_payment_link: Link2,
  send_notification: Mail,
  retry_payment: RefreshCw,
  opportunity_detected: Target,
  opportunity_analyzed: Microscope,
  intervention_created: ClipboardList,
  intervention_executed: Zap,
  recovery_confirmed: DollarSign,
  agent_run_started: Play,
  agent_run_completed: CheckCircle,
};

function getIcon(type) {
  const IconComponent = ICON_MAP[type] || Activity;
  return <IconComponent size={16} />;
}

function getVariant(type) {
  if (['completed', 'success', 'recovered', 'recovery_confirmed', 'agent_run_completed'].includes(type)) return 'success';
  if (['error', 'failed'].includes(type)) return 'error';
  if (['pending', 'investigating'].includes(type)) return 'warning';
  return '';
}

export function ActivityFeed() {
  const { state } = useDashboardState();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterErrors, setFilterErrors] = useState(false);
  const feedRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/dashboard/activity?merchant_id=${state.merchantId}`);
        if (!res.ok) throw new Error('Failed');
        const json = await res.json();
        if (!cancelled) { setActivities(json); setLoading(false); }
      } catch (err) {
        console.error('[ActivityFeed]', err);
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [state.merchantId]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [activities]);

  const filtered = filterErrors
    ? activities.filter(a => ['error', 'failed', 'warning'].includes(a.type))
    : activities;

  return (
    <div className="card section">
      <div className="section-header">
        <h2 className="section-title">
          <span className="section-title-icon"><Activity size={18} /></span>
          Agent Activity
        </h2>
        <button
          className={`chip ${filterErrors ? 'active' : ''}`}
          onClick={() => setFilterErrors(!filterErrors)}
          aria-label={filterErrors ? 'Show all events' : 'Show errors only'}
        >
          {filterErrors ? (
            <><AlertTriangle size={12} /> Errors Only</>
          ) : (
            'All Events'
          )}
        </button>
      </div>

      {loading ? <ActivitySkeleton /> : (
        <div className="activity-feed" ref={feedRef} role="log" aria-live="polite">
          {filtered.length === 0 && (
            <div className="empty-state" style={{ padding: 32 }}>
              <div className="empty-state-icon"><Inbox size={36} /></div>
              <p>No activity yet. Run the agent to start.</p>
            </div>
          )}
          {filtered.map((activity, idx) => (
            <div
              key={activity.id || idx}
              className={`activity-item ${getVariant(activity.type)}`}
              style={{ animation: `slideIn 0.3s ease ${idx * 30}ms forwards`, opacity: 0 }}
            >
              <div className="activity-icon">{getIcon(activity.type)}</div>
              <div className="activity-content">
                <div className="activity-title">{activity.message || activity.type?.replace(/_/g, ' ') || 'Activity'}</div>
                <div className="activity-timestamp">{timeAgo(activity.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

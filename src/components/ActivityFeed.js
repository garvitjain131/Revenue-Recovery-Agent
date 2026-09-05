'use client';

import { useEffect, useRef, useState } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { ActivitySkeleton } from './Skeletons';
import {
  Activity, CheckCircle, XCircle, Clock, Search, Link2, Mail,
  RefreshCw, Target, Microscope, ClipboardList, Zap, DollarSign,
  Play, AlertTriangle, Inbox, Brain, ShieldCheck, FileSearch
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

// ═══ Feature #8: Type-based icon and color mapping ═══

const TYPE_CATEGORIES = {
  // Detection types
  opportunity_detected: { category: 'detection', icon: Target, color: 'var(--color-brand-light)', label: 'Detection' },
  agent_run_started: { category: 'detection', icon: Play, color: 'var(--color-brand-light)', label: 'Detection' },

  // Diagnosis types
  opportunity_analyzed: { category: 'diagnosis', icon: Microscope, color: 'var(--color-warning)', label: 'Diagnosis' },
  investigating: { category: 'diagnosis', icon: Search, color: 'var(--color-warning)', label: 'Diagnosis' },

  // Action types
  intervention_created: { category: 'action', icon: ClipboardList, color: 'hsl(210, 100%, 60%)', label: 'Action' },
  intervention_executed: { category: 'action', icon: Zap, color: 'hsl(210, 100%, 60%)', label: 'Action' },
  create_payment_link: { category: 'action', icon: Link2, color: 'hsl(210, 100%, 60%)', label: 'Action' },
  send_notification: { category: 'action', icon: Mail, color: 'hsl(210, 100%, 60%)', label: 'Action' },
  retry_payment: { category: 'action', icon: RefreshCw, color: 'hsl(210, 100%, 60%)', label: 'Action' },
  pending: { category: 'action', icon: Clock, color: 'hsl(210, 100%, 60%)', label: 'Action' },

  // Recovery types
  recovery_confirmed: { category: 'recovery', icon: DollarSign, color: 'var(--color-success)', label: 'Recovery' },
  recovered: { category: 'recovery', icon: DollarSign, color: 'var(--color-success)', label: 'Recovery' },
  completed: { category: 'recovery', icon: CheckCircle, color: 'var(--color-success)', label: 'Recovery' },
  success: { category: 'recovery', icon: CheckCircle, color: 'var(--color-success)', label: 'Recovery' },
  agent_run_completed: { category: 'recovery', icon: ShieldCheck, color: 'var(--color-success)', label: 'Recovery' },

  // Error types
  error: { category: 'error', icon: XCircle, color: 'var(--color-error)', label: 'Error' },
  failed: { category: 'error', icon: XCircle, color: 'var(--color-error)', label: 'Error' },
};

function getTypeInfo(type) {
  return TYPE_CATEGORIES[type] || { category: 'detection', icon: Activity, color: 'var(--text-tertiary)', label: 'Event' };
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
          {filtered.map((activity, idx) => {
            const typeInfo = getTypeInfo(activity.type);
            const IconComponent = typeInfo.icon;

            return (
              <div
                key={activity.id || idx}
                className={`activity-item type-${typeInfo.category}`}
                style={{ animation: `slideIn 0.3s ease ${idx * 30}ms forwards`, opacity: 0 }}
              >
                <div className="activity-icon" style={{ color: typeInfo.color }}>
                  <IconComponent size={16} />
                </div>
                <div className="activity-content">
                  <div className="activity-title">
                    {activity.message || activity.type?.replace(/_/g, ' ') || 'Activity'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: typeInfo.color,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {typeInfo.label}
                    </span>
                    <span className="activity-timestamp">{timeAgo(activity.timestamp)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

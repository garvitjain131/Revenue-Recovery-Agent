'use client';

export function HeroMetricSkeleton() {
  return (
    <div className="metric-card" style={{ minHeight: '120px' }}>
      <div className="skeleton" style={{ height: 12, width: '50%', marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 32, width: '70%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '40%' }} />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {[...Array(rows)].map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: i === 0 ? 'var(--radius-md) var(--radius-md) 0 0' : i === rows - 1 ? '0 0 var(--radius-md) var(--radius-md)' : '0' }}>
          <div className="skeleton" style={{ height: 20, width: 60 }} />
          <div className="skeleton" style={{ height: 20, width: 140, flex: 1 }} />
          <div className="skeleton" style={{ height: 20, width: 80 }} />
          <div className="skeleton" style={{ height: 20, width: 60 }} />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="card" style={{ minHeight: 320 }}>
      <div className="skeleton" style={{ height: 16, width: '30%', marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 260, width: '100%', borderRadius: 'var(--radius-md)' }} />
    </div>
  );
}

export function ActivitySkeleton({ rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="activity-item" style={{ borderLeftColor: 'var(--border-medium)' }}>
          <div className="skeleton" style={{ width: 24, height: 24, borderRadius: '50%' }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 11, width: '30%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

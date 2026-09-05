'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertOctagon, AlertTriangle, Info, X } from 'lucide-react';

let toastIdCounter = 0;
let globalSetToasts = null;

export function showToast(message, type = 'info', duration = 3000) {
  if (globalSetToasts) {
    const id = ++toastIdCounter;
    globalSetToasts(prev => [...prev.slice(-2), { id, message, type, duration }]);
    setTimeout(() => {
      globalSetToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }
}

const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

export function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    globalSetToasts = setToasts;
    window.showToast = showToast;
    return () => { globalSetToasts = null; };
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map(toast => {
        const IconComponent = TOAST_ICONS[toast.type] || TOAST_ICONS.info;
        return (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            onClick={() => dismiss(toast.id)}
            style={{ cursor: 'pointer' }}
          >
            <span className="toast-icon">
              <IconComponent size={14} />
            </span>
            <span className="toast-message">{toast.message}</span>
            <button
              style={{ color: 'var(--text-tertiary)', padding: '0 2px' }}
              onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
              aria-label="Dismiss toast"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { Keyboard } from 'lucide-react';

export function KeyboardShortcutsHelp() {
  const [show, setShow] = useState(false);
  const { toggleSettings, setFilter } = useDashboardState();

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case '?':
          e.preventDefault();
          setShow(s => !s);
          break;
        case 's':
          e.preventDefault();
          toggleSettings();
          break;
        case 'f':
          e.preventDefault();
          // Focus or toggle some filter state if needed
          break;
        case 'escape':
          setShow(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSettings]);

  if (!show) return null;

  const shortcuts = [
    { key: '?', desc: 'Show/hide keyboard shortcuts' },
    { key: 'S', desc: 'Open Settings Panel' },
    { key: 'ESC', desc: 'Close modals/settings' },
  ];

  return (
    <div className="modal-overlay" onClick={() => setShow(false)} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <button className="modal-close" onClick={() => setShow(false)}>X</button>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Keyboard size={18} /> Keyboard Shortcuts
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shortcuts.map(sc => (
            <div key={sc.key} className="flex-between" style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sc.desc}</span>
              <kbd style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, boxShadow: '0 1px 1px rgba(0,0,0,0.2)' }}>
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

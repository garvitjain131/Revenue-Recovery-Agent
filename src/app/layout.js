'use client';

import './globals.css';
import { DashboardStateProvider } from '@/hooks/useDashboardState';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { SettingsPanel } from '@/components/SettingsPanel';
import { DecisionExplanationModal } from '@/components/DecisionExplanationModal';
import { KillSwitchModal } from '@/components/KillSwitchModal';
import { Toast } from '@/components/Toast';
import { KeyboardShortcutsHelp } from '@/components/KeyboardShortcuts';

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <title>Revenue Recovery — Opportunity Engine</title>
        <meta name="description" content="Intelligent revenue recovery platform for payment failure detection and automated recovery" />
      </head>
      <body>
        <DashboardStateProvider>
          <div className="fintech-shell">
            <Header />
            <div className="fintech-shell-body">
              <Sidebar />
              <main className="fintech-main-container">
                <div className="fintech-content">
                  <div className="fintech-content-inner">
                    {children}
                  </div>
                </div>
              </main>
            </div>
            <DecisionExplanationModal />
            <SettingsPanel />
            <KillSwitchModal />
            <Toast />
            <KeyboardShortcutsHelp />
          </div>
        </DashboardStateProvider>
      </body>
    </html>
  );
}

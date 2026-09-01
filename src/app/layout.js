import { DashboardStateProvider } from '@/hooks/useDashboardState';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Header } from '@/components/Header';
import { SettingsPanel } from '@/components/SettingsPanel';
import { OpportunityModal } from '@/components/OpportunityModal';
import { Toast } from '@/components/Toast';
import { KeyboardShortcutsHelp } from '@/components/KeyboardShortcuts';

import './globals.css';

export const metadata = {
  title: 'Revenue Recovery Agent',
  description: 'AI-powered revenue intelligence platform for identifying payment failures, cart abandonment, and revenue leaks.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <ThemeProvider>
          <DashboardStateProvider>
            <ErrorBoundary>
              <div className="app-layout">
                <Header />
                <main id="main" role="main" className="app-main">
                  {children}
                </main>
                <SettingsPanel />
                <OpportunityModal />
                <Toast />
                <KeyboardShortcutsHelp />
              </div>
            </ErrorBoundary>
          </DashboardStateProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

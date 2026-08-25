import './globals.css';

export const metadata = {
  title: 'Revenue Intelligence Agent — Razorpay',
  description: 'AI-powered Revenue Recovery Orchestrator that detects, diagnoses, and recovers merchant revenue leakage through Razorpay.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

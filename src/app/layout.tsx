import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'One Speed Management Portal',
  description: 'Reports, cash close-outs and bookkeeping for One Speed Management.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'One Speed', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#1f3d2b', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

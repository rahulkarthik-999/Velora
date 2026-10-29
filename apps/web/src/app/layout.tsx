import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Velora — Start with a goal. Finish with a result.',
  description: 'Velora turns your intentions into actionable workflows and helps you carry them through to completion.',
  metadataBase: new URL('https://veloraweb.online'),
  openGraph: {
    title: 'Velora — Start with a goal. Finish with a result.',
    description: 'Tell Velora what you need to accomplish. It turns your goal into a practical workflow.',
    siteName: 'Velora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Velora — Start with a goal. Finish with a result.',
    description: 'Tell Velora what you need to accomplish. It turns your goal into a practical workflow.',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f0f11',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

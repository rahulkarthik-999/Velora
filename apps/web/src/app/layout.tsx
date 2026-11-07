import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Velora — Your AI Career Companion | Prepare smarter. Practice confidently. Perform better.',
  description:
    'Transform your career preparation with Velora: Resume Intelligence, Job Match Analyzer, Voice AI Mock Interviews, Live Interview Copilot, Technical Interview Assistants (Coding, SQL, System Design), and Personalized Learning Roadmaps.',
  metadataBase: new URL('https://veloraweb.online'),
  openGraph: {
    title: 'Velora — Your AI Career Companion',
    description: 'Prepare smarter. Practice confidently. Perform better.',
    siteName: 'Velora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Velora — Your AI Career Companion',
    description: 'Prepare smarter. Practice confidently. Perform better.',
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
  children: ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

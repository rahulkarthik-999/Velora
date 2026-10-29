'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Sparkles,
  LogOut,
  Zap,
  Plus,
} from 'lucide-react';
import { useState, useEffect } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [usage, setUsage] = useState<{ creditsUsed: number; creditsLimit: number; tier: string } | null>(null);

  useEffect(() => {
    fetch('/api/usage')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setUsage({
            creditsUsed: data.usage?.creditsUsed || 0,
            creditsLimit: data.limits?.monthlyAICredits || 50,
            tier: data.tier || 'FREE',
          });
        }
      })
      .catch(() => {});
  }, [pathname]);

  const navLinks = [
    { href: '/dashboard', label: 'Workspace' },
    { href: '/dashboard/history', label: 'History' },
    { href: '/dashboard/settings', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-velora-bg flex flex-col text-velora-text selection:bg-white/10 selection:text-white">
      {/* Sleek Minimal Top Navigation Bar */}
      <header className="border-b border-velora-border sticky top-0 z-50 bg-velora-bg/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              <span className="font-semibold text-sm tracking-tight text-white">Velora</span>
            </Link>

            <nav className="flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                      isActive
                        ? 'text-white bg-velora-surface border border-velora-border'
                        : 'text-velora-text-secondary hover:text-white hover:bg-velora-surface-subtle'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {usage && (
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-velora-surface border border-velora-border text-[11px] font-mono">
                <span className="text-velora-text-muted">{usage.tier}</span>
                <span className="text-velora-border">&bull;</span>
                <span className="text-white font-medium">{usage.creditsUsed}/{usage.creditsLimit} credits</span>
              </div>
            )}

            <div className="flex items-center gap-2 pl-2 border-l border-velora-border">
              <div className="w-6 h-6 rounded-full bg-velora-surface-hover border border-velora-border flex items-center justify-center text-[10px] font-medium text-white">
                {session?.user?.name?.[0] || 'U'}
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-velora-text-muted hover:text-white transition-colors p-1"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        {children}
      </main>
    </div>
  );
}

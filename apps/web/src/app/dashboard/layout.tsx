'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Logo, VeloraSymbol } from '@/components/brand/Logo';
import {
  LogOut,
  Zap,
  Plus,
  FolderOpen,
  Sparkles,
  History,
  Settings,
} from 'lucide-react';
import { useState, useEffect, type ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
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
    { href: '/dashboard/history', label: 'Deliverable History' },
    { href: '/dashboard/settings', label: 'Settings & Quotas' },
  ];

  return (
    <div className="min-h-screen bg-velora-bg flex flex-col text-velora-text selection:bg-velora-gold/20 selection:text-velora-gold-light">
      {/* Top Precision Bar */}
      <header className="border-b border-velora-border sticky top-0 z-50 bg-velora-bg/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo size="md" href="/" />

            <nav className="flex items-center gap-1.5">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
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
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-velora-surface border border-velora-border text-[11px] font-mono">
                <span className="text-velora-gold font-medium">{usage.tier}</span>
                <span className="text-velora-text-muted">&bull;</span>
                <span className="text-white font-medium">{usage.creditsUsed} / {usage.creditsLimit} credits</span>
              </div>
            )}

            <Link
              href="/onboarding"
              className="btn-gold text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Deliverable</span>
            </Link>

            <div className="flex items-center gap-2 pl-3 border-l border-velora-border">
              <div className="w-7 h-7 rounded-full bg-velora-surface-hover border border-velora-border flex items-center justify-center text-[10px] font-bold text-velora-gold">
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

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        {children}
      </main>
    </div>
  );
}

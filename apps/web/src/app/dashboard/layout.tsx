'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Logo } from '@/components/brand/Logo';
import { Download, LogOut, Sparkles } from 'lucide-react';
import { useState, useEffect, type ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [billing, setBilling] = useState<{
    active: boolean;
    planName: string;
    creditsLeft: number;
    minutesLeft: number;
  } | null>(null);

  useEffect(() => {
    fetch('/api/billing/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.entitlement) {
          setBilling({
            active: Boolean(data.entitlement.active),
            planName: data.entitlement.plan?.name || 'No Plan',
            creditsLeft: data.entitlement.remaining?.aiCredits ?? 0,
            minutesLeft: data.entitlement.remaining?.transcriptionMinutes ?? 0,
          });
        }
      })
      .catch(() => {});
  }, [pathname]);

  const navLinks = [
    { href: '/dashboard', label: 'Career Companion' },
    { href: '/dashboard/history', label: 'Activity History' },
    { href: '/dashboard/settings', label: 'Account & Quotas' },
  ];

  return (
    <div className="min-h-screen bg-velora-bg flex flex-col text-velora-text selection:bg-velora-gold/20 selection:text-velora-gold-light">
      <header className="border-b border-velora-border sticky top-0 z-50 bg-velora-bg/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Logo size="md" href="/" />
            <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-mono text-velora-gold bg-velora-gold/10 border border-velora-gold/20 px-2.5 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3" />
              Your AI Career Companion
            </span>

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
            {billing && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-velora-surface border border-velora-border text-[11px] font-mono">
                <span className="text-velora-gold font-medium">{billing.planName}</span>
                <span className="text-velora-text-muted">&bull;</span>
                <span className="text-white font-medium">
                  {billing.creditsLeft} credits · {billing.minutesLeft}m audio
                </span>
              </div>
            )}

            <a
              href="https://github.com/ishaan-pareek/Velora/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs py-1.5 px-3 hidden md:flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-velora-gold" />
              <span>Desktop App</span>
            </a>

            <div className="flex items-center gap-2 pl-3 border-l border-velora-border">
              <div className="w-7 h-7 rounded-full bg-velora-surface-hover border border-velora-border flex items-center justify-center text-[10px] font-bold text-velora-gold">
                {session?.user?.name?.[0] || session?.user?.email?.[0]?.toUpperCase() || 'U'}
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

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">{children}</main>
    </div>
  );
}

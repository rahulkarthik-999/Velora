'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Sparkles,
  LayoutDashboard,
  History,
  Settings,
  LogOut,
  Zap,
  Menu,
  X,
  PlusCircle,
} from 'lucide-react';
import { useState, useEffect } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    { href: '/dashboard', label: 'Workspace', icon: LayoutDashboard },
    { href: '/dashboard/history', label: 'Task History', icon: History },
    { href: '/dashboard/settings', label: 'Settings & Billing', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-velora-bg flex text-velora-text">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col justify-between border-r border-velora-border bg-velora-surface/70 p-4 fixed h-full z-30 backdrop-blur-xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-velora-violet to-violet-700 flex items-center justify-center shadow-md shadow-velora-violet/20">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">Velora</span>
            </Link>
          </div>

          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-velora-violet hover:bg-velora-violet-hover text-white text-sm font-semibold transition-colors shadow-md shadow-velora-violet/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Task Goal</span>
          </Link>

          <nav className="space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-velora-violet-bg text-velora-violet-light border border-velora-violet-border'
                      : 'text-velora-text-secondary hover:text-velora-text hover:bg-velora-surface-hover'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Panel: Credits & Profile */}
        <div className="space-y-4 pt-4 border-t border-velora-border">
          {usage && (
            <div className="p-3 rounded-lg bg-velora-bg border border-velora-border">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1 text-velora-text-secondary font-medium">
                  <Zap className="w-3.5 h-3.5 text-velora-violet-light" />
                  <span>AI Credits</span>
                </span>
                <span className="font-semibold text-velora-lavender">{usage.tier}</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden mb-1">
                <div
                  className="bg-velora-violet h-full transition-all"
                  style={{
                    width: `${Math.min(100, (usage.creditsUsed / usage.creditsLimit) * 100)}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-velora-text-muted">
                <span>{usage.creditsUsed} used</span>
                <span>{usage.creditsLimit} limit</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-2 pt-1">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-velora-surface-hover border border-velora-border flex items-center justify-center text-xs font-bold text-velora-lavender flex-shrink-0">
                {session?.user?.name?.[0] || 'U'}
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-velora-text truncate">{session?.user?.name || 'Account'}</p>
                <p className="text-[11px] text-velora-text-muted truncate">{session?.user?.email || 'Logged in'}</p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-velora-text-muted hover:text-red-400 transition-colors p-1"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-velora-bg/90 backdrop-blur-md border-b border-velora-border px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-velora-violet flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-base">Velora</span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-velora-text-secondary hover:text-velora-text"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-velora-bg/95 pt-16 p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-velora-violet text-white text-sm font-semibold"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Task Goal</span>
            </Link>
            <nav className="space-y-2">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-velora-text-secondary hover:text-velora-text"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-2 text-sm text-red-400 py-3"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 md:pl-64 pt-14 md:pt-0">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

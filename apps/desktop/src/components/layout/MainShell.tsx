import clsx from 'clsx';
import {
  CreditCard,
  BookOpen,
  Briefcase,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  Radio,
  Settings as SettingsIcon,
  User,
  X,
} from 'lucide-react';
import { useApp, type Page } from '../../stores/app';
import { useBilling } from '../../stores/billing';
import { SessionTimer } from '../session/SessionTimer';
import { OverviewPage } from '../dashboard/OverviewPage';
import { LiveInterviewPage } from '../dashboard/LiveInterviewPage';
import { SessionsPage } from '../dashboard/SessionsPage';
import { SettingsPage } from '../settings/SettingsPage';
import { AccountPage } from '../account/AccountPage';
import { PlansPage } from '../billing/PlansPage';
import { JobsPage } from '../prep/JobsPage';
import { PracticePage } from '../prep/PracticePage';
import { ResumePage } from '../prep/ResumePage';
import { KnowledgePage } from '../prep/KnowledgePage';
import { useAccount } from '../account/AccountPage';
import { WelcomeScreen } from '../account/WelcomeScreen';
import { useEffect, useState } from 'react';

const SKIP_KEY = 'velora.skipSignIn';

function readSkip(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

const NAV: { group: string; items: { page: Page; label: string; Icon: typeof LayoutDashboard }[] }[] = [
  {
    group: 'Interview',
    items: [
      { page: 'overview', label: 'Home', Icon: LayoutDashboard },
      { page: 'live', label: 'Live Copilot', Icon: Radio },
      { page: 'practice', label: 'Practice', Icon: GraduationCap },
    ],
  },
  {
    group: 'Prepare',
    items: [
      { page: 'knowledge', label: 'Knowledge Base', Icon: BookOpen },
      { page: 'resume', label: 'My Resume', Icon: FileText },
      { page: 'job', label: 'Job Context', Icon: Briefcase },
    ],
  },
  { group: 'Review', items: [{ page: 'sessions', label: 'Transcripts', Icon: History }] },
  {
    group: 'Account',
    items: [
      { page: 'usage', label: 'Plan & usage', Icon: CreditCard },
      { page: 'settings', label: 'AI Settings', Icon: SettingsIcon },
      { page: 'account', label: 'Account', Icon: User },
    ],
  },
];

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'overview':
      return <OverviewPage />;
    case 'practice':
      return <PracticePage />;
    case 'live':
      return <LiveInterviewPage />;
    case 'settings':
      return <SettingsPage />;
    case 'sessions':
      return <SessionsPage />;
    case 'resume':
      return <ResumePage />;
    case 'knowledge':
      return <KnowledgePage />;
    case 'job':
      return <JobsPage />;
    case 'usage':
      return <PlansPage />;
    case 'account':
      return <AccountPage />;
  }
}

export function MainShell() {
  const { status } = useAccount();
  const [skipped, setSkipped] = useState(readSkip);
  if (status && !status.signedIn && !skipped) {
    return (
      <WelcomeScreen
        onSkip={() => {
          try {
            localStorage.setItem(SKIP_KEY, '1');
          } catch {
            // Not remembered; the welcome screen shows again next launch.
          }
          setSkipped(true);
        }}
      />
    );
  }
  return <Shell />;
}

/** Current plan and credits left, at the foot of the sidebar. */
function PlanChip({ onOpen }: { onOpen: () => void }) {
  const status = useBilling((s) => s.status);
  useEffect(() => {
    useBilling.getState().refresh();
  }, []);
  if (!status) return null;
  const ent = status.entitlement;
  return (
    <button onClick={onOpen} className="rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-xs hover:bg-[var(--surface-2)]">
      {ent.active && ent.plan ? (
        <>
          <span className="flex items-center justify-between font-medium">
            {ent.plan.name}
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="muted block">{ent.remaining?.aiCredits ?? 0} credits · {ent.remaining?.transcriptionMinutes ?? 0} min left</span>
        </>
      ) : (
        <>
          <span className="font-medium text-accent">Choose a plan</span>
          <span className="muted block">Unlock the live copilot</span>
        </>
      )}
    </button>
  );
}

function Shell() {
  const page = useApp((s) => s.page);
  const session = useApp((s) => s.session);
  const error = useApp((s) => s.error);
  const { setPage, clearError } = useApp.getState();
  const inSession = session?.status === 'active' || session?.status === 'paused';

  return (
    <div className="flex h-full">
      <nav className="flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-3 pb-3 pt-4">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
          <div>
            <div className="font-display text-xl leading-none">Velora</div>
            <div className="muted mt-0.5 text-[11px] tracking-wide">AI interview copilot</div>
          </div>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto">
          {NAV.map(({ group, items }) => (
            <div key={group}>
              <div className="muted mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]">{group}</div>
              <ul className="flex flex-col gap-0.5">
                {items.map(({ page: p, label, Icon }) => (
                  <li key={p}>
                    <button
                      onClick={() => setPage(p)}
                      aria-current={page === p ? 'page' : undefined}
                      className={clsx(
                        'relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] transition-colors',
                        page === p
                          ? 'bg-[var(--surface-2)] font-medium text-[var(--text)] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-[var(--color-accent)]'
                          : 'muted hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                      )}
                    >
                      <Icon size={16} className={page === p ? 'text-accent' : undefined} />
                      {label}
                      {p === 'live' && inSession && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-accent" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-4">
          {inSession && (
            <button
              onClick={() => setPage('live')}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-left text-xs"
            >
              <span className="font-medium">{session?.status === 'paused' ? 'Session paused' : 'Session live'}</span>
              <span className="muted block">
                <SessionTimer />
              </span>
            </button>
          )}
          <PlanChip onOpen={() => setPage('usage')} />
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto">
        {error && (
          <div role="alert" className="flex items-start gap-3 border-b border-red-500/30 bg-red-500/10 px-6 py-3 text-red-400">
            <span className="flex-1">{error}</span>
            <button onClick={clearError} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="mx-auto max-w-5xl px-10 py-9">
          <PageContent page={page} />
        </div>
      </main>
    </div>
  );
}

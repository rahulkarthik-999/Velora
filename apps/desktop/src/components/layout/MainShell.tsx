import clsx from 'clsx';
import {
  Award,
  BookOpen,
  Briefcase,
  Code2,
  Compass,
  CreditCard,
  Database,
  EyeOff,
  FileText,
  GraduationCap,
  History,
  Layers,
  LayoutDashboard,
  Mic,
  Radio,
  Settings as SettingsIcon,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ipc } from '../../lib/ipc';
import { useApp, type Page } from '../../stores/app';
import { useBilling } from '../../stores/billing';
import { AccountPage, useAccount } from '../account/AccountPage';
import { WelcomeScreen } from '../account/WelcomeScreen';
import { PlansPage } from '../billing/PlansPage';
import { LiveInterviewPage } from '../dashboard/LiveInterviewPage';
import { OverviewPage } from '../dashboard/OverviewPage';
import { SessionsPage } from '../dashboard/SessionsPage';
import { AssistantsPage } from '../prep/AssistantsPage';
import { JobsPage } from '../prep/JobsPage';
import { KnowledgePage } from '../prep/KnowledgePage';
import { MockInterviewPage } from '../prep/MockInterviewPage';
import { PracticePage } from '../prep/PracticePage';
import { ReportsPage } from '../prep/ReportsPage';
import { ResumePage } from '../prep/ResumePage';
import { RoadmapPage } from '../prep/RoadmapPage';
import { SessionTimer } from '../session/SessionTimer';
import { SettingsPage } from '../settings/SettingsPage';

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
    group: 'HOME',
    items: [
      { page: 'overview', label: 'Career Dashboard', Icon: LayoutDashboard },
      { page: 'sessions', label: 'Recent Activity', Icon: History },
    ],
  },
  {
    group: 'PREPARE',
    items: [
      { page: 'resume', label: 'Resume Intelligence', Icon: FileText },
      { page: 'job', label: 'Job Match Analyzer', Icon: Briefcase },
      { page: 'knowledge', label: 'Knowledge Base', Icon: BookOpen },
    ],
  },
  {
    group: 'PRACTICE',
    items: [
      { page: 'mock', label: 'AI Mock Interviews', Icon: Mic },
      { page: 'practice', label: 'Technical Practice', Icon: GraduationCap },
      { page: 'reports', label: 'Performance Reports', Icon: Award },
    ],
  },
  {
    group: 'PERFORM',
    items: [
      { page: 'live', label: 'Live Interview Copilot', Icon: Radio },
      { page: 'coding', label: 'Coding Assistant', Icon: Code2 },
      { page: 'sql', label: 'SQL Assistant', Icon: Database },
      { page: 'system_design', label: 'System Design Assistant', Icon: Layers },
    ],
  },
  {
    group: 'IMPROVE',
    items: [{ page: 'roadmap', label: 'Learning Roadmap', Icon: Compass }],
  },
  {
    group: 'ACCOUNT',
    items: [
      { page: 'usage', label: 'Plan & Usage', Icon: CreditCard },
      { page: 'settings', label: 'AI Settings', Icon: SettingsIcon },
      { page: 'account', label: 'Account & Profile', Icon: User },
    ],
  },
];

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'overview':
      return <OverviewPage />;
    case 'practice':
      return <PracticePage />;
    case 'mock':
      return <MockInterviewPage />;
    case 'reports':
      return <ReportsPage />;
    case 'live':
      return <LiveInterviewPage />;
    case 'coding':
      return <AssistantsPage initialTab="coding" />;
    case 'sql':
      return <AssistantsPage initialTab="sql" />;
    case 'system_design':
      return <AssistantsPage initialTab="system_design" />;
    case 'roadmap':
      return <RoadmapPage />;
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
      <nav className="flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-3 pb-3 pt-4">
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
          <div>
            <div className="font-display text-xl leading-none">Velora</div>
            <div className="muted mt-0.5 text-[11px] tracking-wide">Your AI Career Companion</div>
          </div>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto">
          {NAV.map(({ group, items }) => (
            <div key={group}>
              <div className="muted mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em]">{group}</div>
              <ul className="flex flex-col gap-0.5">
                {items.map(({ page: p, label, Icon }) => (
                  <li key={p}>
                    <button
                      onClick={() => setPage(p)}
                      aria-current={page === p ? 'page' : undefined}
                      className={clsx(
                        'relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-left text-[13px] transition-colors',
                        page === p
                          ? 'bg-[var(--surface-2)] font-medium text-[var(--text)] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-[var(--color-accent)]'
                          : 'muted hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                      )}
                    >
                      <Icon size={15} className={page === p ? 'text-accent' : undefined} />
                      {label}
                      {p === 'live' && inSession && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-accent" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-3">
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
          <button
            type="button"
            onClick={() => {
              ipc.showCopilot().catch(() => {});
              ipc.hideMain().catch(() => {});
            }}
            className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-left text-xs hover:bg-[var(--surface-2)]"
            title="Hide this main window while keeping the compact floating Copilot active (Ctrl+Shift+M)"
          >
            <span className="muted">Hide Velora Window</span>
            <EyeOff size={13} className="muted" />
          </button>
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

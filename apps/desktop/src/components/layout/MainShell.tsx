import clsx from 'clsx';
import {
  BarChart3,
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
import { SessionTimer } from '../session/SessionTimer';
import { OverviewPage } from '../dashboard/OverviewPage';
import { LiveInterviewPage } from '../dashboard/LiveInterviewPage';
import { SessionsPage } from '../dashboard/SessionsPage';
import { SettingsPage } from '../settings/SettingsPage';
import { AccountPage, UsagePage } from '../account/AccountPage';
import { JobsPage } from '../prep/JobsPage';
import { PracticePage } from '../prep/PracticePage';
import { ResumePage } from '../prep/ResumePage';
import { KnowledgePage } from '../prep/KnowledgePage';

const NAV: { page: Page; label: string; Icon: typeof LayoutDashboard }[] = [
  { page: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { page: 'live', label: 'Live Copilot', Icon: Radio },
  { page: 'practice', label: 'Practice', Icon: GraduationCap },
  { page: 'knowledge', label: 'Knowledge Base', Icon: BookOpen },
  { page: 'resume', label: 'My Resume', Icon: FileText },
  { page: 'job', label: 'Job Context', Icon: Briefcase },
  { page: 'sessions', label: 'Transcripts', Icon: History },
  { page: 'settings', label: 'AI Settings', Icon: SettingsIcon },
  { page: 'usage', label: 'Usage', Icon: BarChart3 },
  { page: 'account', label: 'Account', Icon: User },
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
      return <UsagePage />;
    case 'account':
      return <AccountPage />;
  }
}

export function MainShell() {
  const page = useApp((s) => s.page);
  const session = useApp((s) => s.session);
  const error = useApp((s) => s.error);
  const { setPage, clearError } = useApp.getState();
  const inSession = session?.status === 'active' || session?.status === 'paused';

  return (
    <div className="flex h-full">
      <nav className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="mb-5 flex items-center gap-2 px-2 pt-1">
          <img src="/logo.png" alt="" className="h-7 w-7 rounded-md" />
          <span className="text-[15px] font-semibold tracking-wide">Velora</span>
        </div>
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ page: p, label, Icon }) => (
            <li key={p}>
              <button
                onClick={() => setPage(p)}
                aria-current={page === p ? 'page' : undefined}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                  page === p ? 'bg-[var(--surface-2)] font-medium' : 'muted hover:bg-[var(--surface-2)]'
                )}
              >
                <Icon size={16} className={page === p ? 'text-accent' : undefined} />
                {label}
                {p === 'live' && inSession && <span className="ml-auto h-2 w-2 rounded-full bg-accent" />}
              </button>
            </li>
          ))}
        </ul>
        {inSession && (
          <button
            onClick={() => setPage('live')}
            className="mt-auto rounded-md border border-[var(--border)] px-3 py-2 text-left text-xs"
          >
            <span className="font-medium">{session?.status === 'paused' ? 'Session paused' : 'Session active'}</span>
            <span className="muted block">
              <SessionTimer />
            </span>
          </button>
        )}
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
        <div className="mx-auto max-w-4xl px-8 py-7">
          <PageContent page={page} />
        </div>
      </main>
    </div>
  );
}

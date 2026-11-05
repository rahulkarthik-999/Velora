import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ArrowRight, Check, Circle, GraduationCap, Radio } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { formatDuration } from '../../lib/format';
import { useApp, type Page } from '../../stores/app';
import { useBilling } from '../../stores/billing';
import { useAccount } from '../account/AccountPage';
import type { SessionRecord } from '../../types';

interface Readiness {
  facts: number;
  jobs: number;
  knowledge: number;
  sessions: SessionRecord[];
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Step({ done, title, detail, action, onAction }: { done: boolean; title: string; detail: string; action: string; onAction: () => void }) {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span
        className={clsx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
          done ? 'border-transparent bg-[var(--color-accent)] text-black' : 'border-[var(--border-strong)] text-transparent'
        )}
      >
        {done ? <Check size={14} strokeWidth={3} /> : <Circle size={6} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={clsx('font-medium', done && 'muted line-through decoration-[var(--border-strong)]')}>{title}</div>
        <div className="muted text-xs">{detail}</div>
      </div>
      {!done && (
        <button className="btn py-1.5 text-xs" onClick={onAction}>
          {action} <ArrowRight size={13} />
        </button>
      )}
    </li>
  );
}

/** Home: what to do next, and a fast way into a live interview. */
export function OverviewPage() {
  const setPage = useApp((s) => s.setPage);
  const settings = useApp((s) => s.settings);
  const { status: account } = useAccount();
  const billing = useBilling((s) => s.status);
  const [r, setR] = useState<Readiness | null>(null);

  useEffect(() => {
    useBilling.getState().refresh();
    Promise.all([
      ipc.getProfile().catch(() => ({ facts: [] })),
      ipc.listJobs().catch(() => []),
      ipc.listKnowledge().catch(() => []),
      ipc.listSessions().catch(() => []),
    ]).then(([profile, jobs, knowledge, sessions]) =>
      setR({ facts: profile.facts.length, jobs: jobs.length, knowledge: knowledge.length, sessions: sessions.slice(0, 5) })
    );
  }, []);

  const firstName = account?.user?.name?.split(' ')[0];
  const go = (p: Page) => () => setPage(p);
  const active = billing?.entitlement.active ?? false;
  const steps = r && [
    { done: Boolean(account?.signedIn), title: 'Sign in to Velora', detail: 'Your account holds your plan and usage.', action: 'Sign in', onAction: go('account') },
    { done: active, title: 'Choose a plan', detail: 'Unlocks the live copilot, transcription and practice feedback.', action: 'See plans', onAction: go('usage') },
    { done: r.facts > 0, title: 'Add your resume', detail: 'Answers are built from your real experience, never invented.', action: 'Import resume', onAction: go('resume') },
    { done: Boolean(settings?.copilot.jobId), title: 'Pick the role you are interviewing for', detail: 'The job description shapes every answer.', action: 'Add a job', onAction: go('job') },
    { done: r.knowledge > 0, title: 'Add notes to your knowledge base', detail: 'Stories, projects and study notes the copilot can draw on.', action: 'Add notes', onAction: go('knowledge') },
  ];
  const remaining = steps?.filter((s) => !s.done).length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-8 py-9">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)' }}
        />
        <p className="muted text-sm">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </p>
        <h1 className="font-display mt-1 text-5xl leading-[1.05]">Walk into every interview prepared.</h1>
        <p className="muted mt-3 max-w-xl">
          Velora listens to the interviewer and suggests answers in real time, grounded in your own resume, notes and the
          job you're going for.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="btn btn-primary px-5 py-2.5" onClick={go('live')}>
            <Radio size={16} /> Start live copilot
          </button>
          <button className="btn px-5 py-2.5" onClick={go('practice')}>
            <GraduationCap size={16} /> Practice an interview
          </button>
        </div>
      </header>

      {steps && remaining > 0 && (
        <section className="card px-6 py-2">
          <div className="flex items-center justify-between pt-4">
            <h2 className="text-sm font-semibold">Get ready</h2>
            <span className="muted text-xs">
              {steps.length - remaining} of {steps.length} done
            </span>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {steps.map((s) => (
              <Step key={s.title} {...s} />
            ))}
          </ul>
        </section>
      )}

      {billing?.entitlement.active && billing.entitlement.remaining && billing.entitlement.allowances && (
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            ['AI credits left', billing.entitlement.remaining.aiCredits, billing.entitlement.allowances.aiCredits],
            ['Transcription minutes left', billing.entitlement.remaining.transcriptionMinutes, billing.entitlement.allowances.transcriptionMinutes],
            ['Knowledge base items', r?.knowledge ?? 0, null],
          ].map(([label, value, of]) => (
            <div key={label as string} className="card p-5">
              <div className="muted text-xs">{label}</div>
              <div className="font-display mt-1 text-4xl tabular-nums">{value as number}</div>
              {of !== null && <div className="muted text-xs">of {of as number} this month</div>}
            </div>
          ))}
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent sessions</h2>
          {r && r.sessions.length > 0 && (
            <button className="muted text-xs hover:text-[var(--text)]" onClick={go('sessions')}>
              View all
            </button>
          )}
        </div>
        {r && r.sessions.length === 0 ? (
          <div className="card muted p-6 text-sm">Your live and practice sessions will appear here, with transcripts and answers.</div>
        ) : (
          <ul className="card divide-y divide-[var(--border)]">
            {r?.sessions.map((s) => (
              <li key={s.id}>
                <button className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-[var(--surface-2)]" onClick={go('sessions')}>
                  <span className="text-sm">{dateFormat.format(s.startedAtMs)}</span>
                  <span className="muted text-xs">
                    {s.mode === 'practice' ? 'Practice' : 'Live'} · {formatDuration(s.activeMs)} · {s.segmentCount} lines
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

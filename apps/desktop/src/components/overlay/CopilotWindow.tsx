import { getCurrentWindow } from '@tauri-apps/api/window';
import { EyeOff, LayoutDashboard, Radio, ScrollText, X } from 'lucide-react';
import clsx from 'clsx';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import { useTranscript } from '../../stores/transcript';
import { TranscriptView } from '../transcript/TranscriptView';
import { CaptureIndicators } from '../session/CaptureIndicators';
import { SessionControls } from '../session/SessionControls';
import { SessionTimer } from '../session/SessionTimer';

const STATUS_LABEL = { idle: 'No session', active: 'Active', paused: 'Paused', ended: 'Ended' } as const;

export function CopilotWindow() {
  const session = useApp((s) => s.session);
  const error = useApp((s) => s.error);
  const status = session?.status ?? 'idle';
  const inSession = status === 'active' || status === 'paused';
  const segments = useTranscript((s) => s.segments);
  const levels = useTranscript((s) => s.levels);
  const transcriber = useTranscript((s) => s.transcriber);
  const notices = useTranscript((s) => s.notices);
  const { replaceSegment, dismissNotice } = useTranscript.getState();

  return (
    <div className="flex h-full flex-col border border-[var(--border)] bg-[var(--bg)]">
      {/* Custom title bar: the whole strip drags the window. */}
      <header
        data-tauri-drag-region
        className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3"
      >
        <img src="/logo.png" alt="" className="pointer-events-none h-5 w-5 rounded" />
        <span data-tauri-drag-region className="text-[13px] font-semibold">
          Velora Transcript
        </span>
        <span
          data-testid="session-status"
          className={clsx(
            'ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
            status === 'active' && 'bg-[var(--color-accent)]/20 text-accent',
            status === 'paused' && 'bg-amber-500/15 text-amber-500',
            (status === 'idle' || status === 'ended') && 'bg-[var(--surface-2)] muted'
          )}
        >
          {STATUS_LABEL[status]}
          {inSession && (
            <>
              {' · '}
              <SessionTimer />
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button className="rounded p-1.5 hover:bg-[var(--surface-2)]" title="Open Velora" onClick={() => ipc.showMain()}>
            <LayoutDashboard size={14} />
          </button>
          <button
            className="rounded p-1.5 hover:bg-[var(--surface-2)]"
            title="Hide panel (session keeps running)"
            onClick={() => getCurrentWindow().hide()}
          >
            <EyeOff size={14} />
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        {session && <CaptureIndicators capture={session.capture} levels={levels} compact />}
        <SessionControls size="sm" />
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {!inSession ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <Radio size={22} className="text-accent" />
            <p className="font-medium">{status === 'ended' ? 'Session ended' : 'No active session'}</p>
            <p className="muted text-xs">Start a recording from the Record Session page in the main window.</p>
            <button className="btn mt-1" onClick={() => ipc.showMain()}>
              Open Velora
            </button>
          </div>
        ) : (
          <>
            {notices.map((n, i) => (
              <div key={i} role="status" className="flex items-start gap-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-500">
                <span className="flex-1">{n}</span>
                <button onClick={() => dismissNotice(i)} aria-label="Dismiss">
                  <X size={12} />
                </button>
              </div>
            ))}
            <section className="card flex min-h-40 flex-1 flex-col p-3">
              <h2 className="muted mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
                <ScrollText size={12} /> Live transcript
                <span className="ml-auto font-normal normal-case tracking-normal" data-testid="transcriber-status">
                  {transcriber.status === 'loading' && 'Loading speech model…'}
                  {transcriber.status === 'ready' && `On this PC · ${transcriber.modelId}`}
                </span>
              </h2>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TranscriptView
                  segments={segments}
                  onSegmentSaved={replaceSegment}
                  empty={status === 'paused' ? 'Paused. Nothing is being captured.' : 'Listening… speech appears here a moment after each sentence ends.'}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

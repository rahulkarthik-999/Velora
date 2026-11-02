import { useState } from 'react';
import { GraduationCap, PanelTopOpen, Radio } from 'lucide-react';
import clsx from 'clsx';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import { useTranscript } from '../../stores/transcript';
import type { SessionMode } from '../../types';
import { CaptureIndicators } from '../session/CaptureIndicators';
import { SessionControls } from '../session/SessionControls';
import { SessionTimer } from '../session/SessionTimer';

const MODES: { mode: SessionMode; title: string; description: string; Icon: typeof Radio }[] = [
  {
    mode: 'live',
    title: 'Live interview',
    description: 'Transcribes the interview, detects questions and suggests answers from your background.',
    Icon: Radio,
  },
  {
    mode: 'practice',
    title: 'Practice',
    description: 'Velora asks the questions and gives feedback on your answers.',
    Icon: GraduationCap,
  },
];

export function LiveInterviewPage() {
  const session = useApp((s) => s.session);
  const settings = useApp((s) => s.settings);
  const pending = useApp((s) => s.pending);
  const start = useApp((s) => s.start);
  const [mode, setMode] = useState<SessionMode>('live');
  const levels = useTranscript((s) => s.levels);
  const inSession = session?.status === 'active' || session?.status === 'paused';

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Live Interview</h1>
        <p className="muted mt-1">
          Starting a session opens the copilot panel. It stays visible on top of other windows, and you control when
          capture runs.
        </p>
      </header>

      {inSession && session ? (
        <div className="card flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">
                {session.mode === 'practice' ? 'Practice session' : 'Live session'} ·{' '}
                {session.status === 'paused' ? 'Paused' : 'Active'}
              </div>
              <div className="muted text-sm">
                Elapsed <SessionTimer />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => ipc.showCopilot()}>
                <PanelTopOpen size={16} /> Show panel
              </button>
              <SessionControls />
            </div>
          </div>
          <CaptureIndicators capture={session.capture} levels={levels} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Session type">
            {MODES.map(({ mode: m, title, description, Icon }) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={clsx(
                  'card p-4 text-left transition-colors',
                  mode === m && 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]'
                )}
              >
                <Icon size={18} className="text-accent mb-2" />
                <div className="font-medium">{title}</div>
                <div className="muted mt-1 text-sm">{description}</div>
              </button>
            ))}
          </div>

          <div className="card p-4 text-sm">
            <div className="mb-2 font-medium">What works in this build</div>
            <ul className="muted list-disc space-y-1 pl-5">
              <li>
                Live transcription of your microphone and system audio, on this PC. Audio is never saved or uploaded;
                only the text is kept, in your local history.
              </li>
              <li>Question detection, answer suggestions and practice questions are not built yet.</li>
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={() => start(mode)} disabled={pending}>
              <Radio size={16} /> Start {mode === 'live' ? 'live session' : 'practice'}
            </button>
            {settings && (
              <span className="muted text-xs">
                {settings.shortcuts.toggleCopilot} show/hide panel · {settings.shortcuts.pauseResume} pause ·{' '}
                {settings.shortcuts.endSession} end
              </span>
            )}
          </div>

          {session?.status === 'ended' && (
            <p className="muted text-sm">
              Last session ended after <SessionTimer />.
            </p>
          )}
        </>
      )}
    </div>
  );
}

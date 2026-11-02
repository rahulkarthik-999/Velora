import { PanelTopOpen, Radio } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import { useTranscript } from '../../stores/transcript';
import { CaptureIndicators } from '../session/CaptureIndicators';
import { SessionControls } from '../session/SessionControls';
import { SessionTimer } from '../session/SessionTimer';

/** Records and transcribes system audio (e.g. a mock interview call) for review afterwards. */
export function LiveInterviewPage() {
  const session = useApp((s) => s.session);
  const settings = useApp((s) => s.settings);
  const pending = useApp((s) => s.pending);
  const start = useApp((s) => s.start);
  const setPage = useApp((s) => s.setPage);
  const levels = useTranscript((s) => s.levels);
  const inSession = session?.status === 'active' || session?.status === 'paused';

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Record Session</h1>
        <p className="muted mt-1">
          Transcribes what plays through your speakers, such as a mock interview with a friend or mentor, so you can read
          it back afterwards under Transcripts. Your microphone is not used. To practise answering, use Practice.
        </p>
      </header>

      {inSession && session ? (
        <div className="card flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">
                {session.mode === 'practice' ? 'Recording a practice answer' : 'Recording'} ·{' '}
                {session.status === 'paused' ? 'Paused' : 'Active'}
              </div>
              <div className="muted text-sm">
                Elapsed <SessionTimer />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => ipc.showCopilot()}>
                <PanelTopOpen size={16} /> Show transcript panel
              </button>
              <SessionControls />
            </div>
          </div>
          <CaptureIndicators capture={session.capture} levels={levels} />
        </div>
      ) : (
        <>
          <div className="card p-4 text-sm">
            <ul className="muted list-disc space-y-1 pl-5">
              <li>Transcription runs on this PC. Audio is never saved or uploaded; only the text is kept, locally.</li>
              <li>The transcript panel stays on top of other windows and appears in screen shares like any window.</li>
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={() => start('live')} disabled={pending}>
              <Radio size={16} /> Start recording
            </button>
            <button className="btn" onClick={() => setPage('practice')}>
              Go to Practice
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
              Last recording ended after <SessionTimer />.
            </p>
          )}
        </>
      )}
    </div>
  );
}

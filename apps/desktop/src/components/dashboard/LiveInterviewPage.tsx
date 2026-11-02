import { useEffect, useState } from 'react';
import { BookOpen, MessageSquareText, PanelTopOpen, Radio } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import { useTranscript } from '../../stores/transcript';
import type { Job } from '../../types';
import { CaptureIndicators } from '../session/CaptureIndicators';
import { SessionControls } from '../session/SessionControls';
import { SessionTimer } from '../session/SessionTimer';

/** Live copilot: transcribes the other side of a call and suggests answers from the knowledge base. */
export function LiveInterviewPage() {
  const session = useApp((s) => s.session);
  const settings = useApp((s) => s.settings);
  const pending = useApp((s) => s.pending);
  const start = useApp((s) => s.start);
  const setPage = useApp((s) => s.setPage);
  const saveSettings = useApp((s) => s.saveSettings);
  const levels = useTranscript((s) => s.levels);
  const inSession = session?.status === 'active' || session?.status === 'paused';
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    ipc.listJobs().then(setJobs, () => {});
  }, []);

  const cloud = settings?.transcription.engine === 'cloud';

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Live Copilot</h1>
        <p className="muted mt-1">
          Listens to what plays through your speakers, transcribes it, and suggests answers from your knowledge base as
          questions come in. Your microphone is not used.
        </p>
      </header>

      {inSession && session ? (
        <div className="card flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">
                {session.mode === 'practice' ? 'Recording a practice answer' : 'Listening'} ·{' '}
                {session.status === 'paused' ? 'Paused' : 'Active'}
              </div>
              <div className="muted text-sm">
                Elapsed <SessionTimer />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => ipc.showCopilot()}>
                <PanelTopOpen size={16} /> Show copilot
              </button>
              <SessionControls />
            </div>
          </div>
          <CaptureIndicators capture={session.capture} levels={levels} />
        </div>
      ) : (
        <>
          {settings && (
            <div className="card grid gap-4 p-5 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Interviewing for</span>
                <select
                  className="field"
                  value={settings.copilot.jobId ?? ''}
                  onChange={(e) => saveSettings({ ...settings, copilot: { ...settings.copilot, jobId: e.target.value || null } })}
                >
                  <option value="">No specific job</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                      {j.company ? ` · ${j.company}` : ''}
                    </option>
                  ))}
                </select>
                <span className="muted text-xs">Its description shapes every answer. Add jobs under Job Context.</span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Transcription</span>
                <select
                  className="field"
                  value={settings.transcription.engine}
                  onChange={(e) =>
                    saveSettings({
                      ...settings,
                      transcription: { ...settings.transcription, engine: e.target.value as 'cloud' | 'local' },
                    })
                  }
                >
                  <option value="cloud">OpenAI: most accurate, needs internet</option>
                  <option value="local">On this PC: private and offline</option>
                </select>
                <span className="muted text-xs">
                  {cloud
                    ? 'Each sentence of audio is sent to OpenAI through Velora and not stored.'
                    : 'Audio never leaves this PC. Download a speech model on the Overview page.'}
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="accent-[var(--color-accent)]"
                  checked={settings.copilot.autoAnswer}
                  onChange={(e) => saveSettings({ ...settings, copilot: { ...settings.copilot, autoAnswer: e.target.checked } })}
                />
                Answer automatically when the interviewer finishes a question
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" onClick={() => start('live')} disabled={pending}>
              <Radio size={16} /> Start copilot
            </button>
            <button className="btn" onClick={() => setPage('knowledge')}>
              <BookOpen size={16} /> Knowledge base
            </button>
            <button className="btn" onClick={() => setPage('settings')}>
              <MessageSquareText size={16} /> Custom instructions
            </button>
          </div>

          {settings && (
            <p className="muted text-xs">
              {settings.shortcuts.answerNow} answer now · {settings.shortcuts.toggleCopilot} show/hide copilot ·{' '}
              {settings.shortcuts.toggleAutoAnswer} auto-answer · {settings.shortcuts.toggleClickThrough} click-through ·{' '}
              {settings.shortcuts.pauseResume} pause · {settings.shortcuts.endSession} end
            </p>
          )}

          {session?.status === 'ended' && (
            <p className="muted text-sm">
              Last session ended after <SessionTimer />. Its transcript and answers are under Transcripts.
            </p>
          )}
        </>
      )}
    </div>
  );
}

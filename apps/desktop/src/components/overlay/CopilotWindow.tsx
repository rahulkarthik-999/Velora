import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import clsx from 'clsx';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  EyeOff,
  Keyboard,
  LayoutDashboard,
  Loader2,
  MessageSquareText,
  Radio,
  RefreshCw,
  ScrollText,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import { AUTO_ANSWER_DELAY_MS, looksLikeQuestion, useCopilot } from '../../stores/copilot';
import { useTranscript } from '../../stores/transcript';
import type { AnswerStyle, Job, Settings, Theme } from '../../types';
import { TranscriptView } from '../transcript/TranscriptView';
import { CaptureIndicators } from '../session/CaptureIndicators';
import { SessionControls } from '../session/SessionControls';
import { SessionTimer } from '../session/SessionTimer';

const STATUS_LABEL = { idle: 'No session', active: 'Live', paused: 'Paused', ended: 'Ended' } as const;

type Panel = 'instructions' | 'overlay' | 'keys' | null;

/** Keys that work while the panel has focus (global ones are in AI Settings). */
const LOCAL_KEYS: [string, string][] = [
  ['Ctrl+Enter', 'Answer now'],
  ['Ctrl+Shift+C', 'Copy answer'],
  ['Ctrl+R', 'Regenerate answer'],
  ['Alt+← / Alt+→', 'Previous / next answer'],
  ['/', 'Type a question'],
  ['Ctrl+I', 'Custom instructions'],
  ['Ctrl+,', 'Overlay settings'],
  ['Ctrl+= / Ctrl+-', 'Bigger / smaller text'],
  ['Ctrl+T', 'Show / hide transcript'],
  ['Ctrl+L', 'Clear answers'],
  ['Esc', 'Close panel, then hide window'],
];

function IconButton({
  title,
  onClick,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={clsx('rounded p-1.5 hover:bg-[var(--surface-2)]', active && 'bg-[var(--color-accent)]/20 text-accent')}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1">
      <span>
        <span className="block text-[12px]">{label}</span>
        {hint && <span className="muted block text-[11px]">{hint}</span>}
      </span>
      <input type="checkbox" className="mt-0.5 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Edits settings in place: previews instantly, saves on commit. */
function useSettingsEditor() {
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);
  const preview = (next: Settings) => useApp.setState({ settings: next });
  const save = (next: Settings) => saveSettings(next);
  return { settings, preview, save };
}

function InstructionsPanel({ onClose }: { onClose: () => void }) {
  const { settings, save } = useSettingsEditor();
  const [text, setText] = useState(settings?.customInstructions ?? '');
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    ipc.listJobs().then(setJobs, () => {});
  }, []);
  if (!settings) return null;

  return (
    <div className="card flex flex-col gap-2 p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Tailor answers</h2>
        <IconButton title="Close" onClick={onClose}>
          <X size={13} />
        </IconButton>
      </div>
      <label className="muted text-[11px]" htmlFor="instructions">
        Custom instructions: tone, length, what to emphasise.
      </label>
      <textarea
        id="instructions"
        className="field min-h-24 text-[12px]"
        maxLength={1500}
        value={text}
        autoFocus
        placeholder="e.g. Sound confident but humble. Mention my Kafka and AWS work when relevant. Keep answers under 45 seconds."
        onChange={(e) => setText(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="muted text-[11px]">Answer style</span>
          <select
            className="field py-1 text-[12px]"
            value={settings.answerStyle}
            onChange={(e) => save({ ...settings, answerStyle: e.target.value as AnswerStyle })}
          >
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
            <option value="star">STAR</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="muted text-[11px]">Interviewing for</span>
          <select
            className="field py-1 text-[12px]"
            value={settings.copilot.jobId ?? ''}
            onChange={(e) => save({ ...settings, copilot: { ...settings.copilot, jobId: e.target.value || null } })}
          >
            <option value="">No specific job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
                {j.company ? ` · ${j.company}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="btn btn-primary py-1 text-[12px]"
          disabled={text === settings.customInstructions}
          onClick={async () => {
            if (await save({ ...settings, customInstructions: text })) onClose();
          }}
        >
          Save instructions
        </button>
        <span className="muted ml-auto text-[11px]">{text.length} / 1500</span>
      </div>
    </div>
  );
}

function OverlayPanel({ onClose }: { onClose: () => void }) {
  const { settings, preview, save } = useSettingsEditor();
  if (!settings) return null;
  const c = settings.copilot;
  const setCopilot = (patch: Partial<typeof c>) => save({ ...settings, copilot: { ...c, ...patch } });
  const slide = (patch: Partial<typeof c>) => preview({ ...settings, copilot: { ...c, ...patch } });
  const commit = () => save(useApp.getState().settings!);

  return (
    <div className="card flex flex-col gap-2 p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Overlay</h2>
        <IconButton title="Close" onClick={onClose}>
          <X size={13} />
        </IconButton>
      </div>
      <label className="flex items-center gap-2">
        <span className="w-20 shrink-0">Opacity</span>
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.02}
          value={c.opacity}
          className="flex-1 accent-[var(--color-accent)]"
          onChange={(e) => slide({ opacity: Number(e.target.value) })}
          onPointerUp={commit}
          onKeyUp={commit}
          aria-label="Panel opacity"
        />
        <span className="muted w-9 text-right tabular-nums">{Math.round(c.opacity * 100)}%</span>
      </label>
      <label className="flex items-center gap-2">
        <span className="w-20 shrink-0">Text size</span>
        <input
          type="range"
          min={0.8}
          max={1.5}
          step={0.05}
          value={c.fontScale}
          className="flex-1 accent-[var(--color-accent)]"
          onChange={(e) => slide({ fontScale: Number(e.target.value) })}
          onPointerUp={commit}
          onKeyUp={commit}
          aria-label="Text size"
        />
        <span className="muted w-9 text-right tabular-nums">{Math.round(c.fontScale * 100)}%</span>
      </label>
      <label className="flex items-center gap-2">
        <span className="w-20 shrink-0">Theme</span>
        <select className="field py-1 text-[12px]" value={settings.theme} onChange={(e) => save({ ...settings, theme: e.target.value as Theme })}>
          <option value="system">Match Windows</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="w-20 shrink-0">Transcriber</span>
        <select
          className="field py-1 text-[12px]"
          value={settings.transcription.engine}
          onChange={(e) =>
            save({ ...settings, transcription: { ...settings.transcription, engine: e.target.value as Settings['transcription']['engine'] } })
          }
        >
          <option value="cloud">OpenAI (cloud, most accurate)</option>
          <option value="local">On this PC (private, offline)</option>
        </select>
      </label>
      <div className="divide-y divide-[var(--border)]">
        <Switch label="Auto-answer questions" checked={c.autoAnswer} onChange={(v) => setCopilot({ autoAnswer: v })} hint={settings.shortcuts.toggleAutoAnswer} />
        <Switch label="Always on top" checked={c.alwaysOnTop} onChange={(v) => setCopilot({ alwaysOnTop: v })} />
        <Switch
          label="Click-through"
          checked={c.clickThrough}
          onChange={(v) => setCopilot({ clickThrough: v })}
          hint={`Clicks go to the window behind. Turn off with ${settings.shortcuts.toggleClickThrough}.`}
        />
        <Switch label="Show live transcript" checked={c.showTranscript} onChange={(v) => setCopilot({ showTranscript: v })} />
        <Switch
          label="Transcribe my microphone too"
          checked={c.transcribeMicrophone}
          onChange={(v) => setCopilot({ transcribeMicrophone: v })}
          hint="Gives answers the whole conversation. Applies from the next session."
        />
        <Switch label="Compact answers" checked={c.compact} onChange={(v) => setCopilot({ compact: v })} hint="Only the answer, no key points or follow-ups." />
      </div>
    </div>
  );
}

function KeysPanel({ onClose }: { onClose: () => void }) {
  const shortcuts = useApp((s) => s.settings?.shortcuts);
  const global: [string, string][] = shortcuts
    ? [
        [shortcuts.answerNow, 'Answer now'],
        [shortcuts.toggleCopilot, 'Show / hide panel'],
        [shortcuts.toggleAutoAnswer, 'Auto-answer on / off'],
        [shortcuts.toggleClickThrough, 'Click-through on / off'],
        [shortcuts.pauseResume, 'Pause / resume'],
        [shortcuts.endSession, 'End session'],
      ]
    : [];
  const rows = (list: [string, string][]) =>
    list.map(([k, label]) => (
      <li key={label} className="flex justify-between gap-3 py-0.5">
        <span>{label}</span>
        <kbd className="muted font-mono text-[11px]">{k}</kbd>
      </li>
    ));
  return (
    <div className="card flex flex-col gap-2 p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Keyboard shortcuts</h2>
        <IconButton title="Close" onClick={onClose}>
          <X size={13} />
        </IconButton>
      </div>
      <p className="muted text-[11px]">Work from any app (change them in AI Settings):</p>
      <ul>{rows(global)}</ul>
      <p className="muted text-[11px]">While this panel is focused:</p>
      <ul>{rows(LOCAL_KEYS)}</ul>
    </div>
  );
}

function AnswerCard() {
  const answers = useCopilot((s) => s.answers);
  const viewing = useCopilot((s) => s.viewing);
  const pending = useCopilot((s) => s.pending);
  const compact = useApp((s) => s.settings?.copilot.compact ?? false);
  const { ask, view } = useCopilot.getState();
  const showNotice = useApp((s) => s.showNotice);
  const [showSources, setShowSources] = useState(false);
  const index = viewing === -1 ? answers.length - 1 : viewing;
  const current = answers[index];

  if (pending && viewing === -1) {
    return (
      <section className="card flex flex-col gap-2 p-3" aria-live="polite">
        <p className="muted text-[0.85em]">{pending.question}</p>
        <p className="flex items-center gap-2 text-accent">
          <Loader2 size={14} className="animate-spin" /> Writing an answer…
        </p>
      </section>
    );
  }
  if (!current) {
    return (
      <section className="card flex flex-col items-center gap-1.5 p-4 text-center">
        <Sparkles size={18} className="text-accent" />
        <p className="font-medium">Answers appear here</p>
        <p className="muted text-[0.85em]">
          When the interviewer asks a question, Velora writes an answer from your resume, notes and job. You can also type a question below.
        </p>
      </section>
    );
  }

  const a = current.answer;
  const copy = async () => {
    await navigator.clipboard.writeText(a.answer);
    showNotice('Answer copied');
  };

  return (
    <section className="card flex flex-col gap-2 p-3" aria-live="polite" data-testid="answer-card">
      <div className="flex items-center gap-1">
        <p className="muted min-w-0 flex-1 truncate text-[0.85em]" title={a.question || current.question}>
          Q: {a.question || current.question}
        </p>
        {pending && <Loader2 size={12} className="animate-spin text-accent" aria-label="Writing a new answer" />}
        <IconButton title="Previous answer (Alt+←)" onClick={() => view(index - 1)}>
          <ChevronLeft size={13} />
        </IconButton>
        <span className="muted text-[11px] tabular-nums">
          {index + 1}/{answers.length}
        </span>
        <IconButton title="Next answer (Alt+→)" onClick={() => view(index + 1)}>
          <ChevronRight size={13} />
        </IconButton>
        <IconButton title="Regenerate (Ctrl+R)" onClick={() => ask(a.question || current.question)}>
          <RefreshCw size={13} />
        </IconButton>
        <IconButton title="Copy answer (Ctrl+Shift+C)" onClick={copy}>
          <Copy size={13} />
        </IconButton>
      </div>
      <p className="select-text whitespace-pre-wrap text-[1.05em] leading-relaxed">{a.answer}</p>
      {!compact && a.keyPoints.length > 0 && (
        <ul className="select-text list-disc space-y-0.5 pl-5 text-[0.92em]">
          {a.keyPoints.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      )}
      {!compact && a.followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.followUps.map((f) => (
            <button
              key={f}
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-left text-[0.8em] hover:bg-[var(--surface-2)]"
              title="Prepare an answer to this follow-up"
              onClick={() => ask(f)}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      {!compact && (
        <button className="muted flex items-center gap-1 text-[0.8em]" onClick={() => setShowSources(!showSources)}>
          <BookOpen size={11} />
          {a.sources.length ? `Based on ${a.sources.length} item${a.sources.length === 1 ? '' : 's'} from your knowledge base` : 'No knowledge base items used'}
          {a.sources.length > 0 && <ChevronDown size={11} className={clsx(showSources && 'rotate-180')} />}
        </button>
      )}
      {showSources && !compact && (
        <ul className="muted select-text space-y-1 border-l-2 border-[var(--border)] pl-2 text-[0.8em]">
          {a.sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Answers once the interviewer pauses after something that sounds like a question. */
function useAutoAnswer(enabled: boolean) {
  const timer = useRef(0);
  const heardQuestion = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let seen = new Set(useTranscript.getState().segments.map((s) => s.id));
    const unsubscribe = useTranscript.subscribe((state) => {
      const fresh = state.segments.filter((s) => !seen.has(s.id));
      if (!fresh.length) return;
      seen = new Set(state.segments.map((s) => s.id));
      const interviewer = fresh.filter((s) => s.source === 'systemAudio');
      if (!interviewer.length) return;
      if (interviewer.some((s) => looksLikeQuestion(s.text))) heardQuestion.current = true;
      // Each new sentence restarts the wait, so long questions aren't cut off.
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const live = useApp.getState().session;
        if (!heardQuestion.current || live?.status !== 'active' || live.mode !== 'live') return;
        heardQuestion.current = false;
        useCopilot.getState().ask(null);
      }, AUTO_ANSWER_DELAY_MS);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer.current);
    };
  }, [enabled]);
}

export function CopilotWindow() {
  const session = useApp((s) => s.session);
  const settings = useApp((s) => s.settings);
  const error = useApp((s) => s.error);
  const pendingSession = useApp((s) => s.pending);
  const status = session?.status ?? 'idle';
  const inSession = status === 'active' || status === 'paused';
  const segments = useTranscript((s) => s.segments);
  const levels = useTranscript((s) => s.levels);
  const transcriber = useTranscript((s) => s.transcriber);
  const notices = useTranscript((s) => s.notices);
  const copilotError = useCopilot((s) => s.error);
  const credits = useCopilot((s) => s.creditsRemaining);
  const { replaceSegment, dismissNotice } = useTranscript.getState();
  const [panel, setPanel] = useState<Panel>(null);
  const [question, setQuestion] = useState('');
  const askInput = useRef<HTMLInputElement>(null);
  const copilot = settings?.copilot;
  const autoAnswer = copilot?.autoAnswer ?? false;

  useAutoAnswer(autoAnswer);

  // The window is transparent; the panel paints its own background at the chosen opacity.
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  const save = (next: Settings) => useApp.getState().saveSettings(next);
  const togglePanel = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const submit = () => {
    const q = question.trim();
    if (!q) return;
    useCopilot.getState().ask(q);
    setQuestion('');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState().settings;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      const { answers, viewing, ask, view, clear } = useCopilot.getState();
      const index = viewing === -1 ? answers.length - 1 : viewing;
      const current = answers[index];
      const ctrl = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (panel) setPanel(null);
        else if (typing) (e.target as HTMLElement).blur();
        else getCurrentWindow().hide();
      } else if (ctrl && e.key === 'Enter' && !typing) {
        e.preventDefault();
        ask(null);
      } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'c' && current) {
        e.preventDefault();
        navigator.clipboard.writeText(current.answer.answer).then(() => useApp.getState().showNotice('Answer copied'));
      } else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (current) ask(current.answer.question || current.question);
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        view(index - 1);
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        view(index + 1);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        askInput.current?.focus();
      } else if (ctrl && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        togglePanel('instructions');
      } else if (ctrl && e.key === ',') {
        e.preventDefault();
        togglePanel('overlay');
      } else if (ctrl && (e.key === '=' || e.key === '+' || e.key === '-') && s) {
        e.preventDefault();
        const step = e.key === '-' ? -0.05 : 0.05;
        const fontScale = Math.min(1.5, Math.max(0.8, Math.round((s.copilot.fontScale + step) * 100) / 100));
        save({ ...s, copilot: { ...s.copilot, fontScale } });
      } else if (ctrl && e.key.toLowerCase() === 't' && s) {
        e.preventDefault();
        save({ ...s, copilot: { ...s.copilot, showTranscript: !s.copilot.showTranscript } });
      } else if (ctrl && e.key.toLowerCase() === 'l' && !typing) {
        e.preventDefault();
        clear();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  const style = {
    '--panel-alpha': `${Math.round((copilot?.opacity ?? 0.96) * 100)}%`,
    fontSize: `${13 * (copilot?.fontScale ?? 1)}px`,
  } as CSSProperties;

  return (
    <div className="copilot-panel flex h-full flex-col overflow-hidden rounded-lg border border-[var(--border)]" style={style}>
      {/* Custom title bar: the whole strip drags the window. */}
      <header data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-2.5">
        <img src="/logo.png" alt="" className="pointer-events-none h-5 w-5 rounded" />
        <span data-tauri-drag-region className="text-[13px] font-semibold">
          Copilot
        </span>
        <span
          data-testid="session-status"
          className={clsx(
            'ml-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
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
        <div className="ml-auto flex items-center">
          <IconButton title={`Answer now (${settings?.shortcuts.answerNow ?? 'Ctrl+Enter'})`} onClick={() => useCopilot.getState().ask(null)}>
            <Sparkles size={14} />
          </IconButton>
          <IconButton
            title={`Auto-answer ${autoAnswer ? 'on' : 'off'} (${settings?.shortcuts.toggleAutoAnswer ?? ''})`}
            active={autoAnswer}
            onClick={() => settings && save({ ...settings, copilot: { ...settings.copilot, autoAnswer: !autoAnswer } })}
          >
            <Zap size={14} />
          </IconButton>
          <IconButton title="Custom instructions (Ctrl+I)" active={panel === 'instructions'} onClick={() => togglePanel('instructions')}>
            <MessageSquareText size={14} />
          </IconButton>
          <IconButton title="Overlay and theme (Ctrl+,)" active={panel === 'overlay'} onClick={() => togglePanel('overlay')}>
            <SlidersHorizontal size={14} />
          </IconButton>
          <IconButton title="Keyboard shortcuts" active={panel === 'keys'} onClick={() => togglePanel('keys')}>
            <Keyboard size={14} />
          </IconButton>
          <IconButton title="Open Velora" onClick={() => ipc.showMain()}>
            <LayoutDashboard size={14} />
          </IconButton>
          <IconButton title="Hide panel (session keeps running)" onClick={() => getCurrentWindow().hide()}>
            <EyeOff size={14} />
          </IconButton>
        </div>
      </header>

      {(error || copilotError) && (
        <div role="alert" className="flex items-start gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <span className="flex-1">{copilotError ?? error}</span>
          <button
            aria-label="Dismiss"
            onClick={() => (copilotError ? useCopilot.getState().dismissError() : useApp.getState().clearError())}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-1.5">
        {inSession && session ? (
          <>
            <CaptureIndicators capture={session.capture} levels={levels} compact />
            <SessionControls size="sm" />
          </>
        ) : (
          <>
            <span className="muted text-xs">{status === 'ended' ? 'Session ended' : 'Not listening'}</span>
            <button className="btn btn-primary py-1 text-xs" disabled={pendingSession} onClick={() => useApp.getState().start('live')}>
              <Radio size={13} /> Start listening
            </button>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {panel === 'instructions' && <InstructionsPanel onClose={() => setPanel(null)} />}
        {panel === 'overlay' && <OverlayPanel onClose={() => setPanel(null)} />}
        {panel === 'keys' && <KeysPanel onClose={() => setPanel(null)} />}

        {notices.map((n, i) => (
          <div key={i} role="status" className="flex items-start gap-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-500">
            <span className="flex-1">{n}</span>
            <button onClick={() => dismissNotice(i)} aria-label="Dismiss">
              <X size={12} />
            </button>
          </div>
        ))}

        <AnswerCard />

        {copilot?.showTranscript && (inSession || segments.length > 0) && (
          <section className="card flex min-h-32 flex-1 flex-col p-2.5">
            <h2 className="muted mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
              <ScrollText size={12} /> Transcript
              <span className="ml-auto font-normal normal-case tracking-normal" data-testid="transcriber-status">
                {transcriber.status === 'loading' && 'Starting transcriber…'}
                {transcriber.status === 'ready' && transcriber.modelId}
              </span>
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <TranscriptView
                segments={segments}
                onSegmentSaved={replaceSegment}
                empty={status === 'paused' ? 'Paused. Nothing is being captured.' : 'Listening… the interviewer’s words appear here.'}
              />
            </div>
          </section>
        )}
      </div>

      <form
        className="flex items-center gap-1.5 border-t border-[var(--border)] p-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={askInput}
          className="field py-1.5 text-[12px]"
          placeholder="Type a question and press Enter  ( / )"
          value={question}
          maxLength={1500}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Ask a question"
        />
        <button className="btn btn-primary px-2 py-1.5" type="submit" disabled={!question.trim()} aria-label="Get answer">
          <Send size={13} />
        </button>
      </form>
      {credits !== null && <div className="muted px-3 pb-1.5 text-right text-[10px]">{credits} AI credits left this month</div>}
    </div>
  );
}

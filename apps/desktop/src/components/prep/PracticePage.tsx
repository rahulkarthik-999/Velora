import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, ChevronLeft, ChevronRight, GraduationCap, Loader2, Mic, Sparkles, Square, Trash2 } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import { useTranscript } from '../../stores/transcript';
import type { Difficulty, Job, PracticeFocus, PracticeItem, PracticeSessionSummary } from '../../types';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function scoreClass(score: number) {
  return score >= 8 ? 'text-emerald-500' : score >= 5 ? 'text-amber-500' : 'text-red-400';
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="muted mb-1 text-xs font-semibold uppercase tracking-wide">{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function FeedbackCard({ item }: { item: PracticeItem }) {
  const f = item.feedback;
  if (!f) return null;
  return (
    <section className="card flex flex-col gap-4 p-5" data-testid="feedback">
      <div className="flex items-baseline gap-3">
        <span className={clsx('text-3xl font-semibold', scoreClass(f.score))}>{f.score}</span>
        <span className="muted text-sm">/ 10</span>
        <p className="text-sm">{f.summary}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <List title="What worked" items={f.strengths} />
        <List title="Improve" items={f.improvements} />
      </div>
      <div>
        <h4 className="muted mb-1 text-xs font-semibold uppercase tracking-wide">Model answer</h4>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{f.modelAnswer}</p>
      </div>
      <List title="Talking points" items={f.talkingPoints} />
      <List title="Based on your resume facts" items={f.evidenceUsed} />
      {f.followUpQuestion && (
        <p className="text-sm">
          <span className="muted">Likely follow-up: </span>
          {f.followUpQuestion}
        </p>
      )}
    </section>
  );
}

function Runner({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [items, setItems] = useState<PracticeItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState<'record' | 'stop' | 'feedback' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useApp((s) => s.session);
  const liveSegments = useTranscript((s) => s.segments);
  const recording = session?.mode === 'practice' && (session.status === 'active' || session.status === 'paused');

  useEffect(() => {
    ipc.getPractice(sessionId).then(setItems, (e: Error) => setError(e.message));
  }, [sessionId]);

  const item = items[index];
  useEffect(() => setAnswer(item?.answer ?? ''), [item?.id, item?.answer]);

  const replace = (updated: PracticeItem) => setItems((all) => all.map((x) => (x.id === updated.id ? updated : x)));

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<PracticeItem | void>) => {
    setBusy(kind);
    setError(null);
    try {
      const updated = await fn();
      if (updated) replace(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!item) return <p className="muted">{error ?? 'Loading…'}</p>;
  const dirty = answer.trim() !== (item.answer ?? '').trim();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button className="btn" onClick={onBack} disabled={recording}>
          <ArrowLeft size={15} /> All practice
        </button>
        <ol className="ml-auto flex gap-1" aria-label="Questions">
          {items.map((it, i) => (
            <li key={it.id}>
              <button
                onClick={() => setIndex(i)}
                disabled={recording}
                aria-current={i === index ? 'step' : undefined}
                className={clsx(
                  'h-8 w-8 rounded-md border text-xs font-medium',
                  i === index ? 'border-[var(--color-accent)]' : 'border-[var(--border)]',
                  it.score !== null && scoreClass(it.score)
                )}
                title={it.score !== null ? `Score ${it.score}` : it.answer ? 'Answered' : 'Not answered'}
              >
                {it.score ?? i + 1}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <section className="card p-5">
        <div className="muted mb-2 text-xs uppercase tracking-wide">
          Question {index + 1} of {items.length} · {item.category}
        </div>
        <p className="text-lg font-medium leading-snug">{item.question}</p>
        {item.focus && <p className="muted mt-2 text-sm">A strong answer covers: {item.focus}</p>}
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <section className="card flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Your answer</h3>
          <div className="ml-auto flex gap-2">
            {recording ? (
              <button className="btn btn-danger" disabled={busy === 'stop'} onClick={() => run('stop', ipc.practiceRecordStop)}>
                {busy === 'stop' ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                {busy === 'stop' ? 'Finishing…' : 'Stop'}
              </button>
            ) : (
              <button
                className="btn"
                disabled={!!busy}
                onClick={() => run('record', () => ipc.practiceRecordStart(item.id))}
                title="Answer out loud; Velora transcribes your microphone on this PC"
              >
                <Mic size={14} /> {item.answer ? 'Record again' : 'Record answer'}
              </button>
            )}
          </div>
        </div>

        {recording ? (
          <div className="rounded-md bg-[var(--surface-2)] p-3 text-sm" aria-live="polite">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Recording from your microphone…
            <p className="mt-2">{liveSegments.map((s) => s.text).join(' ') || <span className="muted">Start speaking.</span>}</p>
          </div>
        ) : (
          <>
            <textarea
              className="field min-h-28 text-sm"
              value={answer}
              maxLength={8000}
              placeholder="Record your answer, or type it here."
              onChange={(e) => setAnswer(e.target.value)}
              aria-label="Your answer"
            />
            <div className="flex items-center gap-2">
              {dirty && (
                <button className="btn" disabled={!!busy} onClick={() => run('save', () => ipc.savePracticeAnswer(item.id, answer))}>
                  Save answer
                </button>
              )}
              <button
                className="btn btn-primary"
                disabled={!!busy || dirty || !item.answer}
                onClick={() => run('feedback', () => ipc.practiceFeedback(item.id))}
                title={dirty ? 'Save your answer first' : 'Uses 1 AI credit'}
              >
                {busy === 'feedback' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {item.feedback ? 'Get new feedback' : 'Get feedback'}
              </button>
              <div className="ml-auto flex gap-1">
                <button className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous question">
                  <ChevronLeft size={15} />
                </button>
                <button
                  className="btn"
                  disabled={index === items.length - 1}
                  onClick={() => setIndex(index + 1)}
                  aria-label="Next question"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <FeedbackCard item={item} />
    </div>
  );
}

function NewPractice({ onCreated }: { onCreated: (id: string) => void }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [jobId, setJobId] = useState('');
  const [focus, setFocus] = useState<PracticeFocus>('mixed');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setPage = useApp((s) => s.setPage);

  useEffect(() => {
    ipc.listJobs().then((j) => {
      setJobs(j);
      if (j[0]) setJobId(j[0].id);
    }, (e: Error) => setError(e.message));
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const view = await ipc.createPractice(jobId, focus, difficulty, count);
      onCreated(view.sessionId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (jobs?.length === 0) {
    return (
      <div className="card flex items-center justify-between p-5">
        <p className="text-sm">Add the job you're preparing for first.</p>
        <button className="btn btn-primary" onClick={() => setPage('job')}>
          Add a job
        </button>
      </div>
    );
  }

  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-sm font-semibold">New practice</h2>
      <div className="grid grid-cols-4 gap-3 text-sm">
        <label className="col-span-2">
          Job
          <select className="field mt-1" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            {jobs?.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
                {j.company ? ` at ${j.company}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Questions
          <select className="field mt-1" value={focus} onChange={(e) => setFocus(e.target.value as PracticeFocus)}>
            <option value="mixed">Mixed</option>
            <option value="behavioral">Behavioural</option>
            <option value="technical">Technical</option>
            <option value="situational">Situational</option>
          </select>
        </label>
        <label>
          Difficulty
          <select className="field mt-1" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          How many
          <input
            type="number"
            className="field w-20"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
        <button className="btn btn-primary ml-auto" disabled={busy || !jobId} onClick={create} title="Uses 1 AI credit">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate questions
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

export function PracticePage() {
  const [sessions, setSessions] = useState<PracticeSessionSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    ipc.listPractice().then(setSessions, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load, open]);

  if (open) return <Runner sessionId={open} onBack={() => setOpen(null)} />;

  const remove = async (s: PracticeSessionSummary) => {
    if (!window.confirm(`Delete this practice session (${s.title})?`)) return;
    await ipc.deletePractice(s.id);
    load();
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Practice</h1>
        <p className="muted mt-1">
          Answer realistic questions for your role out loud, then get a score, specific improvements and a model answer
          built from your own experience.
        </p>
      </header>

      <NewPractice onCreated={setOpen} />

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">History</h2>
        {sessions?.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 p-10 text-center">
            <GraduationCap size={24} className="text-accent" />
            <p className="muted text-sm">Your practice sessions will appear here.</p>
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--border)]">
            {sessions?.map((s) => (
              <li key={s.id} className="flex items-center">
                <button className="flex-1 px-4 py-3 text-left" onClick={() => setOpen(s.id)}>
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="muted text-xs">
                    {dateFormat.format(s.createdAtMs)} · {s.focus} · {s.difficulty} · {s.answeredCount}/{s.itemCount} answered
                  </div>
                </button>
                {s.averageScore !== null && (
                  <span className={clsx('px-3 text-sm font-semibold', scoreClass(s.averageScore))}>
                    {s.averageScore.toFixed(1)}
                  </span>
                )}
                <button className="muted p-3 hover:text-red-400" aria-label="Delete practice session" onClick={() => remove(s)}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

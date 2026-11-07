import { useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, ChevronDown, Copy, Loader2, Mic, RefreshCw, Sparkles } from 'lucide-react';
import { formatDuration } from '../../lib/format';
import { useApp } from '../../stores/app';
import { looksLikeQuestion, useCopilot, type QaCard } from '../../stores/copilot';
import { useTranscript } from '../../stores/transcript';

const STATUS: Record<QaCard['status'], { label: string; className: string }> = {
  generating: { label: 'Generating answer', className: 'text-accent' },
  answered: { label: 'Answer ready', className: 'text-emerald-500' },
  failed: { label: 'Generation failed', className: 'text-red-400' },
};

function Card({ card, n, compact }: { card: QaCard; n: number; compact: boolean }) {
  const collapsed = useCopilot((s) => s.collapsed[card.id] ?? false);
  const { retry, toggle, ask } = useCopilot.getState();
  const showNotice = useApp((s) => s.showNotice);
  const a = card.answer?.answer;
  const status = STATUS[card.status];

  const copy = async () => {
    if (!a) return;
    await navigator.clipboard.writeText(a.answer);
    showNotice('Answer copied');
  };

  return (
    <article id={`qa-card-${card.id}`} className="card flex flex-col gap-2 p-3 cursor-default select-none" data-testid="qa-card" aria-busy={card.status === 'generating'}>
      <header className="flex items-center gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-accent">Q{n}</span>
        {card.askedAtMs !== null && <span className="muted tabular-nums">{formatDuration(card.askedAtMs)}</span>}
        <span className={clsx('ml-auto flex items-center gap-1', status.className)} data-testid="qa-status">
          {card.status === 'generating' && <Loader2 size={11} className="animate-spin" />}
          {card.status === 'answered' && <CheckCircle2 size={11} />}
          {card.status === 'failed' && <AlertCircle size={11} />}
          {status.label}
        </span>
      </header>

      <p className="cursor-default select-none text-[0.9em] font-medium leading-snug" data-testid="qa-question">
        <span className="muted font-normal">Interviewer: </span>
        {card.question}
      </p>

      {card.status === 'generating' && !a && (
        <div className="flex flex-col gap-1.5" aria-label="Writing an answer">
          <div className="h-2.5 w-11/12 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-2.5 w-4/5 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-2.5 w-2/3 animate-pulse rounded bg-[var(--surface-2)]" />
        </div>
      )}

      {card.status === 'failed' && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-2.5 py-2 text-[0.85em] text-red-400" role="alert">
          <span className="flex-1">{card.error}</span>
          <button className="btn py-1 text-xs" onClick={() => retry(card)}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {a && (
        <div className="border-l-2 border-[var(--color-accent)] pl-3" data-testid="qa-answer">
          <div className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-accent">
            <Sparkles size={11} /> Velora answer
            <span className="ml-auto flex items-center gap-0.5 normal-case tracking-normal">
              <button className="muted rounded p-1 hover:bg-[var(--surface-2)]" aria-label="Copy answer" onClick={copy}>
                <Copy size={12} />
              </button>
              <button
                className="muted rounded p-1 hover:bg-[var(--surface-2)]"
                aria-label="Regenerate answer"
                disabled={card.status === 'generating'}
                onClick={() => retry(card)}
              >
                <RefreshCw size={12} className={clsx(card.status === 'generating' && 'animate-spin')} />
              </button>
              <button
                className="muted rounded p-1 hover:bg-[var(--surface-2)]"
                aria-label={collapsed ? 'Expand answer' : 'Collapse answer'}
                aria-expanded={!collapsed}
                onClick={() => toggle(card.id)}
              >
                <ChevronDown size={12} className={clsx('transition-transform', collapsed && '-rotate-90')} />
              </button>
            </span>
          </div>
          {!collapsed && (
            <>
              <p className={clsx('cursor-default select-none whitespace-pre-wrap text-[1.05em] leading-relaxed', card.status === 'generating' && 'opacity-60')}>
                {a.answer}
              </p>
              {!compact && a.keyPoints.length > 0 && (
                <ul className="muted mt-1.5 list-disc space-y-0.5 pl-4 text-[0.88em]">
                  {a.keyPoints.map((k) => (
                    <li key={k} className="cursor-default select-none">
                      {k}
                    </li>
                  ))}
                </ul>
              )}
              {!compact && a.followUps.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {a.followUps.map((f) => (
                    <button
                      key={f}
                      className="rounded-full border border-[var(--border)] px-2 py-0.5 text-left text-[0.78em] hover:bg-[var(--surface-2)]"
                      onClick={() => ask(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

/** The interviewer's words not yet in a card: "Listening" or "Question detected". */
function LiveCard({ listening }: { listening: boolean }) {
  const segments = useTranscript((s) => s.segments);
  const heardUntil = useCopilot((s) => s.heardUntilMs);
  const lastCardAt = useCopilot((s) => s.cards.reduce((m, c) => Math.max(m, c.askedAtMs ?? -1), -1));
  const pending = useMemo(() => {
    const since = Math.max(heardUntil, lastCardAt);
    const fresh = segments.filter((s) => s.source === 'systemAudio' && s.endMs > since);
    return fresh.map((s) => s.text.trim()).join(' ');
  }, [segments, heardUntil, lastCardAt]);
  const detected = pending.length > 0 && looksLikeQuestion(pending);

  if (!listening && !pending) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-2.5 text-[0.85em]" aria-live="polite">
      <span className="relative mt-1 flex h-2 w-2 shrink-0">
        {listening && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-60" />}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-accent" data-testid="live-state">
          {detected ? 'Question detected' : 'Listening'}
        </div>
        <p className="muted mt-0.5 select-text">{pending || 'Waiting for the interviewer…'}</p>
      </div>
      {pending && (
        <button className="btn py-1 text-xs" onClick={() => useCopilot.getState().ask(null)}>
          <Mic size={12} /> Answer now
        </button>
      )}
    </div>
  );
}

/** Every interviewer question in order, each with its answer directly underneath. */
export function QaFeed({ listening }: { listening: boolean }) {
  const cards = useCopilot((s) => s.cards);
  const compact = useApp((s) => s.settings?.copilot.compact ?? false);
  const end = useRef<HTMLDivElement>(null);
  const ordered = useMemo(() => [...cards].sort((x, y) => x.createdAt - y.createdAt), [cards]);
  const latest = ordered[ordered.length - 1];

  // Keep the latest answer visible up top so the candidate can read comfortably without it jumping down.
  useEffect(() => {
    if (!latest) return;
    const cardEl = document.getElementById(`qa-card-${latest.id}`);
    if (latest.status === 'answered') {
      // The answer stays up at the top of the viewing area
      cardEl?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    } else {
      cardEl?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  }, [ordered.length, latest?.id, latest?.status]);

  return (
    <div className="flex flex-col gap-2">
      {ordered.length === 0 && !listening && (
        <section className="card flex flex-col items-center gap-1.5 p-4 text-center">
          <Sparkles size={18} className="text-accent" />
          <p className="font-medium">Questions and answers appear here</p>
          <p className="muted text-[0.85em]">
            Start listening and each interviewer question gets its own card, with an answer from your resume, notes and job
            right underneath. You can also type a question below.
          </p>
        </section>
      )}
      {ordered.map((c, i) => (
        <Card key={c.id} card={c} n={i + 1} compact={compact} />
      ))}
      <LiveCard listening={listening} />
      <div ref={end} />
    </div>
  );
}

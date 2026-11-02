import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Pencil } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { formatDuration } from '../../lib/format';
import type { SourceKind, TranscriptSegment } from '../../types';

/** Below this mean token probability, a line is marked as uncertain. */
export const LOW_CONFIDENCE = 0.6;

const SOURCE_LABEL: Record<SourceKind, string> = { microphone: 'Mic', systemAudio: 'System' };

function Line({ segment, onSaved }: { segment: TranscriptSegment; onSaved: (s: TranscriptSegment) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);
  const [error, setError] = useState<string | null>(null);
  const uncertain = !segment.corrected && segment.confidence !== null && segment.confidence < LOW_CONFIDENCE;

  const save = async () => {
    if (draft.trim() === segment.text) return setEditing(false);
    try {
      onSaved(await ipc.updateTranscriptSegment(segment.id, draft));
      setEditing(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <li className="group flex gap-2 py-1" data-testid="transcript-line">
      <span className="muted w-12 shrink-0 pt-0.5 text-[11px] tabular-nums">{formatDuration(segment.startMs)}</span>
      <span
        className={clsx(
          'h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
          segment.source === 'systemAudio' ? 'bg-sky-500/15 text-sky-500' : 'bg-[var(--color-accent)]/15 text-accent'
        )}
        title={segment.source === 'systemAudio' ? 'From your speakers (usually the interviewer)' : 'From your microphone'}
      >
        {SOURCE_LABEL[segment.source]}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <>
            <textarea
              className="field text-[13px]"
              value={draft}
              rows={2}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  save();
                }
                if (e.key === 'Escape') {
                  setDraft(segment.text);
                  setEditing(false);
                }
              }}
              onBlur={save}
              aria-label="Edit transcript line"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
          </>
        ) : (
          <button
            className={clsx('w-full text-left', uncertain && 'decoration-amber-500/70 decoration-dotted underline underline-offset-4')}
            onClick={() => {
              setDraft(segment.text);
              setEditing(true);
            }}
            title={uncertain ? 'Low confidence. Click to correct.' : 'Click to correct'}
          >
            {segment.text}
            {segment.corrected && <span className="muted ml-1 text-[10px]">(edited)</span>}
            <Pencil size={11} className="muted ml-1 inline opacity-0 group-hover:opacity-100" aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

export function TranscriptView({
  segments,
  onSegmentSaved,
  follow = true,
  empty,
}: {
  segments: TranscriptSegment[];
  onSegmentSaved: (s: TranscriptSegment) => void;
  follow?: boolean;
  empty: string;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (follow) bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [segments.length, follow]);

  if (segments.length === 0) return <p className="muted text-[13px]">{empty}</p>;
  return (
    <>
      <ul className="text-[13px]">
        {segments.map((s) => (
          <Line key={s.id} segment={s} onSaved={onSegmentSaved} />
        ))}
      </ul>
      <div ref={bottom} />
    </>
  );
}

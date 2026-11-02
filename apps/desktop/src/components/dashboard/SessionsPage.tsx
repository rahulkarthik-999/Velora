import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { History, Trash2 } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { formatDuration } from '../../lib/format';
import { useApp } from '../../stores/app';
import type { SessionRecord, TranscriptSegment } from '../../types';
import { TranscriptView } from '../transcript/TranscriptView';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Reload when the live session changes state, so a just-ended session shows up.
  const liveStatus = useApp((s) => s.session?.status);

  const load = useCallback(() => {
    ipc.listSessions().then(setSessions, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load, liveStatus]);

  useEffect(() => {
    if (!selected) return setSegments([]);
    ipc.getTranscript(selected).then(setSegments, (e: Error) => setError(e.message));
  }, [selected]);

  const remove = async (id: string) => {
    if (!window.confirm('Delete this session and its transcript from this PC? This cannot be undone.')) return;
    try {
      await ipc.deleteSession(id);
      if (selected === id) setSelected(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Interview Sessions</h1>
        <p className="muted mt-1">Saved only on this PC. Click a line in a transcript to correct it.</p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {sessions === null ? (
        <p className="muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-8 py-14 text-center">
          <History size={26} className="text-accent" />
          <p className="font-medium">No sessions yet</p>
          <p className="muted text-sm">Sessions you run from the Live Interview page appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[280px_1fr] gap-4">
          <ul className="card max-h-[65vh] divide-y divide-[var(--border)] overflow-y-auto">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center">
                <button
                  className={clsx('flex-1 px-3 py-2.5 text-left', selected === s.id && 'bg-[var(--surface-2)]')}
                  onClick={() => setSelected(s.id)}
                >
                  <div className="text-sm font-medium">{dateFormat.format(s.startedAtMs)}</div>
                  <div className="muted text-xs">
                    {s.mode === 'practice' ? 'Practice' : 'Live'} · {formatDuration(s.activeMs)} · {s.segmentCount} lines
                    {s.status !== 'ended' && ` · ${s.status}`}
                  </div>
                </button>
                <button className="muted p-3 hover:text-red-400" onClick={() => remove(s.id)} aria-label="Delete session">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <div className="card max-h-[65vh] overflow-y-auto p-4">
            {selected ? (
              <TranscriptView
                segments={segments}
                follow={false}
                onSegmentSaved={(seg) => setSegments((all) => all.map((x) => (x.id === seg.id ? seg : x)))}
                empty="Nothing was transcribed in this session."
              />
            ) : (
              <p className="muted text-sm">Select a session to read its transcript.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

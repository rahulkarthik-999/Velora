import { create } from 'zustand';
import { ipc } from '../lib/ipc';
import type { PipelineEvent, SourceKind, TranscriptSegment } from '../types';

/** Keep the live view bounded; the full transcript is in the local database. */
export const MAX_LIVE_SEGMENTS = 500;

export type TranscriberState =
  | { status: 'idle' }
  | { status: 'loading'; modelId: string }
  | { status: 'ready'; modelId: string }
  | { status: 'failed'; message: string };

interface TranscriptStore {
  sessionId: string | null;
  segments: TranscriptSegment[];
  levels: Record<SourceKind, number>;
  transcriber: TranscriberState;
  notices: string[];

  /** Switches to a session, loading what was already transcribed. */
  attach: (sessionId: string | null) => Promise<void>;
  handle: (event: PipelineEvent) => void;
  replaceSegment: (segment: TranscriptSegment) => void;
  dismissNotice: (index: number) => void;
}

const SOURCE_LABEL: Record<SourceKind, string> = { microphone: 'Microphone', systemAudio: 'System audio' };

function insertSorted(list: TranscriptSegment[], seg: TranscriptSegment): TranscriptSegment[] {
  if (list.some((s) => s.id === seg.id)) return list;
  const next = [...list, seg].sort((a, b) => a.startMs - b.startMs);
  return next.length > MAX_LIVE_SEGMENTS ? next.slice(next.length - MAX_LIVE_SEGMENTS) : next;
}

export const useTranscript = create<TranscriptStore>((set, get) => ({
  sessionId: null,
  segments: [],
  levels: { microphone: 0, systemAudio: 0 },
  transcriber: { status: 'idle' },
  notices: [],

  attach: async (sessionId) => {
    if (sessionId === get().sessionId) return;
    set({ sessionId, segments: [], notices: [], levels: { microphone: 0, systemAudio: 0 } });
    if (!sessionId) return;
    try {
      const saved = await ipc.getTranscript(sessionId);
      if (get().sessionId !== sessionId) return;
      // Merge: live events may have arrived while loading.
      set((s) => ({ segments: saved.reduce(insertSorted, s.segments) }));
    } catch (e) {
      set((s) => ({ notices: [...s.notices, `Could not load transcript: ${(e as Error).message}`] }));
    }
  },

  handle: (event) => {
    switch (event.kind) {
      case 'segment':
        if (event.segment.sessionId !== get().sessionId) return;
        set((s) => ({ segments: insertSorted(s.segments, event.segment) }));
        return;
      case 'level':
        set((s) => ({ levels: { ...s.levels, [event.source]: event.rms } }));
        return;
      case 'transcriberLoading':
        set({ transcriber: { status: 'loading', modelId: event.modelId } });
        return;
      case 'transcriberReady':
        set({ transcriber: { status: 'ready', modelId: event.modelId } });
        return;
      case 'transcriberFailed':
        set((s) => ({ notices: [...s.notices, event.message] }));
        return;
      case 'sourceFailed':
        set((s) => ({ notices: [...s.notices, `${SOURCE_LABEL[event.source]} stopped: ${event.message}`] }));
        return;
      case 'segmentDropped':
        set((s) => ({
          notices: s.notices.includes('Transcription is falling behind; some speech was skipped.')
            ? s.notices
            : [...s.notices, 'Transcription is falling behind; some speech was skipped.'],
        }));
        return;
    }
  },

  replaceSegment: (segment) =>
    set((s) => ({ segments: s.segments.map((x) => (x.id === segment.id ? segment : x)) })),

  dismissNotice: (index) => set((s) => ({ notices: s.notices.filter((_, i) => i !== index) })),
}));

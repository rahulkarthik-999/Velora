import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptSegment } from '../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { useTranscript, MAX_LIVE_SEGMENTS } = await import('./transcript');

const seg = (id: string, startMs: number, sessionId = 's1'): TranscriptSegment => ({
  id,
  sessionId,
  source: 'systemAudio',
  startMs,
  endMs: startMs + 500,
  text: `line ${id}`,
  confidence: 0.9,
  corrected: false,
});

beforeEach(async () => {
  invoke.mockReset();
  useTranscript.setState({ sessionId: null, segments: [], notices: [], transcriber: { status: 'idle' } });
  invoke.mockResolvedValueOnce([]);
  await useTranscript.getState().attach('s1');
});

describe('transcript store', () => {
  it('keeps segments in time order even when they arrive out of order', () => {
    const { handle } = useTranscript.getState();
    handle({ kind: 'segment', segment: seg('b', 2_000) });
    handle({ kind: 'segment', segment: seg('a', 1_000) });
    expect(useTranscript.getState().segments.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('ignores duplicates and segments from other sessions', () => {
    const { handle } = useTranscript.getState();
    handle({ kind: 'segment', segment: seg('a', 1_000) });
    handle({ kind: 'segment', segment: seg('a', 1_000) });
    handle({ kind: 'segment', segment: seg('x', 0, 'other') });
    expect(useTranscript.getState().segments).toHaveLength(1);
  });

  it('bounds the live list', () => {
    const { handle } = useTranscript.getState();
    for (let i = 0; i < MAX_LIVE_SEGMENTS + 20; i++) handle({ kind: 'segment', segment: seg(`${i}`, i) });
    const segments = useTranscript.getState().segments;
    expect(segments).toHaveLength(MAX_LIVE_SEGMENTS);
    expect(segments.at(-1)?.id).toBe(`${MAX_LIVE_SEGMENTS + 19}`);
  });

  it('loads saved lines when attaching mid-session and merges live ones', async () => {
    useTranscript.setState({ sessionId: null, segments: [] });
    let resolve!: (v: TranscriptSegment[]) => void;
    invoke.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const attaching = useTranscript.getState().attach('s1');
    useTranscript.getState().handle({ kind: 'segment', segment: seg('live', 5_000) });
    resolve([seg('saved', 1_000)]);
    await attaching;
    expect(invoke).toHaveBeenCalledWith('get_transcript', { sessionId: 's1' });
    expect(useTranscript.getState().segments.map((s) => s.id)).toEqual(['saved', 'live']);
  });

  it('turns device failures into a notice and tracks the model state', () => {
    const { handle } = useTranscript.getState();
    handle({ kind: 'transcriberLoading', modelId: 'small.en-q5_1' });
    expect(useTranscript.getState().transcriber.status).toBe('loading');
    handle({ kind: 'transcriberReady', modelId: 'small.en-q5_1', loadMs: 900 });
    expect(useTranscript.getState().transcriber.status).toBe('ready');
    handle({ kind: 'sourceFailed', source: 'microphone', message: 'device unplugged' });
    expect(useTranscript.getState().notices[0]).toBe('Microphone stopped: device unplugged');
  });

  it('shows the falling-behind notice only once', () => {
    const { handle } = useTranscript.getState();
    handle({ kind: 'segmentDropped', source: 'systemAudio' });
    handle({ kind: 'segmentDropped', source: 'microphone' });
    expect(useTranscript.getState().notices).toHaveLength(1);
  });
});

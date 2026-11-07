import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TranscriptSegment } from '../../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { TranscriptView } = await import('./TranscriptView');
const { levelToPercent } = await import('../session/CaptureIndicators');

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

const seg = (over: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  id: 'a',
  sessionId: 's',
  source: 'systemAudio',
  startMs: 65_000,
  endMs: 66_000,
  text: 'Tell me about cubanetes',
  confidence: 0.9,
  corrected: false,
  ...over,
});

describe('TranscriptView', () => {
  it('labels the source and timestamp of each line', () => {
    render(<TranscriptView segments={[seg(), seg({ id: 'b', source: 'microphone' })]} onSegmentSaved={() => {}} empty="none" />);
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('Mic')).toBeTruthy();
    expect(screen.getAllByText('01:05')).toHaveLength(2);
  });

  it('shows the empty message', () => {
    render(<TranscriptView segments={[]} onSegmentSaved={() => {}} empty="Listening…" />);
    expect(screen.getByText('Listening…')).toBeTruthy();
  });

  it('marks low-confidence lines', () => {
    render(<TranscriptView segments={[seg({ confidence: 0.3 })]} onSegmentSaved={() => {}} empty="" />);
    expect(screen.getByLabelText('Low confidence, edit transcript')).toBeTruthy();
  });

  it('saves a correction through Rust and reports the stored line', async () => {
    const saved = seg({ text: 'Tell me about Kubernetes', corrected: true });
    invoke.mockResolvedValueOnce(saved);
    const onSaved = vi.fn();
    render(<TranscriptView segments={[seg()]} onSegmentSaved={onSaved} empty="" />);

    fireEvent.click(screen.getByText(/cubanetes/));
    const box = screen.getByLabelText('Edit transcript line');
    fireEvent.change(box, { target: { value: 'Tell me about Kubernetes' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(invoke).toHaveBeenCalledWith('update_transcript_segment', { id: 'a', text: 'Tell me about Kubernetes' });
  });

  it('keeps the editor open and shows the error when saving fails', async () => {
    invoke.mockRejectedValueOnce("Transcript text can't be empty.");
    render(<TranscriptView segments={[seg()]} onSegmentSaved={() => {}} empty="" />);
    fireEvent.click(screen.getByText(/cubanetes/));
    const box = screen.getByLabelText('Edit transcript line');
    fireEvent.change(box, { target: { value: '  ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByText("Transcript text can't be empty.")).toBeTruthy();
    expect(screen.getByLabelText('Edit transcript line')).toBeTruthy();
  });
});

describe('levelToPercent', () => {
  it('maps silence to 0 and loud speech near 1', () => {
    expect(levelToPercent(0)).toBe(0);
    expect(levelToPercent(0.3)).toBeGreaterThan(0.8);
    expect(levelToPercent(10)).toBe(1);
  });
});

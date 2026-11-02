import { describe, expect, it } from 'vitest';
import { looksLikeQuestion, useCopilot } from './copilot';
import type { SavedAnswer } from '../types';

describe('looksLikeQuestion', () => {
  it('spots questions with and without a question mark', () => {
    expect(looksLikeQuestion('What is TypeScript?')).toBe(true);
    expect(looksLikeQuestion('Great. Tell me about a time you disagreed with a manager.')).toBe(true);
    expect(looksLikeQuestion('Walk me through your last project')).toBe(true);
  });

  it('ignores small talk and short fragments', () => {
    expect(looksLikeQuestion('Okay, sounds good.')).toBe(false);
    expect(looksLikeQuestion('Hmm')).toBe(false);
    expect(looksLikeQuestion('Thanks for joining today.')).toBe(false);
  });
});

describe('copilot store', () => {
  const answer: SavedAnswer = {
    id: 'a1',
    sessionId: 's',
    question: 'Q',
    answer: { question: 'Q', answer: 'A', keyPoints: [], sources: [], followUps: [] },
    createdAtMs: 1,
  };

  it('tracks a pending answer until it arrives', () => {
    const { handle } = useCopilot.getState();
    handle({ status: 'pending', requestId: 'r1', question: 'Q' });
    expect(useCopilot.getState().pending?.requestId).toBe('r1');
    handle({ status: 'done', requestId: 'r1', answer, creditsRemaining: 41 });
    const s = useCopilot.getState();
    expect(s.pending).toBeNull();
    expect(s.answers).toHaveLength(1);
    expect(s.creditsRemaining).toBe(41);
    // The same answer arriving twice is kept once.
    handle({ status: 'done', requestId: 'r1', answer, creditsRemaining: 41 });
    expect(useCopilot.getState().answers).toHaveLength(1);
  });

  it('shows failures', () => {
    useCopilot.getState().handle({ status: 'pending', requestId: 'r2', question: 'Q' });
    useCopilot.getState().handle({ status: 'failed', requestId: 'r2', message: 'No credits' });
    expect(useCopilot.getState()).toMatchObject({ pending: null, error: 'No credits' });
  });
});

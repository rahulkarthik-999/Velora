import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }));

const { autoAnswerDelay, friendlyError, looksLikeQuestion, useCopilot } = await import('./copilot');
const { QaFeed } = await import('../components/overlay/QaFeed');
import type { SavedAnswer } from '../types';

const QUESTIONS = [
  'How would you optimize a React application that takes too long to load?',
  'What is the difference between useMemo and useCallback?',
  'Explain the React component lifecycle.',
  'How do you handle API failures in a production application?',
  'Tell me about a challenging project you worked on.',
];

const saved = (n: number, question: string): SavedAnswer => ({
  id: `saved-${n}`,
  sessionId: 's1',
  question,
  answer: { question, answer: `Answer to question ${n}.`, keyPoints: [`point ${n}`], sources: [], followUps: [] },
  createdAtMs: 1_000 + n,
});

const { handle } = useCopilot.getState();
const pending = (id: string, question: string, at: number) =>
  handle({ status: 'pending', requestId: id, question, askedAtMs: at, heardUntilMs: at + 900 });

beforeEach(() => {
  useCopilot.setState({ cards: [], heardUntilMs: -1, notice: null, collapsed: {}, sessionId: null });
  invoke.mockReset();
});
afterEach(cleanup);

describe('looksLikeQuestion', () => {
  it('spots questions with and without a question mark, ignores small talk', () => {
    expect(QUESTIONS.every(looksLikeQuestion)).toBe(true);
    expect(looksLikeQuestion('Okay, sounds good.')).toBe(false);
    expect(looksLikeQuestion('Hmm')).toBe(false);
  });
});

describe('autoAnswerDelay', () => {
  it('answers almost at once when the line ends as a question', () => {
    expect(autoAnswerDelay('What is a closure?')).toBeLessThan(autoAnswerDelay('Tell me about a project you led.'));
    expect(autoAnswerDelay('Why React? ')).toBeLessThanOrEqual(300);
    expect(autoAnswerDelay('Tell me about a project you led.')).toBeLessThanOrEqual(1_000);
  });
});

describe('question cards', () => {
  it('gives each of five questions its own card with its answer underneath, in order', () => {
    QUESTIONS.forEach((q, i) => pending(`r${i}`, q, i * 10_000));
    // Answers can finish out of order; each lands on its own question.
    [4, 1, 0, 3, 2].forEach((i) => handle({ status: 'done', requestId: `r${i}`, answer: saved(i, QUESTIONS[i]), creditsRemaining: 100 - i }));

    render(<QaFeed listening={false} />);
    const cards = screen.getAllByTestId('qa-card');
    expect(cards).toHaveLength(5);
    cards.forEach((card, i) => {
      expect(within(card).getByTestId('qa-question').textContent).toContain(QUESTIONS[i]);
      expect(within(card).getByTestId('qa-answer').textContent).toContain(`Answer to question ${i}.`);
      expect(within(card).getByTestId('qa-status').textContent).toBe('Answer ready');
    });
  });

  it('shows a question once even if its events arrive twice', () => {
    pending('r1', QUESTIONS[1], 0);
    pending('r1', QUESTIONS[1], 0);
    handle({ status: 'done', requestId: 'r1', answer: saved(1, QUESTIONS[1]), creditsRemaining: 5 });
    handle({ status: 'done', requestId: 'r1', answer: saved(1, QUESTIONS[1]), creditsRemaining: 5 });
    expect(useCopilot.getState().cards).toHaveLength(1);
  });

  it('keeps a failure on its own question with a friendly message, other answers stay', () => {
    pending('ok', QUESTIONS[0], 0);
    handle({ status: 'done', requestId: 'ok', answer: saved(0, QUESTIONS[0]), creditsRemaining: 9 });
    pending('bad', QUESTIONS[1], 10_000);
    handle({ status: 'failed', requestId: 'bad', question: QUESTIONS[1], message: 'Expected string, received null' });

    render(<QaFeed listening />);
    const [first, second] = screen.getAllByTestId('qa-card');
    expect(within(first).getByTestId('qa-answer').textContent).toContain('Answer to question 0.');
    expect(within(second).getByTestId('qa-status').textContent).toBe('Generation failed');
    expect(second.textContent).not.toContain('Expected string');
    expect(within(second).getByRole('button', { name: /Retry/ })).toBeTruthy();
    // Listening carries on.
    expect(screen.getByTestId('live-state').textContent).toBe('Listening');
  });

  it('retries and regenerates in place, on the same card', async () => {
    invoke.mockResolvedValue(saved(1, QUESTIONS[1]));
    pending('bad', QUESTIONS[1], 0);
    handle({ status: 'failed', requestId: 'bad', question: QUESTIONS[1], message: 'boom' });
    render(<QaFeed listening={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(invoke).toHaveBeenCalledWith('live_answer', { question: QUESTIONS[1], requestId: 'bad' });
    expect(useCopilot.getState().cards[0].status).toBe('generating');

    handle({ status: 'done', requestId: 'bad', answer: saved(1, QUESTIONS[1]), creditsRemaining: 1 });
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate answer' }));
    expect(invoke).toHaveBeenLastCalledWith('live_answer', { question: QUESTIONS[1], requestId: 'bad' });
    expect(useCopilot.getState().cards).toHaveLength(1);
  });

  it('copies an answer and collapses it', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    pending('r0', QUESTIONS[0], 0);
    handle({ status: 'done', requestId: 'r0', answer: saved(0, QUESTIONS[0]), creditsRemaining: 1 });
    render(<QaFeed listening={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy answer' }));
    expect(writeText).toHaveBeenCalledWith('Answer to question 0.');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse answer' }));
    expect(screen.queryByText('Answer to question 0.')).toBeNull();
  });

  it('answers a typed question, and quietly waits when nothing new was said', async () => {
    invoke.mockResolvedValueOnce(saved(9, 'Typed?'));
    await useCopilot.getState().ask('What is a closure?');
    expect(invoke).toHaveBeenCalledWith('live_answer', { question: 'What is a closure?', requestId: null });

    invoke.mockRejectedValueOnce('No new question yet. Wait for the interviewer, or type a question.');
    await useCopilot.getState().ask(null);
    expect(useCopilot.getState().notice).toBe('Waiting for the interviewer’s next question.');
  });

  it('never shows raw validation errors', () => {
    expect(friendlyError('Expected string, received null')).toBe('Something went wrong writing this answer. Retry.');
    expect(friendlyError("You've used this month's 150 AI credits.")).toContain('150 AI credits');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PracticeItem } from '../../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }));

const { PracticePage } = await import('./PracticePage');

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

const item = (over: Partial<PracticeItem> = {}): PracticeItem => ({
  id: 'i1',
  sessionId: 's1',
  position: 0,
  question: 'Tell me about a database migration you led.',
  category: 'experience',
  focus: 'Scope, your role, the result',
  answer: null,
  feedback: null,
  score: null,
  ...over,
});

/** Routes mocked Rust commands by name. */
function commands(map: Record<string, (args?: unknown) => unknown>) {
  invoke.mockImplementation((cmd: string, args?: unknown) => {
    const handler = map[cmd];
    return handler ? Promise.resolve(handler(args)) : Promise.reject(`unexpected command ${cmd}`);
  });
}

describe('PracticePage', () => {
  it('asks for a job before practice can start', async () => {
    commands({ list_practice: () => [], list_jobs: () => [] });
    render(<PracticePage />);
    expect(await screen.findByText("Add the job you're preparing for first.")).toBeTruthy();
  });

  it('opens a session, saves a typed answer, then shows feedback', async () => {
    let current = item();
    commands({
      list_practice: () => [
        {
          id: 's1', jobId: 'j1', title: 'Backend Engineer at Acme', focus: 'mixed', difficulty: 'medium',
          createdAtMs: 0, itemCount: 1, answeredCount: 0, averageScore: null,
        },
      ],
      list_jobs: () => [{ id: 'j1', title: 'Backend Engineer', company: 'Acme', description: '', updatedAtMs: 0 }],
      get_practice: () => [current],
      save_practice_answer: (args) => (current = item({ answer: (args as { answer: string }).answer })),
      practice_feedback: () =>
        (current = item({
          answer: current.answer,
          score: 7,
          feedback: {
            score: 7,
            summary: 'Clear, but add the outcome.',
            strengths: ['Good structure'],
            improvements: ['Quantify the result'],
            modelAnswer: 'At Acme I migrated billing to Postgres…',
            talkingPoints: ['Planning', 'Rollback plan'],
            evidenceUsed: ['Backend Engineer at Acme: migrated billing to Postgres'],
            followUpQuestion: 'How did you handle downtime?',
          },
        })),
    });

    render(<PracticePage />);
    fireEvent.click(await screen.findByRole('button', { name: /Backend Engineer at Acme/ }));
    expect(await screen.findByText('Tell me about a database migration you led.')).toBeTruthy();

    // Feedback needs a saved answer.
    const feedbackButton = screen.getByRole('button', { name: /Get feedback/ });
    expect((feedbackButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'I moved billing to Postgres.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('save_practice_answer', { itemId: 'i1', answer: 'I moved billing to Postgres.' })
    );

    fireEvent.click(await screen.findByRole('button', { name: /Get feedback/ }));
    const card = await screen.findByTestId('feedback');
    expect(card.textContent).toContain('Clear, but add the outcome.');
    expect(card.textContent).toContain('Quantify the result');
    expect(card.textContent).toContain('Backend Engineer at Acme: migrated billing to Postgres');
    expect(card.textContent).toContain('How did you handle downtime?');
  });

  it('shows the server error when feedback fails (e.g. out of credits)', async () => {
    commands({
      list_practice: () => [
        { id: 's1', jobId: null, title: 'Dev', focus: 'mixed', difficulty: 'easy', createdAtMs: 0, itemCount: 1, answeredCount: 1, averageScore: null },
      ],
      list_jobs: () => [],
      get_practice: () => [item({ answer: 'My answer' })],
    });
    invoke.mockImplementation((cmd: string) => {
      if (cmd === 'practice_feedback') return Promise.reject("You've used all 50 AI credits for this month.");
      if (cmd === 'list_practice')
        return Promise.resolve([{ id: 's1', jobId: null, title: 'Dev', focus: 'mixed', difficulty: 'easy', createdAtMs: 0, itemCount: 1, answeredCount: 1, averageScore: null }]);
      if (cmd === 'list_jobs') return Promise.resolve([]);
      if (cmd === 'get_practice') return Promise.resolve([item({ answer: 'My answer' })]);
      return Promise.reject(`unexpected ${cmd}`);
    });

    render(<PracticePage />);
    fireEvent.click(await screen.findByText('Dev'));
    fireEvent.click(await screen.findByRole('button', { name: /Get feedback/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('used all 50 AI credits');
  });
});

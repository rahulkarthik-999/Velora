import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));

const { LiveAnswerInput, LiveAnswerOutput, TranscribeInput, liveAnswerPrompt } = await import('@/lib/live');

describe('live answer', () => {
  it('needs a question and caps knowledge passages', () => {
    expect(LiveAnswerInput.safeParse({ question: '  ' }).success).toBe(false);
    expect(LiveAnswerInput.safeParse({ question: 'What is Rust?', knowledge: Array(11).fill('x') }).success).toBe(false);
    expect(LiveAnswerInput.parse({ question: 'What is Rust?' })).toMatchObject({ answerStyle: 'concise', knowledge: [] });
  });

  it('wraps knowledge, question and preferences as data', () => {
    const p = liveAnswerPrompt(
      LiveAnswerInput.parse({
        question: 'Tell me about a migration you led.',
        knowledge: ['Backend Engineer at Acme: Migrated billing to Postgres'],
        customInstructions: 'Keep it short.',
        jobTitle: 'Backend Engineer',
      })
    );
    expect(p.user).toContain('<data label="knowledge passages">');
    expect(p.user).toContain('1. Backend Engineer at Acme: Migrated billing to Postgres');
    expect(p.user).toContain('<data label="interviewer\'s latest question">');
    expect(p.user).toContain('<data label="preferences">');
    expect(p.system).toContain('Never invent employers');
  });

  it('says so when no knowledge matched', () => {
    const p = liveAnswerPrompt(LiveAnswerInput.parse({ question: 'What is a closure?' }));
    expect(p.user).toContain('No knowledge passages matched');
  });

  it('validates model output', () => {
    const good = { question: 'Q', answer: 'A', keyPoints: ['k'], sources: [], followUps: ['f'] };
    expect(LiveAnswerOutput.safeParse(good).success).toBe(true);
    expect(LiveAnswerOutput.safeParse({ ...good, followUps: ['a', 'b', 'c', 'd'] }).success).toBe(false);
  });
});

describe('transcribe input', () => {
  it('rejects tiny or oversized clips', () => {
    expect(TranscribeInput.safeParse({ audio: 'abc' }).success).toBe(false);
    expect(TranscribeInput.safeParse({ audio: 'A'.repeat(2_000_000) }).success).toBe(false);
    expect(TranscribeInput.safeParse({ audio: 'A'.repeat(1_000), language: 'en' }).success).toBe(true);
  });
});

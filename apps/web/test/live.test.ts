import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));

const { LiveAnswerInput, LiveAnswerOutput, TranscribeInput, liveAnswerPrompt, withSourceText } = await import('@/lib/live');

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

describe('null optional context (regression: "Expected string, received null")', () => {
  it('accepts null for every optional field and treats it as missing', () => {
    const parsed = LiveAnswerInput.safeParse({
      question: 'How would you optimize a React application that takes too long to load?',
      conversation: null,
      jobTitle: null,
      company: null,
      jobDescription: null,
      customInstructions: null,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.jobTitle).toBeUndefined();
    expect(parsed.data.conversation).toBeUndefined();
    const p = liveAnswerPrompt(parsed.data);
    expect(p.user).not.toContain('null');
    expect(p.user).toContain('No knowledge passages matched');
  });

  it('still rejects a missing question with a clear message', () => {
    const r = LiveAnswerInput.safeParse({ question: null });
    expect(r.success).toBe(false);
  });

  it('asks for STAR on behavioural questions and plain spoken answers', () => {
    const p = liveAnswerPrompt(LiveAnswerInput.parse({ question: 'Tell me about a challenging project you worked on.' }));
    expect(p.system).toContain('STAR');
    expect(p.system).toContain('never claim a project');
  });
});

describe('live answer sources', () => {
  const knowledge = ['Led the payments rewrite at Acme.', 'Five years of TypeScript.'];

  it('turns passage numbers back into the passages, ignoring bad and repeated refs', () => {
    const out = withSourceText({ answer: 'a', sources: [2, '1', 2, 9, 0, 'made up'] }, knowledge) as { sources: string[] };
    expect(out.sources).toEqual(['Five years of TypeScript.', 'Led the payments rewrite at Acme.']);
  });

  it('keeps a passage the model copied out, if it is a real one', () => {
    const out = withSourceText({ sources: ['Five years of TypeScript.'] }, knowledge) as { sources: string[] };
    expect(out.sources).toEqual(['Five years of TypeScript.']);
  });

  it('asks the model for numbers and validates the mapped result', () => {
    const p = liveAnswerPrompt(LiveAnswerInput.parse({ question: 'Tell me about payments', knowledge }));
    expect(p.schema).toContain('"sources":[number]');
    const raw = { question: 'Q', answer: 'A', keyPoints: [], sources: [1], followUps: [] };
    expect(LiveAnswerOutput.parse(p.prepare!(raw)).sources).toEqual([knowledge[0]]);
  });
});

import { describe, expect, it, vi } from 'vitest';

// Real OpenAI calls with the production live-answer prompt. Skipped unless LIVE_SMOKE=1
// (and AI_API_KEY is set), so normal test runs stay offline and free.
vi.mock('@/lib/db', () => ({ default: {} }));
const { LiveAnswerInput, LiveAnswerOutput, liveAnswerPrompt } = await import('@/lib/live');

const QUESTIONS = [
  'How would you optimize a React application that takes too long to load?',
  'What is the difference between useMemo and useCallback?',
  'Explain the React component lifecycle.',
  'How do you handle API failures in a production application?',
  'Tell me about a challenging project you worked on.',
];

const run = process.env.LIVE_SMOKE === '1' && process.env.AI_API_KEY ? describe : describe.skip;

run('live answers from OpenAI with no resume or job context', () => {
  it.each(QUESTIONS.map((q, i) => [i + 1, q] as const))('question %i gets a valid answer', async (n, question) => {
    // Exactly what an older desktop build sends when nothing optional is set.
    const input = LiveAnswerInput.parse({ question, conversation: null, jobTitle: null, company: null, jobDescription: null, customInstructions: null });
    const prompt = liveAnswerPrompt(input);
    const t0 = Date.now();
    const res = await fetch(`${process.env.AI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: prompt.temperature,
        max_tokens: prompt.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${prompt.system}\nRespond only with JSON matching: ${prompt.schema}` },
          { role: 'user', content: prompt.user },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const out = LiveAnswerOutput.parse(JSON.parse(body.choices[0].message.content));
    expect(out.answer.length).toBeGreaterThan(80);
    console.log(`\nQ${n} (${Date.now() - t0} ms): ${out.question}\nA${n}: ${out.answer}\n`);
  }, 60_000);
});

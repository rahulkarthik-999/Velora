import { create } from 'zustand';
import { ipc } from '../lib/ipc';
import type { AnswerEvent, SavedAnswer } from '../types';

/** Wait this long after the interviewer's last sentence before auto-answering. */
export const AUTO_ANSWER_DELAY_MS = 1_400;

const QUESTION_START =
  /^(what|why|how|when|where|who|which|can|could|would|will|do|does|did|is|are|have|has|tell|walk|describe|explain|give|share|talk|imagine|suppose)\b/i;

/** Whether a transcript line sounds like the interviewer asking something. */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  if (t.includes('?')) return true;
  return t.split(/(?<=[.!])\s+/).some((sentence) => QUESTION_START.test(sentence.trim()));
}

interface CopilotStore {
  sessionId: string | null;
  answers: SavedAnswer[];
  /** Index into `answers` being shown; -1 follows the newest. */
  viewing: number;
  pending: { requestId: string; question: string } | null;
  error: string | null;
  creditsRemaining: number | null;

  attach: (sessionId: string | null) => Promise<void>;
  handle: (event: AnswerEvent) => void;
  ask: (question: string | null) => Promise<void>;
  view: (index: number) => void;
  clear: () => void;
  dismissError: () => void;
}

export const useCopilot = create<CopilotStore>((set, get) => ({
  sessionId: null,
  answers: [],
  viewing: -1,
  pending: null,
  error: null,
  creditsRemaining: null,

  attach: async (sessionId) => {
    if (sessionId === get().sessionId) return;
    set({ sessionId, answers: [], viewing: -1, error: null });
    if (!sessionId) return;
    try {
      const saved = await ipc.getLiveAnswers(sessionId);
      if (get().sessionId !== sessionId) return;
      // Merge: answers may have arrived while loading.
      set((s) => ({ answers: [...saved, ...s.answers.filter((a) => !saved.some((x) => x.id === a.id))] }));
    } catch {
      // History is a convenience; new answers still arrive.
    }
  },

  handle: (event) => {
    switch (event.status) {
      case 'pending':
        set({ pending: { requestId: event.requestId, question: event.question }, error: null });
        return;
      case 'done':
        set((s) => ({
          pending: s.pending?.requestId === event.requestId ? null : s.pending,
          answers: s.answers.some((a) => a.id === event.answer.id) ? s.answers : [...s.answers, event.answer],
          viewing: -1,
          creditsRemaining: event.creditsRemaining ?? s.creditsRemaining,
        }));
        return;
      case 'failed':
        set((s) => ({ pending: s.pending?.requestId === event.requestId ? null : s.pending, error: event.message }));
        return;
    }
  },

  // The answer itself arrives as an event (in every window); only errors before that need handling here.
  ask: async (question) => {
    try {
      await ipc.liveAnswer(question);
    } catch (e) {
      const message = (e as Error).message;
      if (message !== 'Already writing an answer.') set({ error: message, pending: null });
    }
  },

  view: (index) => set((s) => ({ viewing: index >= s.answers.length - 1 ? -1 : Math.max(0, index) })),
  clear: () => set({ answers: [], viewing: -1, error: null }),
  dismissError: () => set({ error: null }),
}));

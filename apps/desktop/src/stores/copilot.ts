import { create } from 'zustand';
import { ipc } from '../lib/ipc';
import type { AnswerEvent, SavedAnswer } from '../types';

/**
 * Wait this long after the interviewer's last transcript line before auto-answering. The
 * line itself arrives only after 650 ms of silence plus transcription, so this is extra
 * time on top of a pause already heard: kept short, and shorter still when the line ends
 * as a finished question.
 */
export const AUTO_ANSWER_DELAY_MS = 50;
export const AUTO_ANSWER_QUESTION_DELAY_MS = 0;

/** How long to wait before answering, given the interviewer's latest line. */
export function autoAnswerDelay(lastLine: string): number {
  return /\?\s*$/.test(lastLine) ? AUTO_ANSWER_QUESTION_DELAY_MS : AUTO_ANSWER_DELAY_MS;
}

const QUESTION_START =
  /^(what|why|how|when|where|who|which|can|could|would|will|do|does|did|is|are|have|has|tell|walk|describe|explain|give|share|talk|imagine|suppose)\b/i;

/** Whether a transcript line sounds like the interviewer asking something. */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  if (t.includes('?')) return true;
  return t.split(/(?<=[.!])\s+/).some((sentence) => QUESTION_START.test(sentence.trim()));
}

export type CardStatus = 'generating' | 'answered' | 'failed';

/** One interviewer question and the answer written for it. */
export interface QaCard {
  id: string;
  question: string;
  /** Session time the question started, when it came from the transcript. */
  askedAtMs: number | null;
  status: CardStatus;
  answer: SavedAnswer | null;
  /** Short, user-facing reason when generation failed. */
  error: string | null;
  createdAt: number;
}

/** The server's message, without technical noise; never a raw validation error. */
export function friendlyError(message: string): string {
  if (/credits|minutes|plan|payment|renew/i.test(message)) return message;
  if (/sign in|session has ended|connect your/i.test(message)) return 'Sign in to Velora to get answers.';
  if (/can't reach|network|timed out|internet/i.test(message)) return "Couldn't reach Velora. Check your connection and retry.";
  if (/unavailable|unexpected answer|try again/i.test(message)) return 'The AI service had a problem with this answer. Retry in a moment.';
  return 'Something went wrong writing this answer. Retry.';
}

interface CopilotStore {
  sessionId: string | null;
  cards: QaCard[];
  /** Interviewer speech up to here (session ms) belongs to a card already. */
  heardUntilMs: number;
  /** A problem not tied to one question, e.g. "no new question yet". Dismissible. */
  notice: string | null;
  collapsed: Record<string, boolean>;
  creditsRemaining: number | null;

  attach: (sessionId: string | null) => Promise<void>;
  handle: (event: AnswerEvent) => void;
  /** Ask a typed question, or (null) whatever the interviewer said since the last card. */
  ask: (question: string | null) => Promise<void>;
  retry: (card: QaCard) => Promise<void>;
  toggle: (id: string) => void;
  clear: () => void;
  dismissNotice: () => void;
  /** Take a screenshot of the screen, analyze the question, and answer. */
  askScreen: () => Promise<void>;
}

const fromSaved = (a: SavedAnswer): QaCard => ({
  id: a.id,
  question: a.answer?.question || a.question,
  askedAtMs: null,
  status: 'answered',
  answer: a,
  error: null,
  createdAt: a.createdAtMs,
});

function upsert(cards: QaCard[], id: string, patch: Partial<QaCard>, base: () => QaCard): QaCard[] {
  const i = cards.findIndex((c) => c.id === id);
  if (i === -1) return [...cards, { ...base(), ...patch }];
  const next = cards.slice();
  next[i] = { ...next[i], ...patch };
  return next;
}

export const useCopilot = create<CopilotStore>((set, get) => ({
  sessionId: null,
  cards: [],
  heardUntilMs: -1,
  notice: null,
  collapsed: {},
  creditsRemaining: null,

  attach: async (sessionId) => {
    if (sessionId === get().sessionId) return;
    set({ sessionId, cards: [], heardUntilMs: -1, notice: null, collapsed: {} });
    if (!sessionId) return;
    try {
      const saved = await ipc.getLiveAnswers(sessionId);
      if (get().sessionId !== sessionId) return;
      // Merge: live cards may have arrived while loading.
      set((s) => ({ cards: [...saved.filter((a) => !s.cards.some((c) => c.answer?.id === a.id)).map(fromSaved), ...s.cards] }));
    } catch {
      // History is a convenience; new questions still arrive.
    }
  },

  handle: (event) => {
    switch (event.status) {
      case 'pending':
        set((s) => ({
          heardUntilMs: Math.max(s.heardUntilMs, event.heardUntilMs ?? -1),
          notice: null,
          cards: upsert(s.cards, event.requestId, { status: 'generating', error: null, question: event.question }, () => ({
            id: event.requestId,
            question: event.question,
            askedAtMs: event.askedAtMs ?? null,
            status: 'generating',
            answer: null,
            error: null,
            createdAt: Date.now(),
          })),
        }));
        return;
      case 'done':
        set((s) => ({
          creditsRemaining: event.creditsRemaining ?? s.creditsRemaining,
          cards: upsert(
            s.cards,
            event.requestId,
            { status: 'answered', answer: event.answer, error: null, question: event.answer.answer?.question || event.answer.question },
            () => fromSaved(event.answer)
          ),
        }));
        return;
      case 'failed':
        set((s) => ({
          cards: upsert(s.cards, event.requestId, { status: 'failed', error: friendlyError(event.message) }, () => ({
            id: event.requestId,
            question: event.question,
            askedAtMs: null,
            status: 'failed',
            answer: null,
            error: friendlyError(event.message),
            createdAt: Date.now(),
          })),
        }));
        return;
    }
  },

  ask: async (question) => {
    try {
      await ipc.liveAnswer(question, null);
    } catch (e) {
      const message = (e as Error).message;
      // Card-level failures arrive as events; only problems before a card exists show here.
      if (/No new question/i.test(message)) {
        if (question === null) set({ notice: 'Waiting for the interviewer’s next question.' });
      } else if (!get().cards.some((c) => c.status === 'failed' && c.question === question)) {
        set({ notice: friendlyError(message) });
      }
    }
  },

  // Retry and regenerate reuse the card's id, so the new answer replaces the old one in place.
  retry: async (card) => {
    set((s) => ({ cards: upsert(s.cards, card.id, { status: 'generating', error: null }, () => card) }));
    try {
      await ipc.liveAnswer(card.question, card.id);
    } catch {
      // The failure arrives as an event on this card.
    }
  },

  toggle: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
  clear: () => set({ cards: [], notice: null, collapsed: {} }),
  dismissNotice: () => set({ notice: null }),
  askScreen: async () => {
    try {
      await ipc.liveScreenAnswer();
    } catch (e) {
      const message = (e as Error).message;
      if (!get().cards.some((c) => c.status === 'failed')) {
        set({ notice: friendlyError(message) });
      }
    }
  },
}));

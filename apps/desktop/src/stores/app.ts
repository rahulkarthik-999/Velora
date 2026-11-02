import { create } from 'zustand';
import { ipc } from '../lib/ipc';
import type { SessionMode, SessionSnapshot, Settings } from '../types';

export type Page =
  | 'overview'
  | 'live'
  | 'sessions'
  | 'resume'
  | 'job'
  | 'settings'
  | 'usage'
  | 'account';

interface AppStore {
  page: Page;
  settings: Settings | null;
  session: SessionSnapshot | null;
  /** Local clock time when `session` was received, for a smooth timer. */
  sessionReceivedAt: number;
  pending: boolean;
  error: string | null;

  setPage: (page: Page) => void;
  setSettings: (settings: Settings) => void;
  setSession: (session: SessionSnapshot) => void;
  clearError: () => void;
  load: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<boolean>;
  start: (mode: SessionMode) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  end: () => Promise<void>;
}

export const useApp = create<AppStore>((set, get) => {
  /** Runs a session command; the snapshot comes back from Rust, never assumed. */
  const run = async (fn: () => Promise<SessionSnapshot>) => {
    if (get().pending) return;
    set({ pending: true, error: null });
    try {
      get().setSession(await fn());
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ pending: false });
    }
  };

  return {
    page: 'overview',
    settings: null,
    session: null,
    sessionReceivedAt: 0,
    pending: false,
    error: null,

    setPage: (page) => set({ page }),
    setSettings: (settings) => set({ settings }),
    setSession: (session) => set({ session, sessionReceivedAt: Date.now() }),
    clearError: () => set({ error: null }),

    load: async () => {
      try {
        const [settings, session] = await Promise.all([ipc.getSettings(), ipc.getSession()]);
        set({ settings });
        get().setSession(session);
      } catch (e) {
        set({ error: (e as Error).message });
      }
    },

    saveSettings: async (settings) => {
      set({ error: null });
      try {
        set({ settings: await ipc.updateSettings(settings) });
        return true;
      } catch (e) {
        set({ error: (e as Error).message });
        return false;
      }
    },

    start: (mode) => run(() => ipc.startSession(mode)),
    pause: () => run(ipc.pauseSession),
    resume: () => run(ipc.resumeSession),
    end: () => run(ipc.endSession),
  };
});

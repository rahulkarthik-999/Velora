import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionSnapshot } from '../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { useApp } = await import('./app');

const snapshot = (status: SessionSnapshot['status']): SessionSnapshot => ({
  id: 'abc',
  mode: 'live',
  status,
  startedAtMs: 1,
  endedAtMs: null,
  activeMs: 0,
  capture: { microphone: 'unavailable', systemAudio: 'unavailable', screen: 'unavailable' },
});

beforeEach(() => {
  invoke.mockReset();
  useApp.setState({ session: null, error: null, pending: false });
});

describe('session actions', () => {
  it('uses the state returned by Rust, not an assumed one', async () => {
    invoke.mockResolvedValueOnce(snapshot('active'));
    await useApp.getState().start('live');
    expect(invoke).toHaveBeenCalledWith('start_session', { mode: 'live' });
    expect(useApp.getState().session?.status).toBe('active');
  });

  it('keeps the previous state and shows the error when Rust rejects', async () => {
    useApp.getState().setSession(snapshot('active'));
    invoke.mockRejectedValueOnce('Cannot resume while the session is active');
    await useApp.getState().resume();
    expect(useApp.getState().session?.status).toBe('active');
    expect(useApp.getState().error).toBe('Cannot resume while the session is active');
  });

  it('does not report the session ended until Rust confirms it', async () => {
    useApp.getState().setSession(snapshot('active'));
    let confirm!: (s: SessionSnapshot) => void;
    invoke.mockReturnValueOnce(new Promise((r) => (confirm = r)));
    const ending = useApp.getState().end();
    expect(useApp.getState().session?.status).toBe('active');
    expect(useApp.getState().pending).toBe(true);
    confirm(snapshot('ended'));
    await ending;
    expect(useApp.getState().session?.status).toBe('ended');
    expect(useApp.getState().pending).toBe(false);
  });

  it('ignores a second command while one is in flight', async () => {
    invoke.mockReturnValue(new Promise(() => {}));
    useApp.getState().pause();
    useApp.getState().pause();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe('saveSettings', () => {
  it('reports validation errors from Rust and returns false', async () => {
    invoke.mockRejectedValueOnce('Shortcut \'x\' for endSession is not a valid key combination');
    const ok = await useApp.getState().saveSettings({} as never);
    expect(ok).toBe(false);
    expect(useApp.getState().error).toMatch(/not a valid key combination/);
  });
});

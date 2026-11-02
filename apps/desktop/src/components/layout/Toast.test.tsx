import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const { useApp } = await import('../../stores/app');
const { Toast } = await import('./Toast');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useApp.setState({ notice: null });
});

describe('Toast', () => {
  it('shows a notice and hides it after a few seconds', () => {
    vi.useFakeTimers();
    render(<Toast />);
    act(() => useApp.getState().showNotice('No session is running. Start one from the Live Copilot page.'));
    expect(screen.getByRole('status').textContent).toContain('No session is running');
    act(() => vi.advanceTimersByTime(5_100));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a new notice restarts the timer', () => {
    vi.useFakeTimers();
    render(<Toast />);
    act(() => useApp.getState().showNotice('first'));
    act(() => vi.advanceTimersByTime(4_000));
    act(() => useApp.getState().showNotice('second'));
    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.getByRole('status').textContent).toContain('second');
  });
});

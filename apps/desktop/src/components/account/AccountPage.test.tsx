import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

const { AccountPage, UsagePage } = await import('./AccountPage');

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

describe('AccountPage', () => {
  it('starts the device sign-in and shows the code to approve', async () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === 'account_status'
        ? Promise.resolve({ signedIn: false })
        : Promise.resolve({ userCode: 'KQ7M-X3PD', verificationUrl: 'https://veloraweb.online/desktop/link?code=KQ7M-X3PD', interval: 3, expiresIn: 600 })
    );
    render(<AccountPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Continue with Google/ }));
    expect((await screen.findByTestId('user-code')).textContent).toBe('KQ7M-X3PD');
    expect(invoke).toHaveBeenCalledWith('account_start_link', undefined);
  });

  it('signs in with email and password', async () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === 'account_status' ? Promise.resolve({ signedIn: false }) : Promise.reject("That email and password don't match an account.")
    );
    render(<AccountPage />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' }).at(-1)!);
    expect((await screen.findByRole('alert')).textContent).toContain("don't match");
    expect(invoke).toHaveBeenCalledWith('account_login', { email: 'me@example.com', password: 'secret123' });
  });

  it('needs a name and accepted terms to create an account', async () => {
    invoke.mockResolvedValue({ signedIn: false });
    render(<AccountPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Create account' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Me' } });
    const submit = screen.getAllByRole('button', { name: 'Create account' }).at(-1) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit.disabled).toBe(false);
  });

  it('shows who is signed in', async () => {
    invoke.mockResolvedValue({
      signedIn: true,
      user: { name: 'Rahul', email: 'r@example.com' },
      device: { id: 'd1', name: 'Velora on LAPTOP' },
    });
    render(<AccountPage />);
    expect(await screen.findByText('Rahul')).toBeTruthy();
    expect(screen.getByText(/Velora on LAPTOP/)).toBeTruthy();
  });

  it('offers a retry when the server is unreachable', async () => {
    invoke.mockRejectedValue("Can't reach Velora at https://veloraweb.online. Check your internet connection.");
    render(<AccountPage />);
    expect((await screen.findByRole('alert')).textContent).toContain("Can't reach Velora");
  });
});

describe('UsagePage', () => {
  it('shows remaining credits from the account', async () => {
    invoke.mockResolvedValue({
      signedIn: true,
      usage: { tier: 'FREE', monthlyAICredits: 50, creditsUsed: 12, creditsRemaining: 38, periodStart: '' },
    });
    render(<UsagePage />);
    expect(await screen.findByText('38')).toBeTruthy();
    expect(screen.getByText(/of 50 credits left/)).toBeTruthy();
  });
});

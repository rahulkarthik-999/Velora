import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LogOut } from 'lucide-react';
import { ipc, onAccountChanged } from '../../lib/ipc';
import type { AccountStatus } from '../../types';
import { AuthForm } from './AuthForm';

export function useAccount() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    setError(null);
    return ipc.accountStatus().then(setStatus, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    refresh();
    const unlisten = onAccountChanged(() => refresh());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);
  return { status, error, refresh };
}

export function AccountPage() {
  const { status, error, refresh } = useAccount();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    if (!window.confirm('Sign this PC out of your Velora account?')) return;
    setBusy(true);
    try {
      await ipc.accountSignOut();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="muted mt-1">
          Live answers, cloud transcription and practice feedback use AI through your Velora account. Your resume,
          knowledge base, jobs, transcripts and answers are stored only on this PC. Your account holds your name, email,
          plan and credit usage.
        </p>
      </header>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}{' '}
          <button className="underline" onClick={refresh}>
            Try again
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-amber-500">
          {notice}
        </p>
      )}

      {!status && !error ? (
        <p className="muted">Checking your account…</p>
      ) : status?.signedIn ? (
        <div className="card flex items-center gap-4 p-5">
          <CheckCircle2 size={22} className="text-emerald-500" />
          <div className="flex-1">
            <div className="font-medium">{status.user?.name || status.user?.email}</div>
            <div className="muted text-sm">
              {status.user?.email} · {status.device?.name}
            </div>
          </div>
          <button className="btn" onClick={signOut} disabled={busy}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      ) : (
        <div className="card max-w-md p-6">
          <AuthForm />
        </div>
      )}
    </div>
  );
}

export function UsagePage() {
  const { status, error, refresh } = useAccount();
  const usage = status?.usage;
  const pct = usage ? Math.min(100, (usage.creditsUsed / Math.max(1, usage.monthlyAICredits)) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Usage</h1>
        <p className="muted mt-1">
          Each live answer, practice question set, feedback request or resume extraction uses 1 AI credit. Transcription
          does not use credits.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}{' '}
          <button className="underline" onClick={refresh}>
            Try again
          </button>
        </p>
      )}
      {!status && !error && <p className="muted">Loading…</p>}
      {status && !status.signedIn && <p className="muted">Connect your account on the Account page to see usage.</p>}
      {usage && (
        <div className="card flex flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">{usage.tier} plan</span>
            <span className="text-sm">
              <span className="font-semibold">{usage.creditsRemaining}</span>
              <span className="muted"> of {usage.monthlyAICredits} credits left this month</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-[var(--surface-2)]" aria-hidden>
            <div className="h-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
          </div>
          <p className="muted text-xs">Resets on the 1st of each month. Manage your plan at veloraweb.online.</p>
        </div>
      )}
    </div>
  );
}

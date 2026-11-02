import { useCallback, useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { CheckCircle2, ExternalLink, Loader2, LogOut, User } from 'lucide-react';
import { ipc, onAccountChanged } from '../../lib/ipc';
import type { AccountStatus, LinkStart } from '../../types';

const EVENT_TEXT = {
  denied: 'Sign-in was denied on the website.',
  expired: 'The code expired. Start again.',
  failed: 'Signed in, but the sign-in could not be saved on this PC.',
} as const;

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
  const [link, setLink] = useState<LinkStart | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unlisten = onAccountChanged((e) => {
      setLink(null);
      if (e.status !== 'signedIn' && e.status !== 'signedOut') setNotice(EVENT_TEXT[e.status]);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const connect = async () => {
    setBusy(true);
    setNotice(null);
    try {
      setLink(await ipc.accountStartLink());
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    await ipc.accountCancelLink();
    setLink(null);
  };

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
          Practice questions and feedback use AI through your Velora account. Your resume, transcripts and audio stay on
          this PC; only the question, your answer and a few relevant resume facts are sent when you ask for feedback.
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
      ) : link ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm">Approve this code in the browser window that just opened:</p>
          <div className="font-mono text-3xl font-semibold tracking-[0.3em]" data-testid="user-code">
            {link.userCode}
          </div>
          <p className="muted flex items-center gap-2 text-sm">
            <Loader2 size={14} className="animate-spin" /> Waiting for approval…
          </p>
          <div className="flex gap-2">
            <button className="btn" onClick={() => openUrl(link.verificationUrl)}>
              <ExternalLink size={14} /> Open the page again
            </button>
            <button className="btn" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="card flex items-center gap-4 p-5">
          <User size={22} className="text-accent" />
          <div className="flex-1">
            <div className="font-medium">Not connected</div>
            <div className="muted text-sm">Connect to generate practice questions and get feedback on your answers.</div>
          </div>
          <button className="btn btn-primary" onClick={connect} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null} Connect account
          </button>
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
          Each practice question set, feedback request or resume extraction uses 1 AI credit. Transcription runs on this PC
          and is free.
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

'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { CheckCircle2, Loader2, Monitor, XCircle } from 'lucide-react';

type Outcome = { status: 'approved' | 'denied'; deviceName: string } | null;

function LinkDevice() {
  const { status } = useSession();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const respond = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/desktop/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCode: code, approve }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setOutcome(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') {
    return <Loader2 className="w-5 h-5 animate-spin text-velora-violet" />;
  }

  if (status !== 'authenticated') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-velora-text-muted">Sign in to connect the Velora desktop app to your account.</p>
        <button
          className="btn-primary"
          onClick={() => signIn('google', { callbackUrl: `/desktop/link?code=${encodeURIComponent(code)}` })}
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  if (outcome) {
    return outcome.status === 'approved' ? (
      <div className="space-y-2 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
        <p className="font-semibold text-velora-text">{outcome.deviceName} is connected</p>
        <p className="text-sm text-velora-text-muted">You can close this tab and return to the app.</p>
      </div>
    ) : (
      <div className="space-y-2 text-center">
        <XCircle className="w-8 h-8 text-velora-text-muted mx-auto" />
        <p className="font-semibold text-velora-text">Sign-in denied</p>
        <p className="text-sm text-velora-text-muted">The desktop app was not connected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-velora-text-muted">
        Check this code matches the one shown in the Velora app. Only approve if you started this sign-in yourself.
      </p>
      <input
        className="w-full text-center text-2xl font-mono tracking-[0.3em] p-3 rounded-lg bg-velora-bg border border-velora-border text-velora-text uppercase"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        maxLength={9}
        aria-label="Code from the desktop app"
        autoFocus
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button className="btn-primary flex-1" disabled={busy || code.length < 8} onClick={() => respond(true)}>
          {busy ? 'Working…' : 'Connect this device'}
        </button>
        <button className="btn-secondary" disabled={busy || code.length < 8} onClick={() => respond(false)}>
          Deny
        </button>
      </div>
    </div>
  );
}

export default function DesktopLinkPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-velora-bg">
      <div className="card w-full max-w-md p-8 space-y-6">
        <div className="flex items-center gap-2 text-velora-text">
          <Monitor className="w-5 h-5 text-velora-violet" />
          <h1 className="text-lg font-bold">Connect the Velora desktop app</h1>
        </div>
        <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin text-velora-violet" />}>
          <LinkDevice />
        </Suspense>
      </div>
    </main>
  );
}

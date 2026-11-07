'use client';

import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Suspense, useState, type FormEvent } from 'react';
import { Logo } from '@/components/brand/Logo';

type Mode = 'signin' | 'signup';

/** Same-site paths only; anything else goes to the dashboard. */
function safePath(raw: string | null): string {
  if (!raw) return '/dashboard';
  try {
    const u = new URL(raw, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : '/dashboard';
  } catch {
    return '/dashboard';
  }
}

// NextAuth's error codes, in words a user can act on.
const AUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: 'This email is already registered. Sign in with your email and password.',
  OAuthSignin: 'Google sign-in could not start. Try again.',
  OAuthCallback: 'Google sign-in did not finish. Try again.',
  AccessDenied: 'Sign-in was cancelled.',
  SessionRequired: 'Sign in to continue.',
  Default: 'Sign-in failed. Try again.',
};

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

const inputClass =
  'w-full rounded-lg bg-velora-surface-subtle border border-velora-border px-3 py-2.5 text-sm text-velora-text placeholder:text-velora-text-muted focus:outline-none focus:border-velora-border-gold focus:ring-1 focus:ring-velora-gold/30';

function SignInContent() {
  const params = useSearchParams();
  const callbackUrl = safePath(params.get('callbackUrl'));
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [google, setGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const code = params.get('error');
    return code ? AUTH_ERRORS[code] ?? AUTH_ERRORS.Default : null;
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const continueWithGoogle = () => {
    setGoogle(true);
    setError(null);
    void signIn('google', { callbackUrl });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = mode === 'signup' ? { name, email, password, acceptTerms, callbackUrl } : { email, password, callbackUrl };
      const res = await fetch(`/api/account/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; redirect?: string };
      if (!res.ok) {
        setError(data.error ?? (res.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : 'Something went wrong. Try again.'));
        setBusy(false);
        return;
      }
      // Full navigation so every part of the app picks up the new session.
      window.location.assign(data.redirect ?? callbackUrl);
    } catch {
      setError('Could not reach Velora. Check your connection and try again.');
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const signup = mode === 'signup';

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center text-center mb-7">
        <Logo size="md" href="/" />
        <h1 className="mt-6 text-xl font-semibold text-velora-text">{signup ? 'Create your Velora account' : 'Sign in to Velora'}</h1>
        <p className="mt-1.5 text-sm text-velora-text-secondary">
          {signup ? 'Your AI career companion on the web and Windows.' : 'Welcome back. Pick up where you left off.'}
        </p>
      </div>

      <div className="card p-6 shadow-2xl shadow-black/40">
        <button
          type="button"
          onClick={continueWithGoogle}
          disabled={google || busy}
          className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg bg-white text-zinc-900 hover:bg-zinc-100 font-medium text-sm py-2.5 transition-colors disabled:opacity-60"
        >
          {google ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
          <span>{google ? 'Opening Google…' : 'Continue with Google'}</span>
        </button>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-velora-text-muted">
          <span className="h-px flex-1 bg-velora-border" />
          or with email
          <span className="h-px flex-1 bg-velora-border" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          {signup && (
            <label className="flex flex-col gap-1.5 text-xs text-velora-text-secondary">
              Name
              <input className={inputClass} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-xs text-velora-text-secondary">
            Email
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-velora-text-secondary">
            Password
            <input
              className={inputClass}
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={200}
            />
            {signup && <span className="text-[11px] text-velora-text-muted">At least 8 characters, with letters and a number.</span>}
          </label>

          {signup && (
            <label className="flex items-start gap-2 text-xs text-velora-text-secondary">
              <input
                type="checkbox"
                className="mt-0.5 accent-[#d4af37]"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              <span>
                I agree to the{' '}
                <Link href="/terms" className="text-velora-gold hover:underline">
                  Terms
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-velora-gold hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-velora-error/30 bg-velora-error/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          )}

          <button type="submit" className="btn-gold w-full py-2.5 mt-1" disabled={busy || google}>
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {signup ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-velora-text-secondary">
        {signup ? 'Already have an account?' : 'New to Velora?'}{' '}
        <button type="button" onClick={() => switchMode(signup ? 'signin' : 'signup')} className="text-velora-gold hover:underline">
          {signup ? 'Sign in' : 'Create an account'}
        </button>
      </p>
      {!signup && (
        <p className="mt-3 text-center text-[11px] text-velora-text-muted">
          By continuing you agree to the{' '}
          <Link href="/terms" className="underline hover:text-velora-text-secondary">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-velora-text-secondary">
            Privacy Policy
          </Link>
          .
        </p>
      )}
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-velora-bg flex flex-col justify-center items-center px-4 py-12 relative">
      <Link
        href="/"
        className="absolute top-6 left-6 inline-flex items-center gap-2 text-sm text-velora-text-secondary hover:text-velora-text transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>
      <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin text-velora-text-muted" />}>
        <SignInContent />
      </Suspense>
    </div>
  );
}

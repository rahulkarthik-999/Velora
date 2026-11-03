import { useEffect, useState, type FormEvent } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import clsx from 'clsx';
import { ExternalLink, Loader2 } from 'lucide-react';
import { ipc, onAccountChanged } from '../../lib/ipc';
import type { LinkStart } from '../../types';

type Mode = 'signIn' | 'signUp';

const LINK_EVENT_TEXT: Record<string, string> = {
  denied: 'Sign-in was denied on the website.',
  expired: 'The code expired. Try again.',
  failed: 'Signed in, but the sign-in could not be saved on this PC.',
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

/** Sign in or create a Velora account: email + password, or Google in the browser. */
export function AuthForm({ initialMode = 'signIn' }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<LinkStart | null>(null);

  useEffect(() => {
    const unlisten = onAccountChanged((e) => {
      setLink(null);
      if (LINK_EVENT_TEXT[e.status]) setError(LINK_EVENT_TEXT[e.status]);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signUp') await ipc.accountRegister(name, email, password, acceptTerms);
      else await ipc.accountLogin(email, password);
      // Success arrives as an account-changed event that refreshes the whole app.
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    try {
      setLink(await ipc.accountStartLink());
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (link) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm">Finish signing in with Google in the browser window that just opened, and check this code matches:</p>
        <div className="font-mono text-3xl font-semibold tracking-[0.3em]" data-testid="user-code">
          {link.userCode}
        </div>
        <p className="muted flex items-center gap-2 text-sm">
          <Loader2 size={14} className="animate-spin" /> Waiting for you to approve…
        </p>
        <div className="flex gap-2">
          <button className="btn" onClick={() => openUrl(link.verificationUrl)}>
            <ExternalLink size={14} /> Open the page again
          </button>
          <button
            className="btn"
            onClick={async () => {
              await ipc.accountCancelLink();
              setLink(null);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const canSubmit = email.trim() && password && (mode === 'signIn' || (name.trim() && acceptTerms));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 rounded-lg bg-[var(--surface-2)] p-1 text-sm" role="tablist">
        {(['signIn', 'signUp'] as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={clsx('rounded-md py-1.5 font-medium', mode === m ? 'bg-[var(--surface)] shadow-sm' : 'muted')}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
          >
            {m === 'signIn' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <button className="btn justify-center" onClick={google} disabled={busy}>
        <GoogleMark /> Continue with Google
      </button>
      <div className="muted flex items-center gap-3 text-xs">
        <span className="h-px flex-1 bg-[var(--border)]" /> or with email <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <form className="flex flex-col gap-3" onSubmit={submit}>
        {mode === 'signUp' && (
          <input
            className="field"
            placeholder="Your name"
            autoComplete="name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
          />
        )}
        <input
          className="field"
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          maxLength={254}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email"
        />
        <input
          className="field"
          type="password"
          placeholder={mode === 'signUp' ? 'Password (8+ characters, with a number)' : 'Password'}
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          value={password}
          maxLength={200}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Password"
        />
        {mode === 'signUp' && (
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--color-accent)]"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
            />
            <span className="muted">
              I agree to the{' '}
              <button type="button" className="underline" onClick={() => openUrl('https://veloraweb.online/terms')}>
                Terms
              </button>{' '}
              and{' '}
              <button type="button" className="underline" onClick={() => openUrl('https://veloraweb.online/privacy')}>
                Privacy Policy
              </button>
              .
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button className="btn btn-primary justify-center" type="submit" disabled={busy || !canSubmit}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {mode === 'signIn' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}

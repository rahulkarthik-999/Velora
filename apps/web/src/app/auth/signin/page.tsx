'use client';

import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { useState } from 'react';

export default function SignInPage() {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = () => {
    setLoading(true);
    signIn('google', { callbackUrl: '/dashboard' });
  };

  return (
    <div className="min-h-screen bg-velora-bg flex flex-col justify-center items-center px-4 sm:px-6 relative">
      <div className="absolute top-8 left-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-velora-text-secondary hover:text-velora-text transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Velora</span>
        </Link>
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-velora-violet to-violet-700 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-velora-violet/25">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-velora-text mb-2">Welcome to Velora</h1>
          <p className="text-sm text-velora-text-secondary">
            Sign in to access your execution workspace, workflows, and deliverables.
          </p>
        </div>

        <div className="card border-velora-border-light/60 p-8 shadow-2xl">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white text-zinc-900 hover:bg-zinc-100 font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-md disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{loading ? 'Connecting with Google...' : 'Continue with Google'}</span>
          </button>

          <p className="mt-6 text-xs text-center text-velora-text-muted leading-relaxed">
            By signing in, you agree to our{' '}
            <Link href="/terms" className="text-velora-violet-light underline hover:text-velora-lavender">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-velora-violet-light underline hover:text-velora-lavender">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

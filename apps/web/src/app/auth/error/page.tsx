'use client';

import Link from 'next/link';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'An authentication error occurred';

  return (
    <div className="max-w-md w-full card border-velora-border text-center p-8">
      <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-red-400">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h1 className="text-xl font-bold text-velora-text mb-2">Authentication Failed</h1>
      <p className="text-sm text-velora-text-secondary mb-6">{error}</p>
      <Link href="/auth/signin" className="btn-primary inline-flex items-center gap-2 text-sm">
        <ArrowLeft className="w-4 h-4" />
        <span>Try again</span>
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-velora-bg flex flex-col justify-center items-center px-4">
      <Suspense fallback={<div className="text-xs text-velora-text-muted">Loading...</div>}>
        <AuthErrorContent />
      </Suspense>
    </div>
  );
}

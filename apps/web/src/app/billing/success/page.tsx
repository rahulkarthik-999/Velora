import Link from 'next/link';

export const metadata = { title: 'Payment received — Velora' };

// Dodo returns here after checkout. The plan itself is switched on by the verified
// payment webhook, usually within a few seconds, not by this page.
export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-velora-bg">
      <div className="card w-full max-w-md p-8 space-y-4 text-center">
        <h1 className="text-xl font-semibold text-velora-text">Thank you</h1>
        <p className="text-sm text-velora-text-muted">
          Your payment is being confirmed. Your plan becomes active in the Velora app within a minute; you can close
          this tab and return to the app.
        </p>
        <Link href="/download" className="btn-secondary inline-block text-sm px-5 py-2">
          Download Velora for Windows
        </Link>
      </div>
    </main>
  );
}

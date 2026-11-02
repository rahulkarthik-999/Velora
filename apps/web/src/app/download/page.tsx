import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Download, EyeOff, Keyboard, Lock, Mic, Monitor } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { getDesktopRelease } from '@/lib/desktop-release';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Download Velora for Windows',
  description:
    'Velora desktop copilot for Windows: local transcription, an always-on-top copilot panel, and your Velora workspace in one app.',
};

const FEATURES = [
  {
    icon: Mic,
    title: 'Local transcription',
    body: 'Microphone and system audio are transcribed on your machine. Raw audio stays in memory and is never uploaded.',
  },
  {
    icon: Monitor,
    title: 'Always-on-top copilot',
    body: 'A compact panel that sits above your other windows, ready when you need it.',
  },
  {
    icon: EyeOff,
    title: 'Private on screen share',
    body: 'Velora windows are excluded from screenshots and screen sharing, so your notes stay yours.',
  },
  {
    icon: Keyboard,
    title: 'Global shortcuts',
    body: 'Show, hide and control the copilot from anywhere with configurable shortcuts.',
  },
];

const REQUIREMENTS = [
  'Windows 10 (version 2004 or later) or Windows 11, 64-bit',
  'CPU with AVX2 support (most processors from 2015 onward)',
  '8 GB RAM or more (lower-memory PCs use a lighter speech model)',
  'About 1 GB free disk space for the app and speech model',
];

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DownloadPage() {
  const release = await getDesktopRelease();

  return (
    <div className="min-h-screen bg-velora-bg text-velora-text">
      <header className="border-b border-velora-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo size="md" href="/" />
          <Link href="/auth/signin" className="text-xs text-velora-text-secondary hover:text-white transition-colors">
            Sign in
          </Link>
        </div>
      </header>

      <main>
        <section className="pt-20 pb-16 px-6 max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-velora-gold-border bg-velora-gold-subtle text-[11px] text-velora-gold-light mb-8 font-mono">
            <Monitor className="w-3.5 h-3.5" />
            <span>Velora for Windows</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-normal tracking-tight text-white leading-tight mb-5">
            Your Velora copilot, on the desktop.
          </h1>
          <p className="text-base text-velora-text-secondary max-w-xl mx-auto mb-10 leading-relaxed">
            Capture conversations with on-device transcription and keep your workspace one shortcut away.
          </p>

          {release ? (
            <div className="flex flex-col items-center gap-3">
              <a
                href="/api/desktop/download"
                className="btn-gold text-sm px-7 py-3 inline-flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download for Windows</span>
              </a>
              <p className="text-xs text-velora-text-muted font-mono">
                {[release.version && `v${release.version}`, '64-bit installer', release.sizeBytes && formatSize(release.sizeBytes)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          ) : (
            <div className="card inline-block px-6 py-4 text-sm text-velora-text-secondary">
              The Windows installer is being prepared. Check back soon, or{' '}
              <Link href="/onboarding" className="text-velora-gold-light hover:underline">
                start with the web app
              </Link>{' '}
              in the meantime.
            </div>
          )}
        </section>

        <section className="max-w-5xl mx-auto px-6 pb-16 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6">
              <Icon className="w-5 h-5 text-velora-gold mb-3" />
              <h2 className="text-sm font-semibold text-white mb-1.5">{title}</h2>
              <p className="text-sm text-velora-text-secondary leading-relaxed">{body}</p>
            </div>
          ))}
        </section>

        <section className="max-w-5xl mx-auto px-6 pb-24 grid gap-4 md:grid-cols-2">
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Get started</h2>
            <ol className="space-y-3 text-sm text-velora-text-secondary list-decimal list-inside">
              <li>Download and run the installer.</li>
              <li>
                If Windows SmartScreen appears, choose <span className="text-white">More info</span>, then{' '}
                <span className="text-white">Run anyway</span>.
              </li>
              <li>Open Velora and choose Sign in. Your browser opens to confirm the device code.</li>
              <li>The first launch downloads the speech model once; after that, transcription works offline.</li>
            </ol>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-white mb-4">System requirements</h2>
            <ul className="space-y-3 text-sm text-velora-text-secondary">
              {REQUIREMENTS.map((req) => (
                <li key={req} className="flex gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-velora-gold shrink-0" />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 pt-5 border-t border-velora-border text-xs text-velora-text-muted flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Read how we handle your data in our{' '}
                <Link href="/privacy" className="hover:text-white underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </p>
          </div>
        </section>

        <section className="border-t border-velora-border py-12 px-6 text-center">
          <p className="text-sm text-velora-text-secondary mb-4">Not on Windows? Velora works in any browser.</p>
          <Link href="/onboarding" className="btn-secondary text-sm px-6 py-2.5 inline-flex items-center gap-2">
            <span>Open the web app</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}

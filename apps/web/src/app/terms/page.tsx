import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-velora-bg text-velora-text py-16 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-10 pb-6 border-b border-velora-border">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-velora-text-secondary hover:text-velora-text">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Velora</span>
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="w-4 h-4 text-velora-violet" />
            <span>Velora Terms of Service</span>
          </div>
        </div>

        <article className="prose prose-invert max-w-none space-y-6 text-sm text-velora-text-secondary leading-relaxed">
          <h1 className="text-2xl font-bold text-velora-text">Terms of Service</h1>
          <p className="text-xs text-velora-text-muted">Effective Date: October 2026</p>

          <h2 className="text-lg font-semibold text-velora-text pt-4">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Velora (veloraweb.online) and its associated applications, you agree to be bound by these Terms of Service.
          </p>

          <h2 className="text-lg font-semibold text-velora-text pt-4">2. Description of Service</h2>
          <p>
            Velora provides an AI-augmented goal-to-workflow execution platform. Velora generates structured plans and assists in producing deliverables.
            The user is solely responsible for reviewing, verifying, and approving any generated materials prior to deployment or consequential real-world action.
          </p>

          <h2 className="text-lg font-semibold text-velora-text pt-4">3. Fair Use & Prohibited Activities</h2>
          <p>
            You agree not to submit malicious code, copyrighted material without authorization, attempts to prompt-inject system security safeguards,
            or content promoting illegal activity.
          </p>

          <h2 className="text-lg font-semibold text-velora-text pt-4">4. Subscriptions & Billing</h2>
          <p>
            Paid tiers (Plus, Pro) are billed monthly. You may cancel at any time. Usage quotas reset at the beginning of each billing cycle.
            Refunds are handled in accordance with our standard billing policy.
          </p>

          <h2 className="text-lg font-semibold text-velora-text pt-4">5. Limitation of Liability</h2>
          <p>
            Velora is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. Velora is not liable for indirect, incidental, or consequential damages
            arising from workflow execution or AI-generated outputs.
          </p>
        </article>
      </div>
    </div>
  );
}

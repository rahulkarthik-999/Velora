import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';

export default function PrivacyPage() {
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
            <span>Velora Privacy Policy</span>
          </div>
        </div>

        <article className="prose prose-invert max-w-none space-y-6 text-sm text-velora-text-secondary leading-relaxed">
          <h1 className="text-2xl font-bold text-velora-text">Privacy Policy</h1>
          <p className="text-xs text-velora-text-muted">Effective Date: October 2026 | Last updated: October 2026</p>

          <h2 className="text-lg font-semibold text-velora-text pt-4">1. Information We Collect</h2>
          <p>
            When you authenticate with Google, we store your email address, full name, and avatar image to maintain your user account.
            When you create tasks or upload files (PDFs, images, documents), we store those artifacts solely to execute your workflows.
          </p>

          <h2 className="text-lg font-semibold text-velora-text pt-4">2. How Information is Used</h2>
          <p>
            Your task goals and attachments are processed by AI models to formulate workflow decompositions and generate execution deliverables.
            We do not sell, rent, or trade your data to third parties. We do not use your proprietary documents to train foundational AI models.
          </p>

          <h2 className="text-lg font-semibold text-velora-text pt-4">3. Data Storage & Security</h2>
          <p>
            Uploaded files and task outputs are stored in protected cloud infrastructure with strict access control. Server-side queries enforce
            multi-tenant isolation using your unique user identifier.
          </p>

          <h2 className="text-lg font-semibold text-velora-text pt-4">4. Account Deletion & Data Retention</h2>
          <p>
            You have the right to request deletion of your account and all associated data at any time via Settings &rarr; Account Deletion.
            Upon confirmation, all tasks, steps, uploaded attachments, and artifacts are permanently removed.
          </p>

          <h2 className="text-lg font-semibold text-velora-text pt-4">5. Contact</h2>
          <p>
            For privacy inquiries or data requests, contact us at <span className="text-velora-violet-light font-mono">support@veloraweb.online</span>.
          </p>
        </article>
      </div>
    </div>
  );
}

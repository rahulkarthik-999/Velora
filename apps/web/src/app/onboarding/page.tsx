'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo, VeloraSymbol } from '@/components/brand/Logo';
import {
  ArrowRight,
  Check,
  Upload,
  FileText,
  Loader2,
  Sparkles,
  ChevronRight,
  Shield,
  Layers,
} from 'lucide-react';
import {
  DELIVERABLE_TEMPLATES,
  DeliverableTemplateKey,
  type DeliverableTemplateDefinition,
} from '@velora/schemas';

const WORK_TYPES = [
  { id: 'agency', label: 'Agency Owner / Lead', desc: 'Managing multi-client digital, creative, or technical accounts' },
  { id: 'consultant', label: 'Strategy Consultant', desc: 'Delivering executive briefs, SOWs, and advisory reports' },
  { id: 'freelancer', label: 'Independent Freelancer', desc: 'Turning client briefs into delivered proposals and scopes' },
  { id: 'inhouse', label: 'In-house Operator', desc: 'Aligning cross-functional deliverables, SOPs, and plans' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedWorkType, setSelectedWorkType] = useState('agency');
  const [selectedTemplate, setSelectedTemplate] = useState<DeliverableTemplateKey>('CLIENT_PROPOSAL');
  const [brief, setBrief] = useState(DELIVERABLE_TEMPLATES.CLIENT_PROPOSAL.sampleBrief);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateDef = DELIVERABLE_TEMPLATES[selectedTemplate];

  const handleStartWorkflow = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: brief.trim(),
          templateKey: selectedTemplate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not formulate workflow');
      }

      const created = await res.json();
      router.push(`/tasks/${created.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-velora-bg text-velora-text flex flex-col justify-between p-6 sm:p-10">
      {/* Top Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between pb-8">
        <Logo size="md" href="/" />
        <Link
          href="/dashboard"
          className="text-xs text-velora-text-secondary hover:text-white transition-colors"
        >
          Skip to workspace &rarr;
        </Link>
      </header>

      {/* Main Stepper Card */}
      <main className="max-w-3xl mx-auto w-full my-auto">
        <div className="card p-6 sm:p-10 border-velora-border-strong bg-velora-surface/90 shadow-2xl relative overflow-hidden">
          {/* Subtle gold accent line on top */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-velora-gold to-transparent opacity-60" />

          {/* Stepper Progress Indicator */}
          <div className="flex items-center gap-2 mb-8 text-[11px] font-mono text-velora-text-muted">
            <span className={step >= 1 ? 'text-velora-gold' : ''}>01 Role</span>
            <span>&bull;</span>
            <span className={step >= 2 ? 'text-velora-gold' : ''}>02 Deliverable Template</span>
            <span>&bull;</span>
            <span className={step >= 3 ? 'text-velora-gold' : ''}>03 Plan &amp; Generate</span>
          </div>

          {/* Step 1: Work Type */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl sm:text-2xl font-medium text-white tracking-tight">
                  How do you deliver client work?
                </h1>
                <p className="text-xs sm:text-sm text-velora-text-secondary mt-1">
                  Velora personalizes the plan structure, review depth, and tone for your delivery model.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {WORK_TYPES.map((wt) => (
                  <button
                    key={wt.id}
                    onClick={() => setSelectedWorkType(wt.id)}
                    className={`p-4 rounded-xl text-left border transition-all ${
                      selectedWorkType === wt.id
                        ? 'border-velora-gold bg-velora-surface-hover shadow-md shadow-velora-gold/5'
                        : 'border-velora-border bg-velora-surface-subtle hover:border-velora-border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-white">{wt.label}</span>
                      {selectedWorkType === wt.id && (
                        <Check className="w-4 h-4 text-velora-gold" />
                      )}
                    </div>
                    <p className="text-xs text-velora-text-muted leading-relaxed">{wt.desc}</p>
                  </button>
                ))}
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setStep(2)}
                  className="btn-gold text-xs px-6 py-2.5 flex items-center gap-1.5"
                >
                  <span>Continue to Templates</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Deliverable Template */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl sm:text-2xl font-medium text-white tracking-tight">
                  Choose your target deliverable
                </h1>
                <p className="text-xs sm:text-sm text-velora-text-secondary mt-1">
                  Each template includes structured input validation, sequential handler pipelines, and QA checks.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                {Object.values(DELIVERABLE_TEMPLATES).map((tpl) => (
                  <button
                    key={tpl.key}
                    onClick={() => {
                      setSelectedTemplate(tpl.key);
                      setBrief(tpl.sampleBrief);
                    }}
                    className={`p-4 rounded-xl text-left border transition-all ${
                      selectedTemplate === tpl.key
                        ? 'border-velora-gold bg-velora-surface-hover shadow-md shadow-velora-gold/5'
                        : 'border-velora-border bg-velora-surface-subtle hover:border-velora-border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-velora-gold uppercase">{tpl.category}</span>
                      {selectedTemplate === tpl.key && (
                        <Check className="w-3.5 h-3.5 text-velora-gold" />
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-1">{tpl.title}</h3>
                    <p className="text-xs text-velora-text-secondary leading-relaxed line-clamp-2">
                      {tpl.description}
                    </p>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-velora-border">
                <button
                  onClick={() => setStep(1)}
                  className="btn-ghost text-xs"
                >
                  &larr; Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="btn-gold text-xs px-6 py-2.5 flex items-center gap-1.5"
                >
                  <span>Customize Brief</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Brief Input & Plan Review */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-velora-gold uppercase tracking-wider">
                    {templateDef.title}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-medium text-white tracking-tight">
                  Describe the brief or paste notes
                </h1>
                <p className="text-xs sm:text-sm text-velora-text-secondary mt-1">
                  Velora generates the workflow plan and produces the required deliverable package.
                </p>
              </div>

              <div className="space-y-3">
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Paste your client notes, requirements, or desired scope..."
                  className="w-full bg-velora-bg border border-velora-border rounded-xl p-4 text-xs sm:text-sm text-white placeholder:text-velora-text-muted focus:outline-none focus:border-velora-gold resize-none min-h-[140px] leading-relaxed"
                  disabled={loading}
                  autoFocus
                />

                {/* Expected Outputs Checklist Preview */}
                <div className="p-3.5 rounded-lg bg-velora-bg/60 border border-velora-border space-y-2">
                  <span className="text-[11px] font-mono text-velora-text-muted uppercase tracking-wider block">
                    Expected Output Deliverables:
                  </span>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {templateDef.expectedDeliverables.map((item, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-velora-text-secondary">
                        <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                        <span className="truncate">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-rose-400 font-mono">Error: {error}</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-velora-border">
                <button
                  onClick={() => setStep(2)}
                  className="btn-ghost text-xs"
                  disabled={loading}
                >
                  &larr; Change Template
                </button>
                <button
                  onClick={handleStartWorkflow}
                  disabled={loading || !brief.trim()}
                  className="btn-gold text-xs px-6 py-2.5 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Formulating Workflow Plan...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate Deliverables</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full pt-8 text-center text-xs text-velora-text-muted">
        Velora &mdash; Turn client briefs into work you can deliver.
      </footer>
    </div>
  );
}

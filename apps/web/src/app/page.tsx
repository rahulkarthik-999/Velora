'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Terminal,
  FileText,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';

const DEMO_PRESETS = [
  {
    goal: 'Prepare a tailored software engineer job application for Stripe',
    steps: [
      { num: '01', title: 'Extract Target Competencies', type: 'EXTRACT_INFO', output: 'Identified 6 core competencies: Distributed systems, API design, high-volume idempotency.' },
      { num: '02', title: 'Synthesize Resume Alignment', type: 'GENERATE_TEXT', output: 'Formatted 3 high-impact experience bullet points with quantified throughput metrics.' },
      { num: '03', title: 'Draft Executive Cover Letter', type: 'DRAFT_EMAIL', output: 'Produced concise, high-signal 3-paragraph letter addressed to the hiring director.' },
      { num: '04', title: 'Pre-Submission Verification', type: 'VERIFY_ARTIFACT', output: 'Quality audit: PASS. All required application criteria met.' },
    ],
  },
  {
    goal: 'Analyze commercial lease agreement for hidden liabilities',
    steps: [
      { num: '01', title: 'Parse Document Text & Covenants', type: 'SUMMARIZE_DOC', output: 'Extracted key clauses across 24 pages: Indemnification, escalation, early exit.' },
      { num: '02', title: 'Identify Financial & Legal Exposure', type: 'EXTRACT_INFO', output: 'Flagged Section 14.2: Triple-net expense uncapped escalation rate.' },
      { num: '03', title: 'Draft Landlord Amendment Proposal', type: 'DRAFT_EMAIL', output: 'Drafted counter-clause capping operational expense growth at 4% annually.' },
    ],
  },
  {
    goal: 'Create 5-day Tokyo executive travel & meeting itinerary',
    steps: [
      { num: '01', title: 'Consolidate Meeting Schedule', type: 'PRODUCE_PLAN', output: 'Structured 6 business meetings across Marunouchi and Roppongi.' },
      { num: '02', title: 'Generate Route & Transit Timelines', type: 'GENERATE_CHECKLIST', output: 'Mapped JR Yamanote & Tokyo Metro connections with 30-min buffer times.' },
      { num: '03', title: 'Compile Offline Travel Brief', type: 'CREATE_REPORT', output: 'Produced self-contained Markdown pack with emergency contacts and addresses.' },
    ],
  },
];

export default function LandingPage() {
  const [activeDemoIndex, setActiveDemoIndex] = useState(0);
  const activeDemo = DEMO_PRESETS[activeDemoIndex];

  return (
    <div className="min-h-screen bg-velora-bg text-velora-text selection:bg-white/10 selection:text-white">
      {/* Minimal Header */}
      <header className="border-b border-velora-border sticky top-0 z-50 bg-velora-bg/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white" />
            <span className="font-semibold tracking-tight text-sm text-white">Velora</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-xs text-velora-text-secondary">
            <a href="#how-it-works" className="hover:text-white transition-colors">Architecture</a>
            <a href="#features" className="hover:text-white transition-colors">Capabilities</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/auth/signin" className="text-xs text-velora-text-secondary hover:text-white transition-colors px-2 py-1">
              Sign in
            </Link>
            <Link href="/dashboard" className="btn-primary text-xs py-1.5 px-3">
              Open App &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-24 pb-16 px-6 max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-velora-border bg-velora-surface text-[11px] text-velora-text-secondary mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Autonomous AI Execution Platform</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-medium tracking-tight text-white leading-[1.1] mb-6">
          Stop starting.<br />
          <span className="text-velora-text-secondary font-normal">Start finishing.</span>
        </h1>

        <p className="text-base sm:text-lg text-velora-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          Tell Velora what you need to accomplish. It breaks the goal into an actionable workflow, executes each step, generates persistent deliverables, and saves your progress until you confirm completion.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
          <Link href="/dashboard" className="btn-primary text-sm px-6 py-2.5 w-full sm:w-auto">
            Start for free
          </Link>
          <a href="#demo" className="btn-secondary text-sm px-5 py-2.5 w-full sm:w-auto">
            Explore live workflow
          </a>
        </div>
      </section>

      {/* Interactive Workflow Console (Hero Demo) */}
      <section id="demo" className="max-w-5xl mx-auto px-6 pb-28">
        <div className="card overflow-hidden border-velora-border-strong bg-velora-surface/70 shadow-2xl">
          {/* Console Header */}
          <div className="border-b border-velora-border px-5 py-3 flex flex-wrap items-center justify-between gap-3 bg-velora-bg/60">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-velora-text-muted" />
              <span className="text-xs font-mono text-velora-text-secondary">engine.velora.internal</span>
            </div>
            <div className="flex items-center gap-1.5">
              {DEMO_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setActiveDemoIndex(i)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                    activeDemoIndex === i
                      ? 'bg-white text-black font-medium'
                      : 'text-velora-text-secondary hover:text-white bg-velora-surface'
                  }`}
                >
                  Preset 0{i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Goal Input Display */}
          <div className="p-6 border-b border-velora-border bg-velora-surface-subtle">
            <div className="text-[11px] font-mono text-velora-text-muted uppercase tracking-wider mb-2">Target Goal</div>
            <div className="text-sm font-medium text-white font-mono bg-velora-bg p-3.5 rounded-lg border border-velora-border">
              &gt; {activeDemo.goal}
            </div>
          </div>

          {/* Steps Decomposition Grid */}
          <div className="p-6 space-y-3">
            <div className="text-[11px] font-mono text-velora-text-muted uppercase tracking-wider mb-2">
              Synthesized Workflow &amp; Output Artifacts
            </div>

            <div className="space-y-2.5">
              {activeDemo.steps.map((st, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-lg border border-velora-border bg-velora-bg/60 hover:border-velora-border-strong transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-velora-text-muted text-[11px]">{st.num}</span>
                      <span className="font-semibold text-white">{st.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-velora-surface border border-velora-border text-velora-text-secondary">
                        {st.type}
                      </span>
                    </div>
                    <p className="text-velora-text-secondary text-[12px] pl-6 leading-relaxed">
                      {st.output}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 pl-6 sm:pl-0 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[11px] text-emerald-400 font-mono">COMPLETE</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Console Action Bar */}
          <div className="border-t border-velora-border p-4 bg-velora-bg/40 flex items-center justify-between">
            <span className="text-[11px] text-velora-text-muted font-mono">
              State: VERIFIED &bull; Artifacts persisted &bull; Progress 100%
            </span>
            <Link href="/dashboard" className="text-xs font-medium text-white hover:underline flex items-center gap-1">
              <span>Execute your own goal</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Architecture / How it works */}
      <section id="how-it-works" className="py-24 border-t border-velora-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="mb-16">
            <span className="text-xs font-mono text-velora-text-muted uppercase tracking-wider block mb-2">Core Mechanics</span>
            <h2 className="text-2xl sm:text-3xl font-medium text-white tracking-tight">
              A state machine built for verified completion.
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                step: '01',
                title: 'Goal Intake',
                desc: 'State your intention naturally. Attach PDFs, spreadsheets, or images. Velora clarifies missing context if required.',
              },
              {
                step: '02',
                title: 'Step Planning',
                desc: 'The goal is broken into ordered steps with explicit dependency graphs and defined success criteria.',
              },
              {
                step: '03',
                title: 'Execution Registry',
                desc: 'Specialized step handlers run sequentially. Background state persists across reloads and mobile sessions.',
              },
              {
                step: '04',
                title: 'Editable Output',
                desc: 'Every step yields reviewable, versioned artifacts with human sign-off for consequential external actions.',
              },
            ].map((col, i) => (
              <div key={i} className="border-t border-velora-border pt-4">
                <span className="text-xs font-mono text-velora-text-muted block mb-3">{col.step}</span>
                <h3 className="text-sm font-semibold text-white mb-2">{col.title}</h3>
                <p className="text-xs text-velora-text-secondary leading-relaxed">{col.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Differentiation: Chatbots vs Velora */}
      <section id="features" className="py-24 border-t border-velora-border bg-velora-surface/20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-medium text-white tracking-tight mb-3">
              Why Velora is not another chatbot.
            </h2>
            <p className="text-xs text-velora-text-secondary max-w-md mx-auto">
              Conversational assistants discard context upon conversation end. Velora organizes work around durable deliverables.
            </p>
          </div>

          <div className="card overflow-hidden border-velora-border">
            <div className="grid grid-cols-2 text-xs border-b border-velora-border bg-velora-bg/60 p-3 font-mono font-medium">
              <span className="text-velora-text-muted">Conventional Chatbot</span>
              <span className="text-white">Velora Execution Platform</span>
            </div>

            {[
              ['Answers questions in chat threads', 'Formulates multi-step workflow graphs with dependencies'],
              ['Ephemeral response lost in scroll history', 'Persistent task state with database-backed resumption'],
              ['Outputs plain unversioned chat text', 'Produces editable, versioned deliverable artifacts'],
              ['Executes indiscriminately without gating', 'Requires explicit user approval for consequential actions'],
              ['No progress tracking or completion state', 'Tracks verified progress to 100% completion status'],
            ].map(([legacy, velora], idx) => (
              <div key={idx} className="grid grid-cols-2 text-xs p-3.5 border-b border-velora-border/60 last:border-b-0">
                <span className="text-velora-text-muted pr-4">{legacy}</span>
                <span className="text-velora-text flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>{velora}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 border-t border-velora-border">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-14 text-center">
            <h2 className="text-2xl font-medium text-white tracking-tight mb-2">Straightforward Pricing</h2>
            <p className="text-xs text-velora-text-secondary">Start free. Upgrade as your execution volume scales.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="card p-6 flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono text-velora-text-muted uppercase mb-1">Free</div>
                <div className="text-2xl font-semibold text-white mb-4">₹0</div>
                <p className="text-xs text-velora-text-secondary mb-6">For personal tasks and evaluation.</p>
                <ul className="space-y-2.5 text-xs text-velora-text-secondary">
                  <li>&bull; 50 AI credits / month</li>
                  <li>&bull; 3 active concurrent tasks</li>
                  <li>&bull; 10 saved tasks in history</li>
                  <li>&bull; Standard step handlers</li>
                </ul>
              </div>
              <Link href="/dashboard" className="btn-secondary w-full text-xs text-center block mt-8">
                Get started free
              </Link>
            </div>

            <div className="card p-6 border-velora-border-strong bg-velora-surface-subtle flex flex-col justify-between relative">
              <div>
                <div className="text-xs font-mono text-velora-text-muted uppercase mb-1">Plus</div>
                <div className="text-2xl font-semibold text-white mb-4">₹499<span className="text-xs font-normal text-velora-text-muted">/mo</span></div>
                <p className="text-xs text-velora-text-secondary mb-6">For professionals managing multi-stage projects.</p>
                <ul className="space-y-2.5 text-xs text-velora-text-secondary">
                  <li>&bull; 500 AI credits / month</li>
                  <li>&bull; 15 concurrent active tasks</li>
                  <li>&bull; 100 persistent saved tasks</li>
                  <li>&bull; 15MB file upload limit</li>
                  <li>&bull; Artifact version history</li>
                </ul>
              </div>
              <Link href="/dashboard" className="btn-primary w-full text-xs text-center block mt-8">
                Start with Plus
              </Link>
            </div>

            <div className="card p-6 flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono text-velora-text-muted uppercase mb-1">Pro</div>
                <div className="text-2xl font-semibold text-white mb-4">₹999<span className="text-xs font-normal text-velora-text-muted">/mo</span></div>
                <p className="text-xs text-velora-text-secondary mb-6">For power users requiring high-throughput workflows.</p>
                <ul className="space-y-2.5 text-xs text-velora-text-secondary">
                  <li>&bull; 2,000 AI credits / month</li>
                  <li>&bull; 50 concurrent active tasks</li>
                  <li>&bull; 500 persistent saved tasks</li>
                  <li>&bull; 20MB file upload limit</li>
                  <li>&bull; Priority execution &amp; export</li>
                </ul>
              </div>
              <Link href="/dashboard" className="btn-secondary w-full text-xs text-center block mt-8">
                Start with Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="border-t border-velora-border py-8 px-6 text-xs text-velora-text-muted">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white">
            <span className="w-2 h-2 rounded-full bg-white" />
            <span className="font-medium">Velora</span>
            <span className="text-velora-text-muted">&mdash; Start with a goal. Finish with a result.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/dashboard" className="hover:text-white transition-colors">Workspace</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

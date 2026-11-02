'use client';

import Link from 'next/link';
import { useState } from 'react';
import Image from 'next/image';
import { Logo, VeloraSymbol } from '@/components/brand/Logo';
import {
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  Shield,
  Layers,
  Sparkles,
  Terminal,
  Clock,
  Download,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { DELIVERABLE_TEMPLATES } from '@velora/schemas';

const DEMO_CASES = [
  {
    id: 'proposal',
    label: 'Client Proposal',
    category: 'Sales & Growth',
    inputTitle: 'Client RFP / Discovery Notes',
    inputText:
      'Acme Retail needs a unified mobile & web loyalty platform. 3 global regions, 1.2M active users, integration with Salesforce Commerce Cloud and Stripe. Target delivery in 16 weeks.',
    steps: [
      { num: '01', title: 'Extract Requirements & Scope Boundaries', status: 'COMPLETE', time: '1.2s' },
      { num: '02', title: 'Draft Solution Architecture & Work Breakdown', status: 'COMPLETE', time: '2.8s' },
      { num: '03', title: 'Compile Tiered Commercial Proposal', status: 'COMPLETE', time: '2.1s' },
      { num: '04', title: 'Audit Scope Assumptions & Risk Mitigations', status: 'COMPLETE', time: '1.4s' },
    ],
    deliverableTitle: 'Executive Proposal: Unified Digital Loyalty Platform',
    deliverableContent: `# Executive Proposal — Acme Retail Loyalty Suite

### 1. Executive Summary
Acme Retail requires a resilient, multi-region digital loyalty platform serving 1.2M+ active consumers with seamless synchronization into Salesforce Commerce Cloud and Stripe Billing. This proposal presents an enterprise-grade, phased execution roadmap over a 16-week delivery window.

### 2. Scope & Technical Architecture
- **Multi-Region Mobile Experience:** Offline-first progressive architecture with regional localization (US, EU, APAC).
- **Core Integrations:** High-throughput webhook reconciliation for Stripe and bi-directional customer sync for Salesforce.
- **SLA & Resilience:** Target 99.95% operational availability with automated failover.

### 3. Investment & Milestone Schedule
- **Phase 1 (Weeks 1–4):** Architecture & API Protocol Definition
- **Phase 2 (Weeks 5–12):** Core Engineering & Sandbox Integration
- **Phase 3 (Weeks 13–16):** Security Penetration Testing & Staged Rollout`,
  },
  {
    id: 'sow',
    label: 'Statement of Work',
    category: 'Operations',
    inputTitle: 'Agreed Scope Notes',
    inputText:
      'Cloud infrastructure migration from legacy VMware to AWS EKS. Include VPC peering, Redis clustering, zero-downtime database cutover, and 30-day post-launch warranty.',
    steps: [
      { num: '01', title: 'Decompose Deliverables & Milestones', status: 'COMPLETE', time: '1.5s' },
      { num: '02', title: 'Define Acceptance Criteria & Assumptions', status: 'COMPLETE', time: '2.4s' },
      { num: '03', title: 'Structure Change Control & Governance Protocols', status: 'COMPLETE', time: '1.8s' },
    ],
    deliverableTitle: 'Statement of Work (SOW): AWS Infrastructure Modernization',
    deliverableContent: `# Statement of Work (SOW) — Cloud Modernization

### 1. Purpose & Objectives
This Statement of Work defines the contractual scope, acceptance milestones, and governance procedures for migrating core services from on-premise VMware to AWS EKS.

### 2. Work Breakdown Structure (WBS)
- **Milestone A:** Multi-AZ VPC Architecture & Terraform Modules (Week 3)
- **Milestone B:** Containerized Microservice Orchestration (Week 7)
- **Milestone C:** Zero-Downtime Aurora Database Cutover (Week 10)
- **Milestone D:** Production Sign-Off & 30-Day Hypercare (Week 14)

### 3. Explicit Scope Exclusions & Assumptions
Client will provide administrative IAM credentials within 48 hours of project kickoff. Out-of-scope modifications require written Change Orders.`,
  },
  {
    id: 'report',
    label: 'Performance Review',
    category: 'Account Management',
    inputTitle: 'Raw Monthly Spend & Analytics Data',
    inputText:
      'Q3 paid media review: $142,000 ad spend across Meta and Google. 4,280 new customer acquisitions (CAC $33.17, down 18% YoY). ROAS 3.84x.',
    steps: [
      { num: '01', title: 'Ingest Performance Metrics & Variance Tables', status: 'COMPLETE', time: '1.1s' },
      { num: '02', title: 'Synthesize Executive Narrative & Findings', status: 'COMPLETE', time: '2.2s' },
      { num: '03', title: 'Formulate Q4 Strategic Recommendations', status: 'COMPLETE', time: '1.9s' },
    ],
    deliverableTitle: 'Client Performance Review & Q4 Strategic Advisory',
    deliverableContent: `# Q3 Performance Review & Strategic Outlook

### 1. Key Performance Highlights
- **Total Invested Capital:** $142,000 (100% on budget)
- **Customer Acquisition Cost (CAC):** $33.17 (18% reduction YoY)
- **Return on Ad Spend (ROAS):** 3.84x (surpassing target 3.20x benchmark)

### 2. Tactical Attribution Insights
Search campaign optimization drove the highest lifetime value cohorts. Creative testing in carousel formats increased conversion velocity by 24%.

### 3. Q4 Recommendations
Reallocate 15% of lower-performing display spend into top-of-funnel video assets ahead of holiday peak.`,
  },
];

export default function LandingPage() {
  const [activeCaseIndex, setActiveCaseIndex] = useState(0);
  const activeCase = DEMO_CASES[activeCaseIndex];

  return (
    <div className="min-h-screen bg-velora-bg text-velora-text selection:bg-velora-gold/20 selection:text-velora-gold-light">
      {/* Top Header */}
      <header className="border-b border-velora-border sticky top-0 z-50 bg-velora-bg/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo size="md" href="/" />

          <nav className="hidden md:flex items-center gap-7 text-xs text-velora-text-secondary">
            <a href="#how-it-works" className="hover:text-white transition-colors">Workflow</a>
            <a href="#templates" className="hover:text-white transition-colors">Deliverable Templates</a>
            <a href="#demo" className="hover:text-white transition-colors">Live Console</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <Link href="/download" className="hover:text-white transition-colors">Desktop App</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/auth/signin"
              className="text-xs text-velora-text-secondary hover:text-white transition-colors px-3 py-1.5"
            >
              Sign in
            </Link>
            <Link
              href="/onboarding"
              className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-24 pb-20 px-6 max-w-4xl mx-auto text-center relative">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-velora-gold-border bg-velora-gold-subtle text-[11px] text-velora-gold-light mb-8 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-velora-gold animate-pulse" />
          <span>Client Deliverable Execution Platform</span>
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-normal tracking-tight text-white leading-[1.08] mb-6">
          Turn client briefs into work you&apos;re{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f3e7c4] via-[#d4af37] to-[#e5c158] font-medium">
            ready to deliver.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-velora-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          Velora helps agencies, consultants, and freelancers turn documents, raw notes, and client requests into structured plans, polished deliverables, and review-ready outputs.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
          <Link
            href="/onboarding"
            className="btn-gold text-sm px-7 py-3 w-full sm:w-auto flex items-center justify-center gap-2"
          >
            <span>Start for free</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#demo"
            className="btn-secondary text-sm px-6 py-3 w-full sm:w-auto text-center"
          >
            Explore live demonstration
          </a>
        </div>
      </section>

      {/* Interactive Demonstration Console */}
      <section id="demo" className="max-w-6xl mx-auto px-6 pb-28">
        <div className="card overflow-hidden border-velora-border-strong bg-velora-surface/80 shadow-2xl relative">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-velora-gold to-transparent opacity-60" />

          {/* Console Header */}
          <div className="border-b border-velora-border px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 bg-velora-bg/60">
            <div className="flex items-center gap-2 text-xs font-mono text-velora-text-secondary">
              <span className="w-2 h-2 rounded-full bg-velora-gold" />
              <span>Interactive Deliverable Console</span>
            </div>

            <div className="flex items-center gap-1.5">
              {DEMO_CASES.map((demo, idx) => (
                <button
                  key={demo.id}
                  onClick={() => setActiveCaseIndex(idx)}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                    activeCaseIndex === idx
                      ? 'bg-velora-gold text-black font-semibold'
                      : 'text-velora-text-secondary hover:text-white bg-velora-surface-subtle border border-velora-border'
                  }`}
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>

          {/* Console Two-Pane Workspace */}
          <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-velora-border">
            {/* Left Column: Raw Input & Execution Graph */}
            <div className="lg:col-span-5 p-6 space-y-6 bg-velora-surface-subtle/50">
              {/* Input Brief */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-velora-text-muted uppercase tracking-wider">
                    Client Input / Document
                  </span>
                  <span className="text-[11px] font-mono text-velora-gold">{activeCase.category}</span>
                </div>
                <div className="p-3.5 rounded-lg bg-velora-bg border border-velora-border text-xs text-velora-text-secondary leading-relaxed">
                  {activeCase.inputText}
                </div>
              </div>

              {/* Execution Steps */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-mono text-velora-text-muted uppercase tracking-wider block">
                  Workflow Execution Pipeline
                </span>
                <div className="space-y-2">
                  {activeCase.steps.map((st, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-velora-bg/70 border border-velora-border flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono text-velora-gold text-[11px]">{st.num}</span>
                        <span className="font-medium text-white truncate">{st.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 flex-shrink-0">
                        <Check className="w-3 h-3" />
                        <span>{st.time}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Generated Deliverable Preview */}
            <div className="lg:col-span-7 p-6 space-y-4 bg-velora-surface">
              <div className="flex items-center justify-between pb-3 border-b border-velora-border">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-velora-gold" />
                  <span className="text-xs font-semibold text-white">Generated Deliverable Output</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ready to Deliver
                </span>
              </div>

              <div className="bg-velora-bg border border-velora-border rounded-xl p-5 text-xs text-white leading-relaxed font-sans whitespace-pre-wrap max-h-[380px] overflow-y-auto">
                {activeCase.deliverableContent}
              </div>

              <div className="flex items-center justify-between pt-2 text-xs">
                <span className="text-velora-text-muted font-mono text-[11px]">
                  Output format: Markdown &bull; Exportable as PDF, DOCX, TXT
                </span>
                <Link
                  href="/onboarding"
                  className="text-velora-gold-light hover:text-white font-medium flex items-center gap-1"
                >
                  <span>Build your deliverable &rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Deliverable Templates Grid */}
      <section id="templates" className="py-24 border-t border-velora-border bg-velora-surface-subtle/30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-16 text-center max-w-2xl mx-auto">
            <span className="text-xs font-mono text-velora-gold uppercase tracking-wider block mb-2">
              Deliverable Templates
            </span>
            <h2 className="text-3xl font-normal text-white tracking-tight">
              Pre-built execution blueprints for client services.
            </h2>
            <p className="text-xs text-velora-text-secondary mt-2">
              Each template codifies the exact sections, assumptions, and validation gates required for high-stakes deliverables.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Object.values(DELIVERABLE_TEMPLATES).map((tpl) => (
              <div
                key={tpl.key}
                className="card p-6 border-velora-border hover:border-velora-gold-border transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono text-velora-gold uppercase px-2 py-0.5 rounded bg-velora-gold-subtle border border-velora-gold-border">
                      {tpl.category}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2 group-hover:text-velora-gold-light transition-colors">
                    {tpl.title}
                  </h3>
                  <p className="text-xs text-velora-text-secondary leading-relaxed mb-4">
                    {tpl.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-velora-border space-y-2">
                  <span className="text-[11px] font-mono text-velora-text-muted block">Produces:</span>
                  <ul className="text-xs text-velora-text-secondary space-y-1">
                    {tpl.expectedDeliverables.map((item, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-velora-gold flex-shrink-0" />
                        <span className="truncate">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-3">
                    <Link
                      href="/onboarding"
                      className="text-xs text-white hover:text-velora-gold-light font-medium flex items-center gap-1"
                    >
                      <span>Use this template &rarr;</span>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The 4-Step Product Workflow */}
      <section id="how-it-works" className="py-24 border-t border-velora-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="mb-16">
            <span className="text-xs font-mono text-velora-gold uppercase tracking-wider block mb-2">
              The Workflow
            </span>
            <h2 className="text-2xl sm:text-3xl font-normal text-white tracking-tight">
              From client request to verified deliverable.
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                num: '01',
                title: 'Ingest Brief or Material',
                desc: 'Upload a client brief, meeting transcript, PDF, or describe the required outcome in natural language.',
              },
              {
                num: '02',
                title: 'Review Structured Plan',
                desc: 'Velora formulates sequential steps, assumptions, and required artifacts before consequential actions run.',
              },
              {
                num: '03',
                title: 'Execute & Refine',
                desc: 'Specialized step handlers draft sections, extract facts, and cross-reference against client requirements.',
              },
              {
                num: '04',
                title: 'Edit, Version & Deliver',
                desc: 'Inspect outputs in the Artifact Studio. Edit in-place, export clean Markdown, or deliver to the client.',
              },
            ].map((col, idx) => (
              <div key={idx} className="border-t border-velora-border pt-5">
                <span className="text-xs font-mono text-velora-gold block mb-2">{col.num}</span>
                <h3 className="text-sm font-semibold text-white mb-2">{col.title}</h3>
                <p className="text-xs text-velora-text-secondary leading-relaxed">{col.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security & Consequential Action Guardrails */}
      <section className="py-20 border-t border-velora-border bg-velora-surface-subtle/30">
        <div className="max-w-4xl mx-auto px-6 grid md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Lock className="w-5 h-5 text-velora-gold" />
            <h3 className="text-sm font-semibold text-white">Private Storage</h3>
            <p className="text-xs text-velora-text-secondary leading-relaxed">
              Client briefs and attachments are stored in private cloud storage accessible only by your authenticated account.
            </p>
          </div>
          <div className="space-y-2">
            <Shield className="w-5 h-5 text-velora-gold" />
            <h3 className="text-sm font-semibold text-white">Approval Gates</h3>
            <p className="text-xs text-velora-text-secondary leading-relaxed">
              Consequential external actions require explicit interactive review. Velora never sends messages or publishes without your sign-off.
            </p>
          </div>
          <div className="space-y-2">
            <Layers className="w-5 h-5 text-velora-gold" />
            <h3 className="text-sm font-semibold text-white">Durable State</h3>
            <p className="text-xs text-velora-text-secondary leading-relaxed">
              Every workflow step, artifact version, and audit log is persisted in PostgreSQL. Resume unfinished work seamlessly on web or mobile.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 border-t border-velora-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16 max-w-xl mx-auto">
            <span className="text-xs font-mono text-velora-gold uppercase tracking-wider block mb-2">
              Commercial Plans
            </span>
            <h2 className="text-3xl font-normal text-white tracking-tight">Transparent, predictable pricing.</h2>
            <p className="text-xs text-velora-text-secondary mt-2">
              Start with the free tier. Upgrade when your client deliverable volume demands higher throughput.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Free */}
            <div className="card p-6 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-mono text-velora-text-muted uppercase block mb-1">Starter</span>
                <div className="text-3xl font-semibold text-white mb-3">₹0</div>
                <p className="text-xs text-velora-text-secondary mb-6">
                  For individual freelancers evaluating deliverable workflows.
                </p>
                <ul className="space-y-2.5 text-xs text-velora-text-secondary">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>50 AI credits / month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>3 concurrent active tasks</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>10 saved tasks in history</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>All 6 deliverable templates</span>
                  </li>
                </ul>
              </div>
              <Link href="/onboarding" className="btn-secondary w-full text-xs text-center block mt-8">
                Start Free
              </Link>
            </div>

            {/* Plus */}
            <div className="card p-6 border-velora-gold-border bg-velora-surface-subtle flex flex-col justify-between relative shadow-xl shadow-velora-gold/5">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-velora-gold text-black text-[10px] font-bold uppercase tracking-wider">
                Recommended
              </div>
              <div>
                <span className="text-[11px] font-mono text-velora-gold uppercase block mb-1">Plus</span>
                <div className="text-3xl font-semibold text-white mb-3">
                  ₹499<span className="text-xs font-normal text-velora-text-muted">/mo</span>
                </div>
                <p className="text-xs text-velora-text-secondary mb-6">
                  For active consultants and boutique agencies shipping weekly deliverables.
                </p>
                <ul className="space-y-2.5 text-xs text-velora-text-secondary">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>500 AI credits / month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>15 concurrent active tasks</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>100 persistent saved tasks</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>15MB file upload allowance</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>Artifact version history</span>
                  </li>
                </ul>
              </div>
              <Link href="/onboarding" className="btn-gold w-full text-xs text-center block mt-8">
                Start with Plus
              </Link>
            </div>

            {/* Pro */}
            <div className="card p-6 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-mono text-velora-text-muted uppercase block mb-1">Pro</span>
                <div className="text-3xl font-semibold text-white mb-3">
                  ₹999<span className="text-xs font-normal text-velora-text-muted">/mo</span>
                </div>
                <p className="text-xs text-velora-text-secondary mb-6">
                  For high-throughput delivery teams managing heavy document loads.
                </p>
                <ul className="space-y-2.5 text-xs text-velora-text-secondary">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>2,000 AI credits / month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>50 concurrent active tasks</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>500 persistent saved tasks</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>20MB file upload allowance</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-velora-gold flex-shrink-0" />
                    <span>Priority model routing &amp; export</span>
                  </li>
                </ul>
              </div>
              <Link href="/onboarding" className="btn-secondary w-full text-xs text-center block mt-8">
                Start with Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="border-t border-velora-border py-12 px-6 text-xs text-velora-text-muted">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" showText={false} />
            <span className="font-semibold text-white">Velora</span>
            <span>&mdash; Turn client briefs into work you can deliver.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/download" className="hover:text-white transition-colors">Download for Windows</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/dashboard" className="hover:text-white transition-colors">Client Workspace</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

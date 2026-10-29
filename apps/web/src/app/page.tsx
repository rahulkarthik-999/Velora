import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Zap,
  FileText,
  Shield,
  Smartphone,
  Target,
  ListChecks,
  Play,
  Trophy,
  Upload,
  Sparkles,
  ChevronDown,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-velora-bg text-velora-text selection:bg-velora-violet/30 selection:text-velora-lavender">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-velora-bg/85 backdrop-blur-xl border-b border-velora-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-velora-violet to-violet-700 flex items-center justify-center shadow-lg shadow-velora-violet/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-velora-text">Velora</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm font-medium text-velora-text-secondary hover:text-velora-text transition-colors">How it works</a>
            <a href="#examples" className="text-sm font-medium text-velora-text-secondary hover:text-velora-text transition-colors">Examples</a>
            <a href="#pricing" className="text-sm font-medium text-velora-text-secondary hover:text-velora-text transition-colors">Pricing</a>
            <a href="#faq" className="text-sm font-medium text-velora-text-secondary hover:text-velora-text transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/signin" className="btn-ghost text-sm font-medium">Sign in</Link>
            <Link href="/dashboard" className="btn-primary text-sm font-medium flex items-center gap-1.5 shadow-md shadow-velora-violet/25">
              <span>Start for free</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-velora-violet/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-velora-violet-bg border border-velora-violet-border text-velora-violet-light text-xs font-semibold uppercase tracking-wider mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            Autonomous AI Task Execution
          </div>
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold text-velora-text leading-[1.1] tracking-tight mb-6">
            Stop starting.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-velora-violet via-velora-lavender to-violet-300">
              Start finishing.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-velora-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
            Tell Velora what you need to accomplish. It turns your goal into a practical workflow, 
            helps you complete each step, generates real deliverables, and keeps everything organized until you&apos;re done.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
            <Link href="/dashboard" className="btn-primary text-base px-8 py-3.5 flex items-center gap-2.5 w-full sm:w-auto justify-center shadow-lg shadow-velora-violet/30 font-semibold">
              Start for free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#how-it-works" className="btn-secondary text-base px-8 py-3.5 flex items-center gap-2 w-full sm:w-auto justify-center font-medium">
              See how it works
              <ChevronDown className="w-4 h-4" />
            </a>
          </div>

          {/* Interactive Hero Goal Preview */}
          <div className="max-w-2xl mx-auto text-left">
            <div className="card border-velora-border-light/60 shadow-2xl shadow-black/80 bg-velora-surface/90 backdrop-blur-sm">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-velora-border">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-velora-text-secondary uppercase tracking-wider">Live Goal Engine</span>
                </div>
                <span className="text-xs text-velora-text-muted">Interactive Preview</span>
              </div>
              <div className="bg-velora-bg/90 rounded-lg p-4 border border-velora-border/80 text-sm leading-relaxed text-velora-text">
                &ldquo;Help me prepare a complete job application for a Senior Software Engineer role at Google. I have my resume notes and the job description.&rdquo;
              </div>
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-velora-text-muted">
                  <Upload className="w-4 h-4 text-velora-violet-light" />
                  <span>Resume.pdf (Attached)</span>
                </div>
                <Link href="/dashboard" className="btn-primary text-xs py-2 px-4 text-center">
                  Turn into Workflow &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 bg-velora-surface/40 border-y border-velora-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-velora-text mb-4">How Velora works</h2>
            <p className="text-velora-text-secondary max-w-xl mx-auto">
              Not a chatbot that stops after generating text. An execution platform that tracks work to verified completion.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { icon: Target, title: 'Describe your goal', desc: 'State what you want to accomplish in natural language. Attach documents, screenshots, or links.' },
              { icon: ListChecks, title: 'Review the workflow', desc: 'Velora decomposes your goal into ordered, dependent steps with defined inputs and expected outputs.' },
              { icon: Play, title: 'Execute step by step', desc: 'Each step runs with specialized handlers for synthesis, drafting, data extraction, and quality verification.' },
              { icon: Trophy, title: 'Finished deliverables', desc: 'Editable, persistent artifacts saved to your workspace. Human sign-off required for consequential actions.' },
            ].map((step, i) => (
              <div key={i} className="card relative group hover:border-velora-violet/50 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-velora-violet-bg border border-velora-violet-border flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <step.icon className="w-5 h-5 text-velora-violet-light" />
                </div>
                <div className="text-xs font-semibold text-velora-violet mb-1 tracking-wider uppercase">Phase 0{i + 1}</div>
                <h3 className="text-base font-semibold text-velora-text mb-2">{step.title}</h3>
                <p className="text-xs text-velora-text-secondary leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Examples */}
      <section id="examples" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-velora-text mb-4">Supported execution blueprints</h2>
            <p className="text-velora-text-secondary max-w-xl mx-auto">
              Real tasks people use Velora to finish every day.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: FileText, title: 'Job Application Suite', desc: 'Extract key competencies, generate tailored resume diffs, draft cover letter, and run pre-submission audit.', badge: '6 Steps' },
              { icon: FileText, title: 'Document & PDF Intelligence', desc: 'Analyze contracts, papers, or financial statements. Extract structured tables, summarize risks, and produce action plans.', badge: '4 Steps' },
              { icon: ListChecks, title: 'Comprehensive Trip Planner', desc: 'Coordinate day-by-day itineraries, flight/hotel booking checklist, budget ledger, and offline packing requirements.', badge: '7 Steps' },
              { icon: FileText, title: 'Executive Report Drafting', desc: 'Synthesize raw meeting notes, transcripts, or data dumps into an executive summary, findings, and next steps.', badge: '5 Steps' },
              { icon: Zap, title: 'Complex Email Resolution', desc: 'Dissect high-stakes emails, analyze subtext and implied obligations, and draft nuanced responses for review.', badge: '3 Steps' },
              { icon: ListChecks, title: 'Technical Problem Solver', desc: 'Parse error logs or system stacktraces, reproduce diagnostic steps, and verify fix instructions.', badge: '5 Steps' },
            ].map((example, i) => (
              <div key={i} className="card hover:border-velora-violet/40 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-velora-violet-bg flex items-center justify-center">
                      <example.icon className="w-5 h-5 text-velora-violet-light" />
                    </div>
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-velora-surface-hover border border-velora-border text-velora-lavender">
                      {example.badge}
                    </span>
                  </div>
                  <h3 className="font-semibold text-velora-text text-base mb-2">{example.title}</h3>
                  <p className="text-sm text-velora-text-secondary leading-relaxed">{example.desc}</p>
                </div>
                <div className="pt-4 mt-4 border-t border-velora-border">
                  <Link href="/dashboard" className="text-xs font-medium text-velora-violet-light hover:text-velora-lavender flex items-center gap-1">
                    <span>Try this workflow</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Continuity & Security */}
      <section className="py-20 px-4 sm:px-6 bg-velora-surface/30 border-y border-velora-border">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          <div className="card">
            <Smartphone className="w-8 h-8 text-velora-violet mb-4" />
            <h3 className="text-lg font-semibold text-velora-text mb-2">Cross-Platform Sync</h3>
            <p className="text-sm text-velora-text-secondary leading-relaxed">
              Start on your Android phone while commuting, pick it up on your desktop browser. Task state, logs, and artifacts stay synchronized via real-time backend state.
            </p>
          </div>
          <div className="card">
            <Upload className="w-8 h-8 text-velora-violet mb-4" />
            <h3 className="text-lg font-semibold text-velora-text mb-2">Multimodal Ingestion</h3>
            <p className="text-sm text-velora-text-secondary leading-relaxed">
              Upload PDFs, images, DOCX, CSVs, or screenshots. Files are processed securely server-side and contextualized directly into workflow execution steps.
            </p>
          </div>
          <div className="card">
            <Shield className="w-8 h-8 text-velora-violet mb-4" />
            <h3 className="text-lg font-semibold text-velora-text mb-2">Human-in-the-Loop Guardrails</h3>
            <p className="text-sm text-velora-text-secondary leading-relaxed">
              Velora never sends emails, mutates external accounts, or publishes content without explicit interactive approval. You stay in command.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-velora-text mb-4">Transparent Pricing</h2>
            <p className="text-velora-text-secondary">Start free. Upgrade as your execution needs expand.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {/* Free */}
            <div className="card flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-semibold text-velora-text mb-1">Free</h3>
                <div className="text-3xl font-bold text-velora-text mb-1">₹0</div>
                <p className="text-xs text-velora-text-muted mb-6">Personal starter</p>
                <ul className="space-y-3 mb-8 text-sm text-velora-text-secondary">
                  {['50 AI credits / month', '3 active concurrent tasks', '10 saved persistent tasks', 'Basic workflows', '5MB file upload limit'].map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/dashboard" className="btn-secondary w-full text-center block text-sm font-medium">Get Started Free</Link>
            </div>

            {/* Plus */}
            <div className="card border-velora-violet relative flex flex-col justify-between shadow-lg shadow-velora-violet/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-velora-violet text-white text-xs font-medium rounded-full">
                Most Popular
              </div>
              <div>
                <h3 className="text-lg font-semibold text-velora-text mb-1">Plus</h3>
                <div className="text-3xl font-bold text-velora-text mb-1">₹499<span className="text-sm font-normal text-velora-text-muted">/month</span></div>
                <p className="text-xs text-velora-text-muted mb-6">For professionals</p>
                <ul className="space-y-3 mb-8 text-sm text-velora-text-secondary">
                  {['500 AI credits / month', '15 active concurrent tasks', '100 saved persistent tasks', 'Full handler registry', '15MB file upload limit', 'Artifact version history'].map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-velora-violet-light flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/dashboard/settings" className="btn-primary w-full text-center block text-sm font-medium">Upgrade to Plus</Link>
            </div>

            {/* Pro */}
            <div className="card flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-semibold text-velora-text mb-1">Pro</h3>
                <div className="text-3xl font-bold text-velora-text mb-1">₹999<span className="text-sm font-normal text-velora-text-muted">/month</span></div>
                <p className="text-xs text-velora-text-muted mb-6">For power builders</p>
                <ul className="space-y-3 mb-8 text-sm text-velora-text-secondary">
                  {['2,000 AI credits / month', '50 active concurrent tasks', '500 saved tasks', 'Priority model routing', '20MB file upload limit', 'Export to DOCX, PDF, Markdown', 'Priority support'].map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-velora-lavender flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/dashboard/settings" className="btn-secondary w-full text-center block text-sm font-medium">Upgrade to Pro</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 sm:px-6 bg-velora-surface/30 border-t border-velora-border">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-velora-text mb-10 text-center">Frequently asked questions</h2>
          <div className="space-y-4">
            {[
              { q: 'How is Velora different from ChatGPT or Claude?', a: 'Chatbots provide transient conversational responses. Velora creates structured, persistent state machines around your task with ordered dependencies, background execution, editable artifacts, human approvals, and outcome verification.' },
              { q: 'Is my uploaded data private and secure?', a: 'Yes. Files are stored in secure object storage isolated per user ID. Server-side queries enforce account ownership. We never sell your data or train external models on user documents.' },
              { q: 'Can I use Velora on Android?', a: 'Yes. The companion Android application connects to the exact same backend and synchronizes task progress in real time.' },
              { q: 'What happens when I delete my account?', a: 'Your user profile, tasks, workflow executions, uploaded attachments, and generated artifacts are permanently purged immediately.' },
            ].map((faq, i) => (
              <details key={i} className="card group cursor-pointer">
                <summary className="flex items-center justify-between list-none text-sm font-medium text-velora-text">
                  <span>{faq.q}</span>
                  <ChevronDown className="w-4 h-4 text-velora-text-muted group-open:rotate-180 transition-transform" />
                </summary>
                <p className="mt-3 text-xs leading-relaxed text-velora-text-secondary">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-velora-border py-12 px-4 sm:px-6 bg-velora-bg text-velora-text-muted text-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-velora-text font-semibold">
            <Sparkles className="w-4 h-4 text-velora-violet" />
            <span>Velora &mdash; Start with a goal. Finish with a result.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-velora-text transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-velora-text transition-colors">Terms of Service</Link>
            <Link href="/dashboard" className="hover:text-velora-text transition-colors">Workspace</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

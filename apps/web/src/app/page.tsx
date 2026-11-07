'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import {
  ArrowRight,
  Award,
  Briefcase,
  Camera,
  Check,
  CheckCircle2,
  Code2,
  Compass,
  Database,
  Download,
  FileText,
  Layers,
  Mic,
  Radio,
  Shield,
  Sparkles,
} from 'lucide-react';

const INTERACTIVE_MODULES = [
  {
    id: 'copilot',
    badge: 'PERFORM · LIVE INTERVIEW COPILOT',
    title: 'Real-Time Live Interview Copilot & Instant Screen Analysis',
    subtitle:
      'Listens to the interviewer via system audio or scans coding/system design questions on your screen in under 1 second via Ctrl+Shift+S — grounded strictly in your resume and job context.',
    inputLabel: 'Live Interview Question (Spoken or Screen Captured)',
    inputSample:
      'Interviewer: "Can you walk me through how you designed your high-throughput event pipeline and how you handled backpressure or poison-pill messages?"',
    highlights: [
      'Sub-second Windows GDI screen question capture (Ctrl+Shift+S / Alt+S)',
      'One-click Show / Hide Velora main window while compact floating Copilot stays on top',
      'Screen Shield (WDA_EXCLUDEFROMCAPTURE) + Clean Screen Share mode',
      'Grounded in your actual resume facts, target job description & knowledge base',
    ],
    outputTitle: 'Velora Live Copilot Response (STAR Grounded)',
    outputContent: `• Situation & Scale: At my previous role, we ingested 45,000+ webhook events/sec into Kafka with strict ordering guarantees per tenant.
• Backpressure Strategy: Implemented adaptive consumer concurrency with bounded in-memory queues and exponential backoff before dead-lettering.
• Poison-Pill Isolation: Routed malformed or repeatedly failing payloads to a dedicated DLQ topic after 3 retries with circuit-breaker alerts, preventing partition stalls.
• Measurable Impact: Reduced p99 processing latency from 1.8s to 210ms and achieved 99.99% delivery reliability.`,
  },
  {
    id: 'resume',
    badge: 'PREPARE · RESUME INTELLIGENCE & JOB MATCH',
    title: 'Resume Intelligence & Job Match Analyzer',
    subtitle:
      'Upload your PDF or DOCX resume and target job description. Extract your structured candidate profile, get ATS & impact scores, and review editable before/after bullet improvements.',
    inputLabel: 'Original Resume Bullet + Target Role (Senior Backend Engineer)',
    inputSample:
      'Original Bullet: "Worked on backend APIs in Node.js and PostgreSQL and improved database query performance for the dashboard."',
    highlights: [
      'Never fabricates employers, degrees, credentials, or skills',
      'Every suggested bullet improvement is editable and requires explicit user approval',
      'Job Match Analyzer extracts required/preferred skills, seniority & likely interview questions',
      'Full resume version history and one-click export',
    ],
    outputTitle: 'Resume Intelligence & Alignment Output',
    outputContent: `ATS Compatibility: 92/100 · Impact Score: 88/100 · Role Alignment: Strong Alignment (86%)

Suggested Bullet Improvement (Editable & Approval-Gated):
"Architected low-latency Node.js and PostgreSQL REST APIs powering the customer analytics dashboard, optimizing composite indexing and CTE queries to reduce load times by [X%]."

Identified Skill Gaps to Review Before Interview:
+ Distributed Caching (Redis Cluster)   + Read-Replica Partitioning   + OpenTelemetry Tracing`,
  },
  {
    id: 'mock',
    badge: 'PRACTICE · VOICE AI MOCK INTERVIEWS & REPORTS',
    title: 'Voice-Based AI Mock Interviews & 7-Point Performance Reports',
    subtitle:
      'Practice HR, Behavioral, Technical, Coding, System Design, Managerial, and Project Discussion interviews with a realistic voice AI interviewer that asks dynamic follow-ups.',
    inputLabel: 'Voice Mock Session · Technical & Behavioral Round',
    inputSample:
      'AI Interviewer: "You mentioned migrating your billing service to idempotent webhooks. What race conditions did you hit when two webhook retries arrived simultaneously?"',
    highlights: [
      'Spoken voice interviewer + Speech-to-Text answer dictation',
      '7 explainable rubric scores citing exact quotes from your transcript',
      'Objective speech metrics (filler words, WPM pace, response latency) kept distinct from content scores',
      'Model answer rewrites and exportable PDF / Markdown performance reports',
    ],
    outputTitle: 'Actionable Performance Report Preview',
    outputContent: `Overall Evaluation: 8.6 / 10
• Technical Accuracy: 9/10 — Strong explanation of PostgreSQL unique idempotency keys and row-level locking.
• STAR Structure: 8/10 — Clear Situation and Action; quantify the exact reduction in duplicate charges in the Result.
• Objective Delivery Metrics: 142 WPM · 1.2% filler rate (2 fillers in 168 words) · 1.8s avg response latency.`,
  },
  {
    id: 'assistants',
    badge: 'PERFORM & IMPROVE · TECHNICAL ASSISTANTS & ROADMAP',
    title: 'Coding, SQL & System Design Assistants + Career Learning Roadmap',
    subtitle:
      'Solve algorithmic problems with brute-force vs. optimal complexity comparisons, optimize complex SQL window functions, design distributed systems, and track your weekly learning roadmap.',
    inputLabel: 'Technical Assistant & Learning Roadmap Prompt',
    inputSample:
      'Prompt: "Design a distributed rate limiter for 50M DAU + write a PostgreSQL query for 7-day rolling active user retention."',
    highlights: [
      'Coding Assistant: Clarifying questions, brute-force vs. optimal, Big-O complexity, edge & test cases',
      'SQL Assistant: CTEs, window functions, execution breakdown, composite index recommendations',
      'System Design Assistant: ASCII architecture diagrams, API design, DB partitioning & trade-offs',
      'Career Learning Roadmap: Skill gap dashboard, weekly goals, daily tasks & question banks',
    ],
    outputTitle: 'Technical Blueprint & Roadmap Output',
    outputContent: `[System Design] Token Bucket + Sliding Window Counter in Redis Cluster with Lua atomic scripts; local edge L1 token pre-allocation for hot keys.
[SQL] CTE with generate_series() + DENSE_RANK() window function indexed on (user_id, activity_date).
[Roadmap Week 1] Master Redis atomic Lua scripting & PostgreSQL window frame clauses (3 daily exercises).`,
  },
];

const PRICING_PLANS = [
  {
    id: 'STARTER',
    name: 'Starter',
    price: '$9',
    period: '/month',
    badge: null,
    desc: 'Essential interview preparation and live copilot support for active jobseekers.',
    allowances: '30 transcription mins · 150 AI credits · 10 screen scans',
    features: [
      'Resume Intelligence & ATS quality analysis',
      'Job Match Analyzer & likely questions',
      'Voice AI Mock Interviews & Performance Reports',
      'Live Interview Copilot & Screen Question Scan',
      'Coding, SQL & System Design Assistants',
    ],
  },
  {
    id: 'PRO_MONTHLY',
    name: 'Pro Monthly',
    price: '$29',
    period: '/month',
    badge: 'Most Popular',
    desc: 'Full-capacity AI Career Companion for intensive interview loops and technical prep.',
    allowances: '150 transcription mins · 750 AI credits · 50 screen scans',
    features: [
      'Everything in Starter with 5x monthly capacity',
      'Unlimited Resume Version History & Job Profiles',
      'Full 7-round Voice AI Mock Interview Suite',
      'Sub-second Vision Screen Analysis (Ctrl+Shift+S)',
      'Personalized Multi-Week Career Learning Roadmap',
    ],
  },
  {
    id: 'PRO_QUARTERLY',
    name: 'Pro Quarterly',
    price: '$69',
    period: '/3 months',
    badge: 'Save 21%',
    desc: 'Built for a complete 90-day job search and career transition cycle.',
    allowances: '150 mins/mo · 750 AI credits/mo · 50 screen scans/mo',
    features: [
      'All Pro Monthly features billed quarterly',
      'Continuous skill gap tracking across interviews',
      'PDF & Markdown Performance Report exports',
      'Priority AI model routing (GPT-4o / Claude / Gemini)',
    ],
  },
  {
    id: 'PRO_ANNUAL',
    name: 'Pro Annual',
    price: '$149',
    period: '/year',
    badge: 'Save 57%',
    desc: 'Year-round career companion for ongoing interviews, promotions, and skill mastery.',
    allowances: '150 mins/mo · 750 AI credits/mo · 50 screen scans/mo',
    features: [
      'All Pro features for 12 full months',
      'Complete career progression & roadmap archive',
      'Desktop + Web unified career context sync',
    ],
  },
  {
    id: 'LIFETIME',
    name: 'Lifetime',
    price: '$299',
    period: 'one-time',
    badge: 'Best Value',
    desc: 'Pay once, own Velora for life with monthly allowances that reset every 30 days.',
    allowances: '60 mins/mo · 300 AI credits/mo · 20 screen scans/mo',
    features: [
      'One-time payment — no recurring subscription ever',
      'Perpetual monthly AI credit, audio & screen allowances',
      'All future AI Career Companion modules included',
    ],
  },
];

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState(0);
  const currentModule = INTERACTIVE_MODULES[activeTab];

  return (
    <div className="min-h-screen bg-velora-bg text-velora-text selection:bg-velora-gold/20 selection:text-velora-gold-light">
      {/* Top Header */}
      <header className="border-b border-velora-border sticky top-0 z-50 bg-velora-bg/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="md" href="/" />
            <span className="hidden sm:inline-block text-[11px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-velora-gold/10 text-velora-gold border border-velora-gold/25">
              AI Career Companion
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-xs text-velora-text-secondary">
            <a href="#interactive-demo" className="hover:text-white transition-colors">
              Interactive Preview
            </a>
            <a href="#career-pillars" className="hover:text-white transition-colors">
              Prepare · Practice · Perform · Improve
            </a>
            <a href="#desktop-copilot" className="hover:text-white transition-colors">
              Desktop Copilot
            </a>
            <a href="#pricing" className="hover:text-white transition-colors">
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs text-velora-text-secondary hover:text-white transition-colors px-3 py-1.5"
            >
              Sign in
            </Link>
            <Link href="/dashboard" className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5">
              <span>Launch Web Companion</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 px-6 border-b border-velora-border overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-velora-surface border border-velora-border text-velora-gold text-[11px] font-medium mb-6">
              <Sparkles className="w-3 h-3" />
              <span>Velora — Your AI Career Companion · Web + Windows Desktop App</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-semibold tracking-tight text-white leading-[1.08] mb-5">
              Prepare smarter.{' '}
              <span className="text-velora-gold">Practice confidently.</span>{' '}
              Perform better.
            </h1>

            <p className="text-base sm:text-lg text-velora-text-secondary leading-relaxed mb-8 max-w-2xl">
              One unified AI career platform for jobseekers: analyze and improve your resume without fabrication,
              evaluate target job alignment, practice with a voice AI interviewer, get real-time audio &amp; screen
              assistance during live interviews, and follow a personalized learning roadmap.
            </p>

            <div className="flex flex-wrap items-center gap-3.5">
              <Link href="/dashboard" className="btn-gold py-3 px-6 text-sm flex items-center gap-2">
                <span>Open Career Companion Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://github.com/ishaan-pareek/Velora/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary py-3 px-5 text-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4 text-velora-gold" />
                <span>Download Windows Desktop App</span>
              </a>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-velora-text-muted">
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-velora-gold" />
                <span>Grounded in your real resume (zero fabricated experience)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-velora-gold" />
                <span>Instant Screen Scan (Ctrl+Shift+S) &amp; Show/Hide Toggle</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-velora-gold" />
                <span>Coding, SQL &amp; System Design Copilots</span>
              </div>
            </div>
          </div>

          {/* Interactive Career Companion Console */}
          <div id="interactive-demo" className="rounded-xl border border-velora-border bg-velora-surface overflow-hidden shadow-2xl">
            <div className="border-b border-velora-border bg-velora-bg/60 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-velora-gold/80" />
                <span className="text-xs font-mono uppercase tracking-wider text-velora-text-secondary">
                  Velora Unified Career Companion Console
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {INTERACTIVE_MODULES.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => setActiveTab(idx)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      activeTab === idx
                        ? 'bg-velora-gold text-velora-bg font-semibold'
                        : 'bg-velora-surface-subtle text-velora-text-secondary hover:text-white border border-velora-border'
                    }`}
                  >
                    {m.id === 'copilot' && '1. Live Copilot & Screen Scan'}
                    {m.id === 'resume' && '2. Resume & Job Match'}
                    {m.id === 'mock' && '3. Voice Mock & Reports'}
                    {m.id === 'assistants' && '4. Coding, SQL & Roadmap'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-velora-border">
              <div className="lg:col-span-5 p-6 flex flex-col justify-between bg-velora-bg/25">
                <div>
                  <span className="inline-block text-[10px] font-mono uppercase tracking-widest text-velora-gold mb-2">
                    {currentModule.badge}
                  </span>
                  <h2 className="text-lg font-semibold text-white mb-2">{currentModule.title}</h2>
                  <p className="text-xs text-velora-text-secondary leading-relaxed mb-4">{currentModule.subtitle}</p>

                  <div className="p-3.5 rounded-lg bg-velora-surface border border-velora-border mb-4">
                    <div className="text-[10px] font-mono uppercase text-velora-text-muted mb-1">
                      {currentModule.inputLabel}
                    </div>
                    <p className="text-xs text-velora-text leading-relaxed">{currentModule.inputSample}</p>
                  </div>

                  <div className="space-y-2">
                    {currentModule.highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-velora-text-secondary">
                        <CheckCircle2 className="w-3.5 h-3.5 text-velora-gold shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-5 mt-5 border-t border-velora-border flex items-center justify-between">
                  <span className="text-[11px] text-velora-text-muted">Shared Career Context Enabled</span>
                  <Link href="/dashboard" className="text-xs text-velora-gold hover:underline flex items-center gap-1 font-medium">
                    Try in Web Dashboard <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-7 p-6 bg-velora-surface flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-velora-gold">
                      AI Career Companion Output
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-velora-gold/10 text-velora-gold border border-velora-gold/20">
                      Grounded &amp; Explainable
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-white mb-3">{currentModule.outputTitle}</h3>
                  <div className="p-4 rounded-lg bg-velora-bg/80 border border-velora-border font-mono text-xs text-velora-text-secondary whitespace-pre-line leading-relaxed">
                    {currentModule.outputContent}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-velora-border flex flex-wrap items-center justify-between gap-2 text-[11px] text-velora-text-muted">
                  <span>Available on Web &amp; Windows Desktop App</span>
                  <Link href="/dashboard" className="btn-gold py-1.5 px-3.5 text-xs flex items-center gap-1.5">
                    <span>Start Preparing Now</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Complete 4-Stage Career Lifecycle Section */}
      <section id="career-pillars" className="py-20 px-6 border-b border-velora-border">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-12">
            <div className="text-[11px] font-mono uppercase tracking-widest text-velora-gold mb-2">
              COMPLETE CAREER LIFECYCLE
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-3">
              Every tool you need before, during, and after the interview.
            </h2>
            <p className="text-sm text-velora-text-secondary leading-relaxed">
              Your uploaded resume, job description, and knowledge base form a single unified candidate profile reused
              automatically across all modules.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                stage: '01 · PREPARE',
                title: 'Resume Intelligence & Job Match',
                items: [
                  { icon: FileText, label: 'Resume Quality & ATS Scoring' },
                  { icon: Sparkles, label: 'Approval-Gated Bullet Rewrites' },
                  { icon: Briefcase, label: 'Job Match & Likely Questions' },
                ],
                desc: 'Extract work history, technical skills, projects, and missing skills for your target role without ever fabricating credentials.',
              },
              {
                stage: '02 · PRACTICE',
                title: 'Voice AI Mock Interviews & Reports',
                items: [
                  { icon: Mic, label: '7 Interview Types (Voice + Text)' },
                  { icon: Award, label: '7-Point Evidence Rubric Reports' },
                  { icon: CheckCircle2, label: 'Objective Speech & Pace Metrics' },
                ],
                desc: 'Practice HR, Behavioral, Technical, Coding, System Design, Managerial, and Project rounds with dynamic follow-up questions.',
              },
              {
                stage: '03 · PERFORM',
                title: 'Live Copilot & Technical Assistants',
                items: [
                  { icon: Radio, label: 'Live Audio Interview Copilot' },
                  { icon: Camera, label: 'Instant Screen Scan (Ctrl+Shift+S)' },
                  { icon: Code2, label: 'Coding, SQL & System Design' },
                ],
                desc: 'Real-time spoken answers, sub-second screen question vision analysis, and dedicated Coding, SQL, and System Design assistants.',
              },
              {
                stage: '04 · IMPROVE',
                title: 'Personalized Career Learning Roadmap',
                items: [
                  { icon: Compass, label: 'Skill Gap Dashboard' },
                  { icon: Layers, label: 'Weekly Goals & Daily Tasks' },
                  { icon: Database, label: 'Curated Question Banks' },
                ],
                desc: 'Turn your resume gaps and interview performance reports into a customizable week-by-week learning roadmap.',
              },
            ].map((pillar) => (
              <div
                key={pillar.stage}
                className="p-6 rounded-xl bg-velora-surface border border-velora-border flex flex-col justify-between"
              >
                <div>
                  <span className="text-[11px] font-mono text-velora-gold uppercase tracking-wider">
                    {pillar.stage}
                  </span>
                  <h3 className="text-base font-semibold text-white mt-1.5 mb-2.5">{pillar.title}</h3>
                  <p className="text-xs text-velora-text-secondary leading-relaxed mb-4">{pillar.desc}</p>
                  <ul className="space-y-2">
                    {pillar.items.map(({ icon: Icon, label }) => (
                      <li key={label} className="flex items-center gap-2 text-xs text-white">
                        <Icon className="w-3.5 h-3.5 text-velora-gold shrink-0" />
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href="/dashboard"
                  className="mt-5 pt-3 border-t border-velora-border text-xs text-velora-gold hover:underline flex items-center justify-between"
                >
                  <span>Open in Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Desktop Copilot Highlights */}
      <section id="desktop-copilot" className="py-20 px-6 border-b border-velora-border bg-velora-surface/30">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7">
            <div className="text-[11px] font-mono uppercase tracking-widest text-velora-gold mb-2">
              WINDOWS DESKTOP FLOATING COPILOT
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-4">
              Compact floating overlay that stays with you during live interviews.
            </h2>
            <p className="text-sm text-velora-text-secondary leading-relaxed mb-6">
              While the Web &amp; Desktop main window gives you full access to Resume Intelligence, Job Match, Mock
              Interviews, Technical Assistants, and Roadmaps, the compact floating Copilot stays lightweight and
              independent.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-velora-surface border border-velora-border">
                <div className="text-xs font-semibold text-white mb-1">Show / Hide Velora Toggle (Ctrl+Shift+M)</div>
                <p className="text-xs text-velora-text-secondary">
                  Click &ldquo;Show Velora&rdquo; or &ldquo;Hide Velora&rdquo; right inside the floating Copilot header
                  to open or hide the main Velora workspace while keeping the Copilot running.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-velora-surface border border-velora-border">
                <div className="text-xs font-semibold text-white mb-1">Zero-Delay Screen Scan (Ctrl+Shift+S)</div>
                <p className="text-xs text-velora-text-secondary">
                  Instant downscaled RGB screen capture + fast vision routing analyzes coding problems, SQL schemas, or
                  multiple-choice questions on your screen in seconds.
                </p>
              </div>
            </div>
          </div>
          <div className="lg:col-span-5 p-6 rounded-xl bg-velora-surface border border-velora-border">
            <div className="flex items-center justify-between border-b border-velora-border pb-3 mb-4">
              <span className="text-xs font-semibold text-white">Global Keyboard Shortcuts</span>
              <span className="text-[11px] font-mono text-velora-gold">Customizable</span>
            </div>
            <ul className="space-y-2.5 text-xs">
              {[
                ['Ctrl+Enter', 'Answer latest interviewer question now'],
                ['Ctrl+Shift+S / Alt+S', 'Analyze question on screen (Instant Vision)'],
                ['Ctrl+Shift+M', 'Show / Hide main Velora window'],
                ['Ctrl+Shift+V', 'Show / Hide floating Copilot overlay'],
                ['Ctrl+Shift+H', 'Toggle Screen Shield / Clean Share mode'],
                ['Ctrl+Shift+A', 'Toggle Auto-Answer on interviewer pause'],
              ].map(([key, desc]) => (
                <li key={key} className="flex items-center justify-between gap-3 py-1 border-b border-velora-border/50">
                  <span className="text-velora-text-secondary">{desc}</span>
                  <kbd className="px-2 py-0.5 rounded bg-velora-bg border border-velora-border font-mono text-[11px] text-velora-gold shrink-0">
                    {key}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing Section (Preserving exact Dodo Payments tiers) */}
      <section id="pricing" className="py-20 px-6 border-b border-velora-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="text-[11px] font-mono uppercase tracking-widest text-velora-gold mb-2">
              SIMPLE, TRANSPARENT PLANS
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-3">
              Invest in your next career leap.
            </h2>
            <p className="text-sm text-velora-text-secondary">
              Every plan unlocks both the Web Career Companion Dashboard and the Windows Desktop App with Live Copilot.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`p-5 rounded-xl border flex flex-col justify-between ${
                  plan.badge === 'Most Popular'
                    ? 'bg-velora-surface border-velora-gold shadow-lg'
                    : 'bg-velora-surface/70 border-velora-border'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-white">{plan.name}</h3>
                    {plan.badge && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-velora-gold/15 text-velora-gold border border-velora-gold/30">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-xs text-velora-text-muted">{plan.period}</span>
                  </div>
                  <p className="text-xs text-velora-text-secondary mb-3">{plan.desc}</p>
                  <div className="p-2.5 rounded-lg bg-velora-bg/70 border border-velora-border text-[11px] font-mono text-velora-gold mb-4">
                    {plan.allowances}
                  </div>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-velora-text-secondary">
                        <Check className="w-3.5 h-3.5 text-velora-gold shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href="/dashboard"
                  className={`w-full py-2.5 px-3 rounded-lg text-xs font-medium text-center transition-colors ${
                    plan.badge === 'Most Popular' ? 'btn-gold' : 'btn-secondary'
                  }`}
                >
                  Choose {plan.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-velora-border text-xs text-velora-text-muted">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size="sm" href="/" />
            <span>Velora — Your AI Career Companion. Prepare smarter. Practice confidently. Perform better.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="hover:text-white transition-colors">
              Web Dashboard
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
            <a
              href="https://github.com/ishaan-pareek/Velora/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Windows Desktop
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Award, Download, Printer, ShieldAlert } from 'lucide-react';
import { ipc } from '../../lib/ipc';

interface PerformanceReport {
  id: string;
  sessionId?: string;
  role: string;
  company?: string;
  interviewType: string;
  createdAtMs: number;
  overallScore: number;
  overallAssessment: string;
  categoryScores: {
    category: string;
    score: number;
    rationale: string;
    evidenceQuote: string;
  }[];
  strongestAnswers: {
    question: string;
    candidateAnswerSummary: string;
    whyStrong: string;
  }[];
  weakestAnswers: {
    question: string;
    candidateAnswerSummary: string;
    gapIdentified: string;
    suggestedImprovedAnswer: string;
  }[];
  recommendedPracticeTopics: string[];
  improvementRoadmap: {
    step: string;
    action: string;
    timeframe: string;
  }[];
  speechMetrics?: {
    totalWords: number;
    fillerWordCount: number;
    fillerRatePer100Words: number;
    estimatedWordsPerMinute: number | null;
    averageResponseLatencyMs: number | null;
    measurementNote: string;
  };
  disclaimer: string;
}

export function ReportsPage() {
  const [reports, setReports] = useState<PerformanceReport[]>([]);
  const [selected, setSelected] = useState<PerformanceReport | null>(null);

  const load = useCallback(() => {
    ipc.getCareerStore<PerformanceReport[]>('career:reports').then((saved) => {
      if (Array.isArray(saved)) {
        setReports(saved);
        if (saved.length > 0 && !selected) setSelected(saved[0]);
      }
    }, () => {});
  }, [selected]);

  useEffect(load, [load]);

  const exportMarkdown = (r: PerformanceReport) => {
    const lines = [
      `# Velora Interview Performance Report — ${r.role}${r.company ? ` (${r.company})` : ''}`,
      `Date: ${new Date(r.createdAtMs).toLocaleString()}`,
      `Interview Type: ${r.interviewType}`,
      `Overall Score: ${r.overallScore}/10`,
      '',
      `## Executive Assessment`,
      r.overallAssessment,
      '',
      `## Category Rubric Scores`,
      ...r.categoryScores.map(
        (c) => `- **${c.category}: ${c.score}/10** — ${c.rationale}${c.evidenceQuote ? ` ("${c.evidenceQuote}")` : ''}`
      ),
      '',
      `## Strongest Answers`,
      ...r.strongestAnswers.map((s) => `- **Q:** ${s.question}\n  - **Why strong:** ${s.whyStrong}`),
      '',
      `## Areas for Improvement & Suggested Answers`,
      ...r.weakestAnswers.map(
        (w) =>
          `- **Q:** ${w.question}\n  - **Gap:** ${w.gapIdentified}\n  - **Suggested Improved Answer:** ${w.suggestedImprovedAnswer}`
      ),
      '',
      `## Personalized Improvement Roadmap`,
      ...r.improvementRoadmap.map((step) => `- **${step.step} (${step.timeframe}):** ${step.action}`),
      '',
      `---`,
      r.disclaimer,
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `velora-performance-report-${r.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Interview Performance Reports</h1>
          <p className="muted mt-1 max-w-2xl">
            Explainable, evidence-backed evaluations across technical accuracy, relevance, completeness, clarity, STAR
            methodology, and objective speech delivery metrics.
          </p>
        </div>
        {selected && (
          <div className="flex items-center gap-2">
            <button className="btn text-xs" onClick={() => exportMarkdown(selected)}>
              <Download size={14} /> Export Report (.md)
            </button>
            <button className="btn btn-primary text-xs" onClick={() => window.print()}>
              <Printer size={14} /> Print / Save as PDF
            </button>
          </div>
        )}
      </header>

      {reports.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <Award size={28} className="text-accent" />
          <div className="font-medium">No Performance Reports Yet</div>
          <p className="muted max-w-md text-xs">
            Complete an AI Mock Interview and click &ldquo;Finish &amp; Generate Report&rdquo; to receive a comprehensive
            category-by-category evaluation and improvement roadmap.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
          <ul className="card max-h-[70vh] divide-y divide-[var(--border)] overflow-y-auto">
            {reports.map((r) => (
              <li key={r.id}>
                <button
                  className={clsx('w-full px-3.5 py-3 text-left', selected?.id === r.id && 'bg-[var(--surface-2)]')}
                  onClick={() => setSelected(r)}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="truncate">{r.role}</span>
                    <span className="text-accent">{r.overallScore}/10</span>
                  </div>
                  <div className="muted mt-0.5 text-[11px]">
                    {new Date(r.createdAtMs).toLocaleDateString()} · {r.interviewType}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
                <ShieldAlert size={15} className="mt-0.5 shrink-0" />
                <span>{selected.disclaimer}</span>
              </div>

              <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex-1">
                  <div className="muted text-xs uppercase tracking-wider">Overall Evaluation</div>
                  <h2 className="mt-0.5 text-lg font-semibold">
                    {selected.role}
                    {selected.company ? ` · ${selected.company}` : ''}
                  </h2>
                  <p className="muted mt-1 text-sm">{selected.overallAssessment}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-6 py-4 text-center">
                  <div className="muted text-xs">Overall Score</div>
                  <div className="font-display text-4xl text-accent tabular-nums">{selected.overallScore}/10</div>
                </div>
              </div>

              {/* Objective Speech & Delivery Metrics */}
              {selected.speechMetrics && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Objective Transcript &amp; Delivery Metrics</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg bg-[var(--surface-2)] p-3">
                      <div className="muted text-[11px]">Total Words Spoken</div>
                      <div className="mt-0.5 text-lg font-semibold tabular-nums">{selected.speechMetrics.totalWords}</div>
                    </div>
                    <div className="rounded-lg bg-[var(--surface-2)] p-3">
                      <div className="muted text-[11px]">Filler Words Detected</div>
                      <div className="mt-0.5 text-lg font-semibold tabular-nums">
                        {selected.speechMetrics.fillerWordCount} ({selected.speechMetrics.fillerRatePer100Words}%)
                      </div>
                    </div>
                    <div className="rounded-lg bg-[var(--surface-2)] p-3">
                      <div className="muted text-[11px]">Speaking Pace</div>
                      <div className="mt-0.5 text-lg font-semibold tabular-nums">
                        {selected.speechMetrics.estimatedWordsPerMinute
                          ? `${selected.speechMetrics.estimatedWordsPerMinute} WPM`
                          : 'Text mode'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[var(--surface-2)] p-3">
                      <div className="muted text-[11px]">Avg Response Latency</div>
                      <div className="mt-0.5 text-lg font-semibold tabular-nums">
                        {selected.speechMetrics.averageResponseLatencyMs
                          ? `${(selected.speechMetrics.averageResponseLatencyMs / 1000).toFixed(1)}s`
                          : 'N/A'}
                      </div>
                    </div>
                  </div>
                  <p className="muted mt-2 text-[11px]">{selected.speechMetrics.measurementNote}</p>
                </div>
              )}

              {/* Category Rubric Scores */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold">Category-Wise Evaluation</h3>
                <div className="mt-3 divide-y divide-[var(--border)]">
                  {selected.categoryScores.map((c, i) => (
                    <div key={i} className="py-3">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>{c.category}</span>
                        <span className="font-mono text-accent">{c.score}/10</span>
                      </div>
                      <p className="muted mt-1 text-xs">{c.rationale}</p>
                      {c.evidenceQuote && (
                        <blockquote className="mt-1 border-l-2 border-[var(--color-accent)] pl-2.5 text-[11px] italic opacity-85">
                          &ldquo;{c.evidenceQuote}&rdquo;
                        </blockquote>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Weakest Answers & Suggested Improvements */}
              {selected.weakestAnswers.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Answers to Improve &amp; Model Rewrites</h3>
                  <div className="mt-3 divide-y divide-[var(--border)]">
                    {selected.weakestAnswers.map((w, i) => (
                      <div key={i} className="flex flex-col gap-2 py-3.5 text-xs">
                        <div className="font-semibold text-sm">{w.question}</div>
                        <div className="muted">
                          <strong>Gap identified:</strong> {w.gapIdentified}
                        </div>
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                          <div className="font-semibold text-emerald-300">Suggested Improved Answer</div>
                          <p className="mt-1 leading-relaxed">{w.suggestedImprovedAnswer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Improvement Roadmap */}
              {selected.improvementRoadmap.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold">Personalized Improvement Roadmap</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {selected.improvementRoadmap.map((step, i) => (
                      <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
                        <div className="flex items-center justify-between font-semibold">
                          <span>{step.step}</span>
                          <span className="text-accent">{step.timeframe}</span>
                        </div>
                        <p className="muted mt-1">{step.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

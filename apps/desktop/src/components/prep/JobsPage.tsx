import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';
import {
  Briefcase,
  CheckCircle2,
  FileUp,
  Loader2,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import type { Job } from '../../types';

type Draft = { id: string | null; title: string; company: string; description: string };
const EMPTY: Draft = { id: null, title: '', company: '', description: '' };

interface JobMatchResult {
  jobProfile: {
    jobTitle: string;
    company: string;
    seniority: string;
    experienceRequirements: string[];
    requiredSkills: string[];
    preferredSkills: string[];
    technicalRequirements: string[];
    responsibilities: string[];
  };
  matchAssessment: {
    alignmentScore: number;
    alignmentLabel: 'Strong Alignment' | 'Moderate Alignment' | 'Developing Alignment' | 'Exploratory Fit';
    compatibilitySummary: string;
    matchedSkills: string[];
    missingSkills: string[];
    experienceGaps: string[];
    disclaimer: string;
  };
  interviewDifficulty: {
    level: 'Foundational' | 'Intermediate' | 'Advanced' | 'Staff / Principal';
    rationale: string;
    expectedRounds: string[];
  };
  likelyInterviewQuestions: {
    question: string;
    category: string;
    whyAsked: string;
    prepTip: string;
  }[];
  preparationRecommendations: string[];
}

export function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [matchesByJobId, setMatchesByJobId] = useState<Record<string, JobMatchResult>>({});
  const settings = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);

  const load = useCallback(() => {
    ipc.listJobs().then(setJobs, (e: Error) => setError(e.message));
    ipc.getCareerStore<Record<string, JobMatchResult>>('career:job_matches').then((saved) => {
      if (saved && typeof saved === 'object') setMatchesByJobId(saved);
    }, () => {});
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const job = await ipc.saveJob(draft);
      setDraft({ ...draft, id: job.id });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const analyzeJobMatch = async () => {
    if (!draft || draft.description.trim().length < 30) {
      setError('Paste or import a job description (at least 30 characters) to run Job Match Analysis.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      let currentId = draft.id;
      if (!currentId && draft.title.trim()) {
        const savedJob = await ipc.saveJob(draft);
        currentId = savedJob.id;
        setDraft({ ...draft, id: currentId });
        load();
      }
      const [resume, profile] = await Promise.all([
        ipc.getResume().catch(() => null),
        ipc.getProfile().catch(() => ({ facts: [] })),
      ]);
      const resumeText = [
        resume?.text || resume?.preview || '',
        ...profile.facts.map((f) => f.text),
      ]
        .filter(Boolean)
        .join('\n');

      const result = await ipc.careerApiPost<JobMatchResult>('/api/career/jobs/analyze', {
        jobTitle: draft.title || undefined,
        company: draft.company || undefined,
        jobDescription: draft.description,
        resumeText: resumeText || undefined,
      });

      const key = currentId || 'draft';
      const nextMap = { ...matchesByJobId, [key]: result };
      setMatchesByJobId(nextMap);
      await ipc.saveCareerStore('career:job_matches', nextMap);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const remove = async (job: Job) => {
    if (!window.confirm(`Delete "${job.title}"? Practice sessions for it are kept.`)) return;
    await ipc.deleteJob(job.id);
    if (draft?.id === job.id) setDraft(null);
    load();
  };

  const importDescription = async () => {
    const path = await open({ multiple: false, filters: [{ name: 'Job description', extensions: ['pdf', 'docx', 'txt', 'md'] }] });
    if (typeof path !== 'string' || !draft) return;
    try {
      setDraft({ ...draft, description: await ipc.readDocument(path) });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const currentMatch = draft ? matchesByJobId[draft.id || 'draft'] : null;
  const isActiveCopilotJob = Boolean(draft?.id && settings?.copilot.jobId === draft.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Job Match Analyzer &amp; Context</h1>
          <p className="muted mt-1">
            Paste or upload a job description to analyze skill alignment, interview difficulty, and likely questions.
            Shared automatically with Mock Interviews and Live Copilot.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setDraft(EMPTY)}>
          <Plus size={15} /> Add job
        </button>
      </header>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="grid grid-cols-[260px_1fr] gap-4">
        <ul className="card max-h-[65vh] divide-y divide-[var(--border)] overflow-y-auto">
          {jobs?.length === 0 && <li className="muted p-4 text-sm">No jobs yet.</li>}
          {jobs?.map((j) => (
            <li key={j.id} className="flex items-center">
              <button
                className={clsx('flex-1 px-3 py-2.5 text-left', draft?.id === j.id && 'bg-[var(--surface-2)]')}
                onClick={() => setDraft({ id: j.id, title: j.title, company: j.company, description: j.description })}
              >
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{j.title}</span>
                  {settings?.copilot.jobId === j.id && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">Active</span>
                  )}
                </div>
                {j.company && <div className="muted text-xs">{j.company}</div>}
              </button>
              <button className="muted p-3 hover:text-red-400" aria-label="Delete job" onClick={() => remove(j)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>

        {draft ? (
          <div className="flex flex-col gap-4">
            <div className="card flex flex-col gap-3 p-5">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Job title
                  <input className="field mt-1" value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </label>
                <label className="text-sm">
                  Company
                  <input className="field mt-1" value={draft.company} maxLength={200} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
                </label>
              </div>
              <label className="text-sm">
                <span className="flex items-center justify-between">
                  Job description
                  <button className="btn py-1 text-xs" onClick={importDescription}>
                    <FileUp size={12} /> From file
                  </button>
                </span>
                <textarea
                  className="field mt-1 min-h-48"
                  value={draft.description}
                  maxLength={15000}
                  placeholder="Paste the job description"
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-primary" onClick={save} disabled={saving || !draft.title.trim()}>
                  {saving ? 'Saving…' : 'Save job'}
                </button>
                <button
                  className="btn"
                  onClick={analyzeJobMatch}
                  disabled={analyzing || draft.description.trim().length < 30}
                >
                  {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {analyzing ? 'Analyzing Match…' : 'Analyze Job Match'}
                </button>
                {draft.id && settings && (
                  <button
                    className="btn ml-auto text-xs"
                    disabled={isActiveCopilotJob}
                    onClick={() =>
                      saveSettings({
                        ...settings,
                        copilot: { ...settings.copilot, jobId: draft.id },
                      })
                    }
                  >
                    <CheckCircle2 size={13} className={isActiveCopilotJob ? 'text-emerald-400' : undefined} />
                    {isActiveCopilotJob ? 'Active in Copilot' : 'Use in Live Copilot'}
                  </button>
                )}
              </div>
            </div>

            {currentMatch && (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
                  <ShieldAlert size={15} className="mt-0.5 shrink-0" />
                  <span>{currentMatch.matchAssessment.disclaimer}</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="card p-4">
                    <div className="muted text-xs">Requirement Alignment</div>
                    <div className="font-display mt-1 text-3xl text-accent tabular-nums">
                      {currentMatch.matchAssessment.alignmentScore}%
                    </div>
                    <div className="mt-0.5 text-xs font-medium">{currentMatch.matchAssessment.alignmentLabel}</div>
                  </div>
                  <div className="card p-4">
                    <div className="muted text-xs">Target Seniority</div>
                    <div className="mt-1 text-base font-semibold">{currentMatch.jobProfile.seniority}</div>
                    <div className="muted mt-0.5 text-xs">{currentMatch.jobProfile.jobTitle}</div>
                  </div>
                  <div className="card p-4">
                    <div className="muted text-xs">Interview Difficulty</div>
                    <div className="mt-1 text-base font-semibold">{currentMatch.interviewDifficulty.level}</div>
                    <div className="muted mt-0.5 text-xs">{currentMatch.interviewDifficulty.rationale}</div>
                  </div>
                </div>

                <div className="card flex flex-col gap-3 p-5">
                  <h2 className="text-sm font-semibold">Compatibility Summary</h2>
                  <p className="muted text-sm">{currentMatch.matchAssessment.compatibilitySummary}</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold text-emerald-400">
                        Matched Skills ({currentMatch.matchAssessment.matchedSkills.length})
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {currentMatch.matchAssessment.matchedSkills.map((s) => (
                          <span key={s} className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-amber-400">
                        Missing / Gap Skills ({currentMatch.matchAssessment.missingSkills.length})
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {currentMatch.matchAssessment.missingSkills.map((s) => (
                          <span key={s} className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {currentMatch.likelyInterviewQuestions.length > 0 && (
                  <div className="card flex flex-col gap-3 p-5">
                    <h2 className="text-sm font-semibold">
                      Likely Interview Questions ({currentMatch.likelyInterviewQuestions.length})
                    </h2>
                    <div className="divide-y divide-[var(--border)]">
                      {currentMatch.likelyInterviewQuestions.map((q, idx) => (
                        <div key={idx} className="py-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{q.question}</span>
                            <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[11px]">{q.category}</span>
                          </div>
                          <p className="muted mt-1 text-xs">
                            <strong>Why asked:</strong> {q.whyAsked}
                          </p>
                          <p className="mt-0.5 text-xs text-accent">
                            <strong>Prep tip:</strong> {q.prepTip}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentMatch.preparationRecommendations.length > 0 && (
                  <div className="card p-5">
                    <h2 className="text-sm font-semibold">Preparation Recommendations</h2>
                    <ul className="muted mt-2 list-disc space-y-1 pl-4 text-xs">
                      {currentMatch.preparationRecommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
            <Briefcase size={24} className="text-accent" />
            <p className="muted text-sm">Select a job or add a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}

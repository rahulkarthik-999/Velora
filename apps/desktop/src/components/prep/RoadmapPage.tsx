import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, Circle, Compass, Loader2, Plus, Sparkles } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import type { Job } from '../../types';

interface RoadmapTopic {
  id: string;
  title: string;
  category: string;
  priority: 'High' | 'Medium' | 'Foundational';
  whyItMatters: string;
  keyConcepts: string[];
  technicalExercise: string;
  practiceQuestions: string[];
  estimatedHours: number;
}

interface CareerRoadmap {
  roadmapTitle: string;
  targetRole: string;
  executiveSummary: string;
  skillGapAnalysis: {
    skill: string;
    currentLevel: string;
    targetLevel: string;
    closingStrategy: string;
  }[];
  learningPaths: RoadmapTopic[];
  weeklyGoals: {
    week: number;
    theme: string;
    objectives: string[];
    deliverable: string;
  }[];
  dailyPracticeTasks: {
    dayLabel: string;
    taskTitle: string;
    category: string;
    durationMinutes: number;
  }[];
  recommendedMockInterviews: {
    interviewType: string;
    focusArea: string;
    whenToTake: string;
  }[];
  suggestedNextActions: string[];
  completedTopicIds?: string[];
  completedTaskLabels?: string[];
}

export function RoadmapPage() {
  const setPage = useApp((s) => s.setPage);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [targetRole, setTargetRole] = useState('Senior Full-Stack Engineer');
  const [weeksAvailable, setWeeksAvailable] = useState(4);
  const [userGoals, setUserGoals] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roadmap, setRoadmap] = useState<CareerRoadmap | null>(null);
  const [customTopicTitle, setCustomTopicTitle] = useState('');

  const load = useCallback(() => {
    ipc.listJobs().then((list) => {
      setJobs(list);
      if (list.length > 0 && !selectedJobId) {
        setSelectedJobId(list[0].id);
        setTargetRole(list[0].title);
      }
    }, () => {});
    ipc.getCareerStore<CareerRoadmap>('career:roadmap').then((saved) => {
      if (saved) setRoadmap(saved);
    }, () => {});
  }, [selectedJobId]);

  useEffect(load, [load]);

  const saveRoadmap = async (next: CareerRoadmap) => {
    setRoadmap(next);
    await ipc.saveCareerStore('career:roadmap', next);
  };

  const generateRoadmap = async () => {
    setBusy(true);
    setError(null);
    try {
      const [resume, profile, reports] = await Promise.all([
        ipc.getResume().catch(() => null),
        ipc.getProfile().catch(() => ({ facts: [], profile: null })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ipc.getCareerStore<any[]>('career:reports').catch(() => []),
      ]);
      const resumeContext = [resume?.text || resume?.preview || '', ...profile.facts.map((f) => f.text)].filter(Boolean).join('\n');
      const selectedJob = jobs.find((j) => j.id === selectedJobId);
      const recentReportSummary =
        Array.isArray(reports) && reports[0]
          ? `Overall ${reports[0].overallScore}/10: ${reports[0].overallAssessment}`
          : undefined;

      const res = await ipc.careerApiPost<CareerRoadmap>('/api/career/roadmap/generate', {
        targetRole: targetRole.trim() || 'Software Engineer',
        currentSkills: profile.profile?.skills || [],
        missingSkills: [],
        resumeText: resumeContext || undefined,
        jobDescription: selectedJob?.description || undefined,
        recentReportSummary,
        userGoals: userGoals.trim() || undefined,
        weeksAvailable,
      });

      const enriched: CareerRoadmap = {
        ...res,
        completedTopicIds: [],
        completedTaskLabels: [],
      };
      await saveRoadmap(enriched);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleTopicComplete = (id: string) => {
    if (!roadmap) return;
    const setIds = new Set(roadmap.completedTopicIds || []);
    if (setIds.has(id)) setIds.delete(id);
    else setIds.add(id);
    saveRoadmap({ ...roadmap, completedTopicIds: Array.from(setIds) });
  };

  const toggleTaskComplete = (label: string) => {
    if (!roadmap) return;
    const setLabels = new Set(roadmap.completedTaskLabels || []);
    if (setLabels.has(label)) setLabels.delete(label);
    else setLabels.add(label);
    saveRoadmap({ ...roadmap, completedTaskLabels: Array.from(setLabels) });
  };

  const addCustomTopic = () => {
    if (!roadmap || !customTopicTitle.trim()) return;
    const newTopic: RoadmapTopic = {
      id: `custom-${Date.now()}`,
      title: customTopicTitle.trim(),
      category: 'Custom Goal',
      priority: 'High',
      whyItMatters: 'Added by you to customize your preparation plan.',
      keyConcepts: [],
      technicalExercise: 'Practice and document a hands-on example.',
      practiceQuestions: [],
      estimatedHours: 3,
    };
    setCustomTopicTitle('');
    saveRoadmap({
      ...roadmap,
      learningPaths: [newTopic, ...roadmap.learningPaths],
    });
  };

  const completedCount = roadmap?.completedTopicIds?.length ?? 0;
  const totalTopics = roadmap?.learningPaths?.length ?? 0;
  const progressPct = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Career Learning Roadmap &amp; Skill Gaps</h1>
          <p className="muted mt-1 max-w-2xl">
            Personalized learning paths, weekly milestones, daily practice tasks, and technical exercises built from
            your resume, target job description, and interview performance reports.
          </p>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {error}
        </p>
      )}

      <section className="card flex flex-col gap-3 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            Target Role
            <input className="field mt-1" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} />
          </label>
          <label className="text-xs">
            Ground in Saved Job
            <select
              className="field mt-1"
              value={selectedJobId}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                const found = jobs.find((j) => j.id === e.target.value);
                if (found) setTargetRole(found.title);
              }}
            >
              <option value="">General role</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                  {j.company ? ` (${j.company})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Prep Horizon (Weeks)
            <select
              className="field mt-1"
              value={weeksAvailable}
              onChange={(e) => setWeeksAvailable(Number(e.target.value))}
            >
              {[2, 4, 6, 8, 12].map((w) => (
                <option key={w} value={w}>
                  {w} weeks
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="field flex-1 text-xs"
            placeholder="Optional personal goals (e.g. Master distributed systems, sharpen STAR leadership stories, learn PostgreSQL internals)"
            value={userGoals}
            onChange={(e) => setUserGoals(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy || !targetRole.trim()} onClick={generateRoadmap}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? 'Building Personalized Roadmap…' : roadmap ? 'Regenerate Roadmap' : 'Generate Learning Roadmap'}
          </button>
        </div>
      </section>

      {!roadmap ? (
        <div className="card flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Compass size={28} className="text-accent" />
          <div className="font-medium">Build Your Personalized Career Roadmap</div>
          <p className="muted max-w-md text-xs">
            Click &ldquo;Generate Learning Roadmap&rdquo; above to synthesize your resume, job description, and mock
            interview reports into a structured week-by-week plan.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Progress Header */}
          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex-1">
              <div className="text-xs font-semibold uppercase text-accent">{roadmap.targetRole}</div>
              <h2 className="mt-0.5 text-lg font-semibold">{roadmap.roadmapTitle}</h2>
              <p className="muted mt-1 text-xs">{roadmap.executiveSummary}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-center">
              <div className="muted text-xs">Topics Completed</div>
              <div className="font-display text-3xl text-accent tabular-nums">
                {completedCount}/{totalTopics} ({progressPct}%)
              </div>
            </div>
          </div>

          {/* Skill Gap Dashboard */}
          {roadmap.skillGapAnalysis?.length > 0 && (
            <section className="card p-5">
              <h3 className="text-sm font-semibold">Skill Gap Dashboard</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {roadmap.skillGapAnalysis.map((gap, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3.5 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span>{gap.skill}</span>
                      <span className="text-accent">
                        {gap.currentLevel} → {gap.targetLevel}
                      </span>
                    </div>
                    <p className="muted mt-1">{gap.closingStrategy}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Topic-wise Learning Paths */}
          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Topic-Wise Learning Paths ({roadmap.learningPaths.length})</h3>
              <div className="flex gap-2">
                <input
                  className="field w-56 py-1 text-xs"
                  placeholder="Add custom topic..."
                  value={customTopicTitle}
                  onChange={(e) => setCustomTopicTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomTopic()}
                />
                <button className="btn py-1 text-xs" onClick={addCustomTopic} disabled={!customTopicTitle.trim()}>
                  <Plus size={13} /> Add Topic
                </button>
              </div>
            </div>

            <div className="mt-3 divide-y divide-[var(--border)]">
              {roadmap.learningPaths.map((topic) => {
                const done = roadmap.completedTopicIds?.includes(topic.id) ?? false;
                return (
                  <div key={topic.id} className="py-3.5">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleTopicComplete(topic.id)}
                        className="mt-0.5 text-accent"
                        aria-label={`Mark ${topic.title} complete`}
                      >
                        {done ? <CheckCircle2 size={18} className="text-emerald-400" /> : <Circle size={18} />}
                      </button>
                      <div className="flex-1 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={clsx('text-sm font-semibold', done && 'line-through opacity-60')}>
                            {topic.title}
                          </span>
                          <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px]">
                            {topic.category}
                          </span>
                          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                            {topic.priority} Priority · ~{topic.estimatedHours}h
                          </span>
                        </div>
                        <p className="muted mt-1">{topic.whyItMatters}</p>
                        {topic.keyConcepts?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {topic.keyConcepts.map((c) => (
                              <span key={c} className="rounded bg-black/30 px-2 py-0.5 text-[11px]">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 rounded bg-[var(--surface-2)] p-2.5">
                          <strong>Hands-on Exercise:</strong> {topic.technicalExercise}
                        </div>
                        {topic.practiceQuestions?.length > 0 && (
                          <div className="mt-2">
                            <div className="font-semibold text-accent">Interview Question Bank:</div>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4">
                              {topic.practiceQuestions.map((q, qi) => (
                                <li key={qi}>{q}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Weekly Goals & Daily Practice Tasks */}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="card p-5">
              <h3 className="text-sm font-semibold">Weekly Learning Goals</h3>
              <div className="mt-3 divide-y divide-[var(--border)] text-xs">
                {roadmap.weeklyGoals?.map((w) => (
                  <div key={w.week} className="py-2.5">
                    <div className="font-semibold text-accent">
                      Week {w.week}: {w.theme}
                    </div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {w.objectives.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                    <div className="muted mt-1">
                      <strong>Deliverable:</strong> {w.deliverable}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-5">
              <h3 className="text-sm font-semibold">Daily Practice Tasks &amp; Recommended Mock Interviews</h3>
              <div className="mt-2 divide-y divide-[var(--border)] text-xs">
                {roadmap.dailyPracticeTasks?.map((t, i) => {
                  const key = `${t.dayLabel}-${t.taskTitle}`;
                  const done = roadmap.completedTaskLabels?.includes(key) ?? false;
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleTaskComplete(key)}
                        className="flex items-center gap-2 text-left"
                      >
                        {done ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Circle size={14} />}
                        <span className={clsx(done && 'line-through opacity-60')}>
                          <strong>{t.dayLabel}:</strong> {t.taskTitle}
                        </span>
                      </button>
                      <span className="muted shrink-0">{t.durationMinutes}m</span>
                    </div>
                  );
                })}
              </div>
              {roadmap.recommendedMockInterviews?.length > 0 && (
                <div className="mt-4 border-t border-[var(--border)] pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Recommended Mock Interviews</span>
                    <button className="btn py-1 text-xs" onClick={() => setPage('mock')}>
                      Start Mock Interview
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {roadmap.recommendedMockInterviews.map((m, i) => (
                      <li key={i} className="rounded bg-[var(--surface-2)] px-2.5 py-1.5">
                        <strong>{m.interviewType}:</strong> {m.focusArea} ({m.whenToTake})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

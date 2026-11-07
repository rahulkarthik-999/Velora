import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Check,
  CheckCircle2,
  Download,
  FileText,
  History,
  Loader2,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { ipc } from '../../lib/ipc';
import type { CandidateFact, FactKind, Job, ProfileView, ResumeInfo } from '../../types';

const KIND_LABEL: Record<FactKind, string> = {
  experience: 'Experience',
  project: 'Project',
  skill: 'Skills',
  education: 'Education',
  other: 'Added by you',
};

interface BulletImprovement {
  section: string;
  original: string;
  improved: string;
  reason: string;
  editedText?: string;
  approved?: boolean;
}

interface ResumeAnalysisResult {
  candidateProfile: {
    headline: string;
    summary: string;
    yearsOfExperience: string;
    technicalSkills: string[];
    softSkills: string[];
    workExperience: { role: string; company: string; period: string; highlights: string[] }[];
    education: { degree: string; institution: string; year: string }[];
    projects: { name: string; description: string; technologies: string[] }[];
    achievements: string[];
  };
  qualityAnalysis: {
    overallScore: number;
    atsCompatibilityScore: number;
    impactScore: number;
    clarityScore: number;
    completenessScore: number;
    executiveSummary: string;
    strengths: string[];
    improvementAreas: string[];
  };
  missingSkills: string[];
  improvedSummary: string;
  bulletImprovements: BulletImprovement[];
  atsFormattingSuggestions: string[];
  disclaimer: string;
}

interface ResumeVersionEntry {
  id: string;
  label: string;
  fileName: string;
  text: string;
  createdAtMs: number;
  overallScore?: number;
}

function FactRow({ fact, onChange }: { fact: CandidateFact; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fact.text);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      await ipc.saveFact(fact.id, fact.kind, text);
      setEditing(false);
      setError(null);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <li className="group flex items-start gap-3 py-2">
      <span className="muted w-24 shrink-0 pt-0.5 text-xs">{KIND_LABEL[fact.kind]}</span>
      <div className="flex-1 text-sm">
        {editing ? (
          <>
            <textarea className="field" rows={2} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="mt-1 flex gap-2">
              <button className="btn py-1 text-xs" onClick={save}>
                Save
              </button>
              <button
                className="btn py-1 text-xs"
                onClick={() => {
                  setText(fact.text);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button className="text-left" onClick={() => setEditing(true)} title="Click to edit">
            {fact.text}
          </button>
        )}
      </div>
      <button
        className="muted opacity-0 group-hover:opacity-100 hover:text-red-400"
        aria-label="Delete fact"
        onClick={async () => {
          await ipc.deleteFact(fact.id);
          onChange();
        }}
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

export function ResumePage() {
  const [resume, setResume] = useState<ResumeInfo | null | undefined>(undefined);
  const [view, setView] = useState<ProfileView | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [busy, setBusy] = useState<'import' | 'extract' | 'analyze' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newFact, setNewFact] = useState('');
  const [analysis, setAnalysis] = useState<ResumeAnalysisResult | null>(null);
  const [editableSummary, setEditableSummary] = useState('');
  const [summaryApproved, setSummaryApproved] = useState(false);
  const [bullets, setBullets] = useState<BulletImprovement[]>([]);
  const [versions, setVersions] = useState<ResumeVersionEntry[]>([]);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const load = useCallback(() => {
    ipc.getResume().then(setResume, (e: Error) => setError(e.message));
    ipc.getProfile().then(setView, (e: Error) => setError(e.message));
    ipc.listJobs().then(setJobs, () => {});
    ipc.getCareerStore<ResumeAnalysisResult>('career:resume_analysis').then((saved) => {
      if (saved) {
        setAnalysis(saved);
        setEditableSummary(saved.improvedSummary || '');
        setBullets(
          (saved.bulletImprovements || []).map((b) => ({
            ...b,
            editedText: b.editedText ?? b.improved,
            approved: Boolean(b.approved),
          }))
        );
      }
    }, () => {});
    ipc.getCareerStore<ResumeVersionEntry[]>('career:resume_versions').then((v) => {
      if (Array.isArray(v)) setVersions(v);
    }, () => {});
  }, []);

  useEffect(load, [load]);

  const run = async (kind: 'import' | 'extract' | 'analyze', fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const importFile = async () => {
    const path = await open({ multiple: false, filters: [{ name: 'Resume', extensions: ['pdf', 'docx', 'txt', 'md'] }] });
    if (typeof path === 'string') {
      await run('import', async () => {
        const imported = await ipc.importResume(path);
        const rawText = await ipc.readDocument(path).catch(() => imported.preview);
        const nextVersions: ResumeVersionEntry[] = [
          {
            id: `v-${Date.now()}`,
            label: `Imported (${imported.fileName})`,
            fileName: imported.fileName,
            text: rawText,
            createdAtMs: Date.now(),
          },
          ...versions.slice(0, 14),
        ];
        setVersions(nextVersions);
        await ipc.saveCareerStore('career:resume_versions', nextVersions);
      });
    }
  };

  const savePastedResume = () =>
    run('import', async () => {
      const info = await ipc.saveResumeText('pasted-resume.txt', pasteText);
      const nextVersions: ResumeVersionEntry[] = [
        {
          id: `v-${Date.now()}`,
          label: 'Pasted Resume',
          fileName: info.fileName,
          text: pasteText,
          createdAtMs: Date.now(),
        },
        ...versions.slice(0, 14),
      ];
      setVersions(nextVersions);
      await ipc.saveCareerStore('career:resume_versions', nextVersions);
      setPasteMode(false);
      setPasteText('');
    });

  const runDeepAnalysis = () =>
    run('analyze', async () => {
      const latestVersionText = versions[0]?.text || resume?.text || resume?.preview || '';
      if (!latestVersionText || latestVersionText.trim().length < 40) {
        throw new Error('Import or paste your full resume text (at least 40 characters) before running Resume Intelligence.');
      }
      const targetJob = jobs.find((j) => j.id === selectedJobId);
      const res = await ipc.careerApiPost<ResumeAnalysisResult & { creditsRemaining?: number | null }>(
        '/api/career/resume/analyze',
        {
          resumeText: latestVersionText,
          targetRole: targetJob?.title || undefined,
          jobDescription: targetJob?.description || undefined,
        }
      );
      setAnalysis(res);
      setEditableSummary(res.improvedSummary || '');
      setSummaryApproved(false);
      const mappedBullets = (res.bulletImprovements || []).map((b) => ({
        ...b,
        editedText: b.improved,
        approved: false,
      }));
      setBullets(mappedBullets);
      await ipc.saveCareerStore('career:resume_analysis', {
        ...res,
        bulletImprovements: mappedBullets,
      });
    });

  const applyApprovedImprovements = async () => {
    if (!analysis) return;
    setError(null);
    try {
      let baseText = versions[0]?.text || resume?.text || resume?.preview || '';
      const approvedBullets = bullets.filter((b) => b.approved && (b.editedText || b.improved));
      for (const b of approvedBullets) {
        if (baseText.includes(b.original)) {
          baseText = baseText.replace(b.original, b.editedText || b.improved);
        } else {
          baseText += `\n• ${b.editedText || b.improved}`;
        }
      }
      if (summaryApproved && editableSummary.trim()) {
        baseText = `PROFESSIONAL SUMMARY\n${editableSummary.trim()}\n\n${baseText}`;
      }
      const fileName = resume?.fileName ? `improved-${resume.fileName}` : 'improved-resume.txt';
      await ipc.saveResumeText(fileName, baseText);
      const newVersion: ResumeVersionEntry = {
        id: `v-${Date.now()}`,
        label: `Approved Edits (${approvedBullets.length} bullets${summaryApproved ? ' + summary' : ''})`,
        fileName,
        text: baseText,
        createdAtMs: Date.now(),
        overallScore: analysis.qualityAnalysis.overallScore,
      };
      const nextVersions = [newVersion, ...versions.slice(0, 14)];
      setVersions(nextVersions);
      await ipc.saveCareerStore('career:resume_versions', nextVersions);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const exportResume = () => {
    const textToExport = versions[0]?.text || resume?.text || resume?.preview || '';
    if (!textToExport) return;
    const blob = new Blob([textToExport], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = resume?.fileName?.replace(/\.[^.]+$/, '-improved.txt') || 'velora-improved-resume.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const addFact = () =>
    run('extract', async () => {
      await ipc.saveFact(null, 'other', newFact);
      setNewFact('');
    });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Resume Intelligence</h1>
          <p className="muted mt-1 max-w-2xl">
            Upload your PDF, DOCX, or TXT resume to extract structured experience, evaluate ATS &amp; impact quality,
            identify missing skills, and review editable bullet improvements — grounded strictly in your real background.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn text-xs" onClick={() => setPasteMode((p) => !p)}>
            {pasteMode ? 'Close paste editor' : 'Paste resume text'}
          </button>
          {(versions.length > 0 || resume) && (
            <button className="btn text-xs" onClick={exportResume}>
              <Download size={14} /> Export resume
            </button>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {error}
        </p>
      )}

      {pasteMode && (
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-semibold">Paste or edit full resume text</h2>
          <textarea
            className="field min-h-48 text-xs"
            placeholder="Paste your complete resume text here..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary text-xs" disabled={pasteText.trim().length < 40 || !!busy} onClick={savePastedResume}>
              Save resume text
            </button>
            <button className="btn text-xs" onClick={() => setPasteMode(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="card flex flex-wrap items-center gap-4 p-5">
        <FileText size={22} className="text-accent" />
        <div className="min-w-[200px] flex-1">
          {resume ? (
            <>
              <div className="font-medium">{resume.fileName}</div>
              <div className="muted text-xs">
                {resume.chars.toLocaleString()} characters · imported {new Date(resume.importedAtMs).toLocaleDateString()}
              </div>
            </>
          ) : (
            <div className="muted">{resume === undefined ? 'Loading…' : 'No resume imported yet (PDF, DOCX or TXT).'}</div>
          )}
        </div>
        <select
          className="field w-auto py-1.5 text-xs"
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          aria-label="Target job for resume analysis"
        >
          <option value="">General target role</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
              {j.company ? ` (${j.company})` : ''}
            </option>
          ))}
        </select>
        <button className="btn" onClick={importFile} disabled={!!busy}>
          {busy === 'import' ? <Loader2 size={14} className="animate-spin" /> : null}
          {resume ? 'Replace' : 'Import resume'}
        </button>
        <button
          className="btn"
          disabled={!resume || !!busy}
          onClick={() => run('extract', ipc.extractProfile)}
          title="Uses 1 AI credit"
        >
          {busy === 'extract' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {view?.profile ? 'Re-extract facts' : 'Extract facts'}
        </button>
        <button
          className="btn btn-primary"
          disabled={!resume || !!busy}
          onClick={runDeepAnalysis}
          title="Full quality, ATS, skill gap & bullet improvement analysis"
        >
          {busy === 'analyze' ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          Analyze &amp; Improve Resume
        </button>
      </section>

      {analysis && (
        <div className="flex flex-col gap-5">
          {/* Scorecards */}
          <section className="grid gap-3 sm:grid-cols-5">
            {[
              ['Overall Quality', analysis.qualityAnalysis.overallScore],
              ['ATS Compatibility', analysis.qualityAnalysis.atsCompatibilityScore],
              ['Impact & Metrics', analysis.qualityAnalysis.impactScore],
              ['Clarity & Tone', analysis.qualityAnalysis.clarityScore],
              ['Completeness', analysis.qualityAnalysis.completenessScore],
            ].map(([label, score]) => (
              <div key={label as string} className="card p-4">
                <div className="muted text-xs">{label}</div>
                <div className="font-display mt-1 text-3xl text-accent tabular-nums">{score as number}/100</div>
              </div>
            ))}
          </section>

          {/* Guardrail Banner */}
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              <strong>Non-Fabrication Guarantee:</strong> {analysis.disclaimer}
            </span>
          </div>

          {/* Executive Summary & Missing Skills */}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="card flex flex-col gap-2.5 p-5">
              <h2 className="text-sm font-semibold">Quality &amp; Impact Assessment</h2>
              <p className="muted text-sm">{analysis.qualityAnalysis.executiveSummary}</p>
              {analysis.qualityAnalysis.strengths.length > 0 && (
                <div className="mt-1">
                  <div className="text-xs font-semibold text-emerald-400">Key Strengths</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                    {analysis.qualityAnalysis.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.qualityAnalysis.improvementAreas.length > 0 && (
                <div className="mt-1">
                  <div className="text-xs font-semibold text-amber-400">Priority Improvements</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                    {analysis.qualityAnalysis.improvementAreas.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="card flex flex-col gap-3 p-5">
              <div>
                <h2 className="text-sm font-semibold">Extracted Technical Skills</h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {analysis.candidateProfile.technicalSkills.map((skill) => (
                    <span key={skill} className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
              {analysis.missingSkills.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-amber-400">Missing / Recommended Skills for Target Role</h3>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {analysis.missingSkills.map((skill) => (
                      <span key={skill} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                        + {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {analysis.atsFormattingSuggestions.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold">ATS Formatting Suggestions</h3>
                  <ul className="muted mt-1 list-disc space-y-1 pl-4 text-xs">
                    {analysis.atsFormattingSuggestions.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Editable Professional Summary */}
          <section className="card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Suggested Professional Summary (Editable)</h2>
                <p className="muted text-xs">Edit and approve to include at the top of your improved resume.</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  className="accent-[var(--color-accent)]"
                  checked={summaryApproved}
                  onChange={(e) => setSummaryApproved(e.target.checked)}
                />
                Approve summary
              </label>
            </div>
            <textarea
              className="field min-h-20 text-sm"
              value={editableSummary}
              onChange={(e) => setEditableSummary(e.target.value)}
            />
          </section>

          {/* Editable Experience Bullet Improvements */}
          {bullets.length > 0 && (
            <section className="card flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Experience Bullet Improvements ({bullets.length})</h2>
                  <p className="muted text-xs">
                    Review, customize, and check &ldquo;Approve&rdquo; on any bullet before applying to your resume.
                  </p>
                </div>
                <button
                  className="btn btn-primary text-xs"
                  disabled={!summaryApproved && !bullets.some((b) => b.approved)}
                  onClick={applyApprovedImprovements}
                >
                  <CheckCircle2 size={14} /> Apply approved edits to resume
                </button>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {bullets.map((b, idx) => (
                  <div key={idx} className="flex flex-col gap-2 py-3.5">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium">
                        {b.section}
                      </span>
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                        <input
                          type="checkbox"
                          className="accent-[var(--color-accent)]"
                          checked={Boolean(b.approved)}
                          onChange={(e) => {
                            const next = bullets.slice();
                            next[idx] = { ...b, approved: e.target.checked };
                            setBullets(next);
                          }}
                        />
                        {b.approved ? <span className="text-emerald-400">Approved</span> : 'Approve edit'}
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 p-3 text-xs">
                        <div className="muted mb-1 font-semibold uppercase">Original</div>
                        <p>{b.original}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="text-[11px] font-semibold uppercase text-accent">Improved (Editable)</div>
                        <textarea
                          className="field min-h-16 text-xs"
                          value={b.editedText ?? b.improved}
                          onChange={(e) => {
                            const next = bullets.slice();
                            next[idx] = { ...b, editedText: e.target.value };
                            setBullets(next);
                          }}
                        />
                        <span className="muted text-[11px]">Why: {b.reason}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {view?.profile?.headline && <p className="text-sm">{view.profile.headline}</p>}

      <section className="card px-5 py-3">
        <h2 className="py-2 text-sm font-semibold">Facts about you ({view?.facts.length ?? 0})</h2>
        {view && view.facts.length === 0 && (
          <p className="muted py-2 text-sm">Import your resume and extract facts, or add your own below.</p>
        )}
        <ul className="divide-y divide-[var(--border)]">
          {view?.facts.map((f) => (
            <FactRow key={f.id} fact={f} onChange={load} />
          ))}
        </ul>
        <div className="flex gap-2 py-3">
          <input
            className="field"
            placeholder="Add something that isn't on your resume, e.g. a result you're proud of"
            value={newFact}
            maxLength={600}
            onChange={(e) => setNewFact(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newFact.trim() && addFact()}
          />
          <button className="btn" disabled={!newFact.trim() || !!busy} onClick={addFact}>
            <Plus size={14} /> Add
          </button>
        </div>
        <p className="muted pb-2 text-xs">Re-extracting replaces the resume facts but keeps the ones you added.</p>
      </section>

      {versions.length > 0 && (
        <section className="card px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <History size={15} className="text-accent" />
            <h2 className="text-sm font-semibold">Resume Version History ({versions.length})</h2>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {versions.map((v, idx) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                <div>
                  <span className="font-medium">{v.label}</span>
                  {idx === 0 && (
                    <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                      Active
                    </span>
                  )}
                  <div className="muted">
                    {new Date(v.createdAtMs).toLocaleString()} · {v.text.length.toLocaleString()} chars
                  </div>
                </div>
                {idx > 0 && (
                  <button
                    className="btn py-1 text-xs"
                    onClick={async () => {
                      await ipc.saveResumeText(v.fileName, v.text);
                      const reordered = [v, ...versions.filter((x) => x.id !== v.id)];
                      setVersions(reordered);
                      await ipc.saveCareerStore('career:resume_versions', reordered);
                      load();
                    }}
                  >
                    <Check size={12} /> Restore version
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';
import { Briefcase, FileUp, Plus, Trash2 } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import type { Job } from '../../types';

type Draft = { id: string | null; title: string; company: string; description: string };
const EMPTY: Draft = { id: null, title: '', company: '', description: '' };

export function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    ipc.listJobs().then(setJobs, (e: Error) => setError(e.message));
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Job Context</h1>
          <p className="muted mt-1">Jobs you're preparing for. Practice questions are written for the role you pick.</p>
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
                <div className="text-sm font-medium">{j.title}</div>
                {j.company && <div className="muted text-xs">{j.company}</div>}
              </button>
              <button className="muted p-3 hover:text-red-400" aria-label="Delete job" onClick={() => remove(j)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>

        {draft ? (
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
                className="field mt-1 min-h-64"
                value={draft.description}
                maxLength={15000}
                placeholder="Paste the job description"
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <div>
              <button className="btn btn-primary" onClick={save} disabled={saving || !draft.title.trim()}>
                {saving ? 'Saving…' : 'Save job'}
              </button>
            </div>
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

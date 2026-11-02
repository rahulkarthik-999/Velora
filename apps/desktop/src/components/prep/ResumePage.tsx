import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FileText, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import type { CandidateFact, FactKind, ProfileView, ResumeInfo } from '../../types';

const KIND_LABEL: Record<FactKind, string> = {
  experience: 'Experience',
  project: 'Project',
  skill: 'Skills',
  education: 'Education',
  other: 'Added by you',
};

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
  const [busy, setBusy] = useState<'import' | 'extract' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newFact, setNewFact] = useState('');

  const load = useCallback(() => {
    ipc.getResume().then(setResume, (e: Error) => setError(e.message));
    ipc.getProfile().then(setView, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const run = async (kind: 'import' | 'extract', fn: () => Promise<unknown>) => {
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
    if (typeof path === 'string') run('import', () => ipc.importResume(path));
  };

  const addFact = () =>
    run('extract', async () => {
      await ipc.saveFact(null, 'other', newFact);
      setNewFact('');
    });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">My Resume</h1>
        <p className="muted mt-1">
          Your resume is stored on this PC. Feedback uses only the facts below, the few that match each question, so
          model answers never invent experience you don't have.
        </p>
      </header>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <section className="card flex items-center gap-4 p-5">
        <FileText size={22} className="text-accent" />
        <div className="flex-1">
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
        <button className="btn" onClick={importFile} disabled={!!busy}>
          {busy === 'import' ? <Loader2 size={14} className="animate-spin" /> : null}
          {resume ? 'Replace' : 'Import resume'}
        </button>
        <button
          className="btn btn-primary"
          disabled={!resume || !!busy}
          onClick={() => run('extract', ipc.extractProfile)}
          title="Uses 1 AI credit"
        >
          {busy === 'extract' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {view?.profile ? 'Re-extract facts' : 'Extract facts'}
        </button>
      </section>

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
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { BookOpen, FileUp, Loader2, NotebookPen, Trash2 } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import type { KnowledgeDoc } from '../../types';

/** Notes and documents the copilot searches when it writes an answer. */
export function KnowledgePage() {
  const setPage = useApp((s) => s.setPage);
  const [docs, setDocs] = useState<KnowledgeDoc[] | null>(null);
  const [factCount, setFactCount] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'note' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    ipc.listKnowledge().then(setDocs, (e: Error) => setError(e.message));
    ipc.getProfile().then((p) => setFactCount(p.facts.length), () => {});
  }, []);
  useEffect(load, [load]);

  const run = async (kind: 'note' | 'file', fn: () => Promise<unknown>) => {
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
    const path = await open({ multiple: false, filters: [{ name: 'Document', extensions: ['pdf', 'docx', 'txt', 'md'] }] });
    if (typeof path === 'string') run('file', () => ipc.importKnowledge(path));
  };

  const addNote = () =>
    run('note', async () => {
      await ipc.addKnowledgeNote(title, text);
      setTitle('');
      setText('');
    });

  const remove = (id: string) => run('note', () => ipc.deleteKnowledge(id));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Knowledge Base</h1>
        <p className="muted mt-1">
          The copilot answers from what you put here: your resume facts, prepared stories, project notes, study notes and the
          job description. For each question it picks the few passages that match best. Everything is stored on this PC; only
          the matching passages are sent with a question.
        </p>
      </header>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <section className="card flex items-center gap-4 p-5">
        <BookOpen size={22} className="text-accent" />
        <div className="flex-1">
          <div className="font-medium">Resume facts</div>
          <div className="muted text-xs">
            {factCount === null ? 'Loading…' : `${factCount} fact${factCount === 1 ? '' : 's'} from your resume and what you added`}
          </div>
        </div>
        <button className="btn" onClick={() => setPage('resume')}>
          Manage resume
        </button>
        <button className="btn" onClick={() => setPage('job')}>
          Jobs
        </button>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Add to the knowledge base</h2>
          <button className="btn" onClick={importFile} disabled={!!busy}>
            {busy === 'file' ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
            Import document (PDF, DOCX, TXT, MD)
          </button>
        </div>
        <input
          className="field"
          placeholder="Title, e.g. 'STAR stories' or 'Payments service design'"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Note title"
        />
        <textarea
          className="field min-h-40"
          placeholder={'Write or paste notes. Separate topics with a blank line so each is found on its own.\n\nConflict story: At Acme I disagreed with my lead about…'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Note text"
        />
        <div>
          <button className="btn btn-primary" onClick={addNote} disabled={!title.trim() || !text.trim() || !!busy}>
            {busy === 'note' ? <Loader2 size={14} className="animate-spin" /> : <NotebookPen size={14} />}
            Add note
          </button>
        </div>
      </section>

      <section className="card px-5 py-3">
        <h2 className="py-2 text-sm font-semibold">Documents and notes ({docs?.length ?? 0})</h2>
        {docs && docs.length === 0 && <p className="muted py-2 text-sm">Nothing added yet.</p>}
        <ul className="divide-y divide-[var(--border)]">
          {docs?.map((d) => (
            <li key={d.id} className="group flex items-start gap-3 py-3">
              {d.source === 'file' ? <FileUp size={16} className="mt-0.5 text-accent" /> : <NotebookPen size={16} className="mt-0.5 text-accent" />}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{d.title}</div>
                <div className="muted text-xs">
                  {d.chars.toLocaleString()} characters · {d.chunks} passage{d.chunks === 1 ? '' : 's'} · added{' '}
                  {new Date(d.createdAtMs).toLocaleDateString()}
                </div>
                <p className="muted mt-1 line-clamp-2 text-xs">{d.preview}</p>
              </div>
              <button
                className="btn btn-danger py-1 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => remove(d.id)}
                aria-label={`Delete ${d.title}`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Upload,
  FileText,
  Loader2,
  X,
  Play,
  Plus,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface TaskSummary {
  id: string;
  title: string;
  originalGoal: string;
  status: string;
  progressPercent: number;
  updatedAt: string;
  steps: Array<{ id: string; title: string; status: string; order: number }>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTasks, setActiveTasks] = useState<TaskSummary[]>([]);
  const [fetchingTasks, setFetchingTasks] = useState(true);
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string }>>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch('/api/tasks?limit=6')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data) {
          setActiveTasks(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setFetchingTasks(false));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to upload');
      }

      const data = await res.json();
      setAttachments((prev) => [...prev, { id: data.id, name: data.fileName }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!goal.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          attachmentIds: attachments.map((a) => a.id),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to formulate workflow');
      }

      const created = await res.json();
      router.push(`/tasks/${created.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleCreateTask();
    }
  };

  const blueprints = [
    'Tailor resume and generate cover letter for a Principal Engineer role',
    'Summarize this vendor agreement and isolate risk indemnities',
    'Build a 4-day travel and meeting schedule with transit logistics',
    'Synthesize meeting transcript into decisions and action items',
  ];

  return (
    <div className="space-y-12">
      {/* Primary Goal Canvas */}
      <section className="space-y-3">
        <form onSubmit={handleCreateTask} className="card p-4 border-velora-border-strong bg-velora-surface shadow-lg">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What do you want to accomplish?"
            className="w-full bg-transparent text-sm sm:text-base text-white placeholder:text-velora-text-muted focus:outline-none resize-none min-h-[90px] leading-relaxed font-normal"
            disabled={loading}
            autoFocus
          />

          {/* Attachment Tags */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-3">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-velora-surface-hover border border-velora-border text-xs text-white"
                >
                  <FileText className="w-3.5 h-3.5 text-velora-text-secondary" />
                  <span className="truncate max-w-[200px]">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    className="text-velora-text-muted hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mb-3 text-xs text-rose-400 font-mono">
              Error: {error}
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-3 border-t border-velora-border">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-velora-text-secondary hover:text-white px-2.5 py-1.5 rounded-md hover:bg-velora-surface-subtle transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? 'Uploading...' : 'Attach doc / PDF'}</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading || loading}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.docx"
                />
              </label>
              <span className="text-[11px] text-velora-text-muted hidden sm:inline">
                Ctrl + Enter to run
              </span>
            </div>

            <button
              type="submit"
              disabled={loading || !goal.trim()}
              className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <span>Create Workflow</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Minimal Blueprint Chips */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {blueprints.map((bp, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setGoal(bp)}
              className="text-[11px] text-velora-text-secondary hover:text-white bg-velora-surface border border-velora-border rounded-md px-2.5 py-1 transition-colors"
            >
              {bp}
            </button>
          ))}
        </div>
      </section>

      {/* Active Workflows Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-velora-text-muted uppercase tracking-wider">
            Active &amp; Recent Workflows
          </span>
          <button
            onClick={() => router.push('/dashboard/history')}
            className="text-xs text-velora-text-secondary hover:text-white transition-colors"
          >
            All tasks &rarr;
          </button>
        </div>

        {fetchingTasks ? (
          <div className="card p-10 text-center text-xs text-velora-text-muted flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-white" />
            <span>Loading workspace tasks...</span>
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="card p-12 text-center border-dashed">
            <p className="text-xs text-velora-text-muted">
              No tasks currently in progress. Enter an objective above to begin.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-velora-border border border-velora-border rounded-xl overflow-hidden bg-velora-surface">
            {activeTasks.map((t) => (
              <div
                key={t.id}
                onClick={() => router.push(`/tasks/${t.id}`)}
                className="p-4 hover:bg-velora-surface-hover cursor-pointer transition-colors flex items-center justify-between gap-4 group"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        t.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : t.status === 'IN_PROGRESS'
                          ? 'bg-white/10 text-white'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {t.status}
                    </span>
                    <span className="text-xs font-medium text-white truncate group-hover:text-velora-violet-light transition-colors">
                      {t.title}
                    </span>
                  </div>
                  <p className="text-xs text-velora-text-muted truncate max-w-xl">
                    {t.originalGoal}
                  </p>
                </div>

                <div className="flex items-center gap-5 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-xs font-mono text-white">{t.progressPercent}%</span>
                    <span className="text-[11px] text-velora-text-muted block">{formatRelativeTime(t.updatedAt)}</span>
                  </div>
                  <div className="w-7 h-7 rounded-md border border-velora-border flex items-center justify-center text-velora-text-secondary group-hover:border-velora-border-strong group-hover:text-white">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

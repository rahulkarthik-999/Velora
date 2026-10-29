'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  Upload,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
  X,
  Play,
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

  // Load active tasks
  useEffect(() => {
    fetch('/api/tasks?limit=5')
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

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
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
        throw new Error(data.error || 'Failed to create task workflow');
      }

      const created = await res.json();
      router.push(`/tasks/${created.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const templates = [
    'Prepare job application materials and cover letter for a Senior Developer role',
    'Summarize this contract and highlight obligations and risks',
    'Plan a 5-day trip itinerary with logistics, checklist, and budget breakdown',
    'Draft a diplomatic executive response to an escalated client feedback email',
  ];

  return (
    <div className="space-y-10">
      {/* 1. What do you want to accomplish? */}
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-velora-text tracking-tight">
            What do you want to accomplish?
          </h1>
          <p className="text-sm text-velora-text-secondary mt-1">
            Describe your intended result. Velora breaks it down into an ordered workflow and produces deliverables.
          </p>
        </div>

        <form onSubmit={handleCreateTask} className="card border-velora-border-light/80 p-6 shadow-xl space-y-4">
          <div className="relative">
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Help me analyze this research paper, generate an executive summary, and create a 5-point action plan..."
              className="w-full bg-velora-bg border border-velora-border rounded-xl p-4 text-sm text-velora-text placeholder:text-velora-text-muted focus:outline-none focus:ring-2 focus:ring-velora-violet resize-none min-h-[110px]"
              disabled={loading}
            />
          </div>

          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-velora-surface border border-velora-border text-xs text-velora-lavender"
                >
                  <FileText className="w-3.5 h-3.5 text-velora-violet-light" />
                  <span className="truncate max-w-[200px]">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    className="text-velora-text-muted hover:text-red-400 ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium text-velora-text-secondary hover:text-velora-text py-2 px-3 rounded-lg bg-velora-surface border border-velora-border transition-colors">
                <Upload className="w-3.5 h-3.5 text-velora-violet-light" />
                <span>{uploading ? 'Uploading...' : 'Attach File or Doc'}</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading || loading}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.docx"
                />
              </label>
              <span className="text-[11px] text-velora-text-muted hidden sm:inline">
                PDF, Docs, CSV, Images (up to 20MB)
              </span>
            </div>

            <button
              type="submit"
              disabled={loading || !goal.trim()}
              className="btn-primary text-sm py-2.5 px-6 flex items-center justify-center gap-2 shadow-lg shadow-velora-violet/25 font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Workflow...</span>
                </>
              ) : (
                <>
                  <span>Formulate Workflow</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Templates suggestions */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-velora-text-muted uppercase tracking-wider">
            Suggested Blueprints
          </span>
          <div className="flex flex-wrap gap-2">
            {templates.map((tpl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setGoal(tpl)}
                className="text-xs text-velora-text-secondary hover:text-velora-text bg-velora-surface hover:bg-velora-surface-hover border border-velora-border rounded-full py-1.5 px-3.5 transition-colors text-left"
              >
                + {tpl}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. What is currently in progress? */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-velora-text">Active &amp; Recent Workflows</h2>
            <p className="text-xs text-velora-text-muted">Persistent state saved across all devices.</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/history')}
            className="text-xs text-velora-violet-light hover:underline"
          >
            View all history &rarr;
          </button>
        </div>

        {fetchingTasks ? (
          <div className="card p-8 text-center text-xs text-velora-text-muted flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-velora-violet" />
            <span>Loading active workspace tasks...</span>
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="card p-8 text-center space-y-2">
            <Sparkles className="w-6 h-6 text-velora-violet-light mx-auto" />
            <p className="text-sm font-medium text-velora-text">No workflows created yet</p>
            <p className="text-xs text-velora-text-muted max-w-sm mx-auto">
              Enter any goal or project above to kick off your first autonomous execution workflow.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {activeTasks.map((t) => (
              <div
                key={t.id}
                onClick={() => router.push(`/tasks/${t.id}`)}
                className="card hover:border-velora-violet/50 cursor-pointer transition-all p-5 flex flex-col justify-between group space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        t.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : t.status === 'IN_PROGRESS'
                          ? 'bg-velora-violet-bg text-velora-violet-light border border-velora-violet-border'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {t.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] text-velora-text-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(t.updatedAt)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-velora-text group-hover:text-velora-violet-light transition-colors line-clamp-1">
                    {t.title}
                  </h3>
                  <p className="text-xs text-velora-text-secondary line-clamp-2 mt-1">
                    {t.originalGoal}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-velora-text-muted mb-1">
                    <span>Progress</span>
                    <span>{t.progressPercent}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        t.progressPercent === 100 ? 'bg-emerald-500' : 'bg-velora-violet'
                      }`}
                      style={{ width: `${t.progressPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-3 mt-2 border-t border-velora-border text-xs">
                    <span className="text-velora-text-muted">{t.steps?.length || 0} steps</span>
                    <span className="text-velora-violet-light font-medium flex items-center gap-1">
                      <span>Resume</span>
                      <Play className="w-3 h-3 fill-current" />
                    </span>
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

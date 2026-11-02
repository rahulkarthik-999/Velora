'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Upload,
  FileText,
  Loader2,
  X,
  Play,
  Plus,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import {
  DELIVERABLE_TEMPLATES,
  DeliverableTemplateKey,
} from '@velora/schemas';

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
  const [selectedTemplate, setSelectedTemplate] = useState<DeliverableTemplateKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTasks, setActiveTasks] = useState<TaskSummary[]>([]);
  const [fetchingTasks, setFetchingTasks] = useState(true);
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string }>>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch('/api/tasks?limit=8')
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
          templateKey: selectedTemplate || undefined,
          attachmentIds: attachments.map((a) => a.id),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to formulate deliverable workflow');
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

  const handleSelectTemplate = (key: DeliverableTemplateKey) => {
    setSelectedTemplate(key);
    const tpl = DELIVERABLE_TEMPLATES[key];
    if (tpl) {
      setGoal(tpl.sampleBrief);
    }
  };

  return (
    <div className="space-y-12">
      {/* Primary Deliverable Canvas */}
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-normal text-white tracking-tight">
            Turn client briefs into delivered work.
          </h1>
          <p className="text-xs text-velora-text-secondary mt-1">
            Describe the client scope, paste discovery notes, or upload documents. Velora generates structured plans and outputs.
          </p>
        </div>

        {/* Template Quick Selection Pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {Object.values(DELIVERABLE_TEMPLATES).map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => handleSelectTemplate(tpl.key)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                selectedTemplate === tpl.key
                  ? 'border-velora-gold bg-velora-gold-subtle text-velora-gold-light font-medium'
                  : 'border-velora-border bg-velora-surface text-velora-text-secondary hover:text-white hover:border-velora-border-strong'
              }`}
            >
              {tpl.title}
            </button>
          ))}
        </div>

        {/* Goal Composer Card */}
        <form
          onSubmit={handleCreateTask}
          className="card p-5 border-velora-border-strong bg-velora-surface/90 shadow-xl space-y-4"
        >
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste client brief, requirements, meeting notes, or describe what needs to be delivered..."
            className="w-full bg-transparent text-sm text-white placeholder:text-velora-text-muted focus:outline-none resize-none min-h-[110px] leading-relaxed font-normal"
            disabled={loading}
            autoFocus
          />

          {/* Attachment Tags */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-velora-surface-hover border border-velora-border text-xs text-white"
                >
                  <FileText className="w-3.5 h-3.5 text-velora-gold" />
                  <span className="truncate max-w-[200px]">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    className="text-velora-text-muted hover:text-white ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-400 font-mono">
              Error: {error}
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-3 border-t border-velora-border">
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-velora-text-secondary hover:text-white px-3 py-1.5 rounded-lg border border-velora-border hover:bg-velora-surface-subtle transition-colors">
                <Upload className="w-3.5 h-3.5 text-velora-gold" />
                <span>{uploading ? 'Uploading...' : 'Attach Brief or PDF'}</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading || loading}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.docx"
                />
              </label>
              <span className="text-[11px] text-velora-text-muted hidden sm:inline font-mono">
                Ctrl + Enter to run
              </span>
            </div>

            <button
              type="submit"
              disabled={loading || !goal.trim()}
              className="btn-gold text-xs py-2 px-5 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Workflow...</span>
                </>
              ) : (
                <>
                  <span>Formulate Deliverable</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Active Workflows Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-mono text-velora-text-muted uppercase tracking-wider block">
              Active Client Workflows
            </span>
          </div>
          <Link
            href="/dashboard/history"
            className="text-xs text-velora-text-secondary hover:text-white transition-colors"
          >
            All deliverables &rarr;
          </Link>
        </div>

        {fetchingTasks ? (
          <div className="card p-10 text-center text-xs text-velora-text-muted flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-velora-gold" />
            <span>Loading client deliverables...</span>
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="card p-12 text-center border-dashed border-velora-border">
            <p className="text-xs text-velora-text-muted mb-3">
              No active client deliverables in progress.
            </p>
            <Link href="/onboarding" className="btn-secondary text-xs py-1.5 px-4">
              Explore Guided Onboarding
            </Link>
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
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        t.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : t.status === 'IN_PROGRESS'
                          ? 'bg-velora-gold-subtle text-velora-gold border border-velora-gold-border'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {t.status}
                    </span>
                    <span className="text-xs font-semibold text-white truncate group-hover:text-velora-gold-light transition-colors">
                      {t.title}
                    </span>
                  </div>
                  <p className="text-xs text-velora-text-muted truncate max-w-xl">
                    {t.originalGoal}
                  </p>
                </div>

                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-xs font-mono text-white">{t.progressPercent}%</span>
                    <span className="text-[11px] text-velora-text-muted block">{formatRelativeTime(t.updatedAt)}</span>
                  </div>
                  <div className="w-7 h-7 rounded-md border border-velora-border flex items-center justify-center text-velora-text-secondary group-hover:border-velora-gold group-hover:text-velora-gold transition-colors">
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

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Check,
  X,
  RotateCcw,
  SkipForward,
  FileText,
  Download,
  Edit3,
  Save,
  Trash2,
  Loader2,
  Copy,
  CheckCheck,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface Step {
  id: string;
  title: string;
  description: string;
  stepType: string;
  order: number;
  status: string;
  dependencies: string[];
  actualOutput?: string;
  artifactId?: string;
  requiresApproval: boolean;
  errorDetails?: string;
}

interface Artifact {
  id: string;
  title: string;
  type: string;
  content: string;
  version: number;
  isEdited: boolean;
  createdAt: string;
}

interface TaskData {
  id: string;
  title: string;
  originalGoal: string;
  normalizedObjective?: string;
  completionCriteria?: string;
  status: string;
  progressPercent: number;
  steps: Step[];
  artifacts: Artifact[];
  attachments: Array<{ id: string; fileName: string; fileSize: number; fileType: string }>;
  events: Array<{ id: string; type: string; message: string; createdAt: string }>;
}

export default function TaskWorkspacePage() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();

  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executingStepId, setExecutingStepId] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [editingArtifact, setEditingArtifact] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [savingArtifact, setSavingArtifact] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchTask = async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) {
        if (res.status === 401) router.push('/auth/signin');
        throw new Error('Task not found');
      }
      const data = await res.json();
      setTask(data);
      if (data.artifacts?.length > 0 && !selectedArtifact) {
        setSelectedArtifact(data.artifacts[0]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (taskId) fetchTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const handleExecuteStep = async (stepId: string) => {
    setExecutingStepId(stepId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/steps/${stepId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Execution failed');
      }
      await fetchTask();
    } catch (err: any) {
      alert(`Step Execution Error: ${err.message}`);
    } finally {
      setExecutingStepId(null);
    }
  };

  const handleApproveStep = async (stepId: string, approved: boolean) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/steps/${stepId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      if (!res.ok) throw new Error('Failed to submit approval');
      await fetchTask();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSkipStep = async (stepId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/steps/${stepId}/skip`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to skip step');
      await fetchTask();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRetryStep = async (stepId: string) => {
    setExecutingStepId(stepId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/steps/${stepId}/retry`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to retry step');
      await fetchTask();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setExecutingStepId(null);
    }
  };

  const handleSaveArtifact = async () => {
    if (!selectedArtifact) return;
    setSavingArtifact(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/artifacts/${selectedArtifact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent }),
      });
      if (!res.ok) throw new Error('Failed to save artifact updates');
      const updated = await res.json();
      setSelectedArtifact(updated);
      setEditingArtifact(false);
      await fetchTask();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingArtifact(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = (content: string, filename: string, ext = 'md') => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteTask = async () => {
    if (!confirm('Permanently delete this task workspace?')) return;
    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      router.push('/dashboard');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-velora-bg flex items-center justify-center text-xs text-velora-text-muted gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-white" />
        <span>Loading workspace...</span>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-velora-bg flex flex-col items-center justify-center p-6">
        <div className="card p-8 text-center max-w-sm space-y-4">
          <p className="text-xs text-velora-text-secondary">{error || 'Task not found'}</p>
          <Link href="/dashboard" className="btn-primary text-xs py-1.5 px-4">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-velora-bg text-velora-text flex flex-col">
      {/* Top Precision Header */}
      <header className="border-b border-velora-border sticky top-0 z-40 bg-velora-bg/90 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/dashboard"
            className="p-1 rounded-md text-velora-text-muted hover:text-white hover:bg-velora-surface transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-sm font-semibold text-white truncate max-w-sm sm:max-w-md">
                {task.title}
              </h1>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  task.status === 'COMPLETED'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-velora-surface border border-velora-border text-velora-text-secondary'
                }`}
              >
                {task.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-xs font-mono text-velora-text-secondary">
            {task.progressPercent}% completed
          </span>
          <button
            onClick={handleDeleteTask}
            className="text-velora-text-muted hover:text-rose-400 transition-colors p-1"
            title="Delete task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Two-Pane Workspace Grid */}
      <div className="max-w-7xl mx-auto w-full px-6 py-6 grid lg:grid-cols-12 gap-8 flex-1">
        {/* Left Column: Ordered Steps Engine (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Objective Summary Card */}
          <div className="p-4 rounded-xl border border-velora-border bg-velora-surface space-y-2">
            <span className="text-[11px] font-mono text-velora-text-muted uppercase tracking-wider block">
              Objective &amp; Success Criteria
            </span>
            <p className="text-xs text-white leading-relaxed">
              {task.normalizedObjective || task.originalGoal}
            </p>
            {task.completionCriteria && (
              <p className="text-[11px] text-velora-text-secondary pt-2 border-t border-velora-border">
                {task.completionCriteria}
              </p>
            )}
          </div>

          {/* Steps List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-velora-text-muted font-mono pb-1">
              <span>WORKFLOW STEPS ({task.steps.length})</span>
              <span>{task.steps.filter((s) => s.status === 'COMPLETED').length}/{task.steps.length} DONE</span>
            </div>

            {task.steps.map((step, idx) => {
              const isExecuting = executingStepId === step.id;
              const isReady = step.status === 'READY';
              const isCompleted = step.status === 'COMPLETED';
              const isWaitingApproval = step.status === 'WAITING_FOR_APPROVAL';
              const isFailed = step.status === 'FAILED';

              return (
                <div
                  key={step.id}
                  className={`p-3.5 rounded-xl border transition-colors ${
                    isCompleted
                      ? 'border-velora-border bg-velora-surface/50'
                      : isReady || isWaitingApproval
                      ? 'border-velora-border-strong bg-velora-surface'
                      : 'border-velora-border bg-velora-surface/30 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-velora-text-muted">
                          0{idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-white">{step.title}</span>
                        <span className="text-[10px] font-mono text-velora-text-muted">
                          {step.stepType}
                        </span>
                      </div>
                      <p className="text-xs text-velora-text-secondary leading-relaxed pl-5">
                        {step.description}
                      </p>
                    </div>

                    {/* Step Action Controls */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isReady && (
                        <button
                          onClick={() => handleExecuteStep(step.id)}
                          disabled={isExecuting}
                          className="btn-primary text-xs py-1 px-3 flex items-center gap-1"
                        >
                          {isExecuting ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-2.5 h-2.5 fill-current" />
                          )}
                          <span>Run</span>
                        </button>
                      )}

                      {isWaitingApproval && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleApproveStep(step.id, true)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-2 py-1 rounded-md"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApproveStep(step.id, false)}
                            className="bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-medium px-2 py-1 rounded-md"
                          >
                            Reject
                          </button>
                        </div>
                      )}

                      {isFailed && (
                        <button
                          onClick={() => handleRetryStep(step.id)}
                          disabled={isExecuting}
                          className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 text-amber-400"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Retry</span>
                        </button>
                      )}

                      {isCompleted && (
                        <div className="flex items-center gap-1 text-emerald-400 text-xs font-mono">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Output Preview Pill */}
                  {step.actualOutput && (
                    <div className="mt-2.5 pt-2 border-t border-velora-border flex items-center justify-between text-[11px]">
                      <span className="text-velora-text-muted font-mono truncate max-w-xs">
                        Deliverable generated
                      </span>
                      <button
                        onClick={() => {
                          const art = task.artifacts.find((a) => a.id === step.artifactId);
                          if (art) setSelectedArtifact(art);
                        }}
                        className="text-white hover:underline"
                      >
                        Open in studio &rarr;
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Artifact Studio (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="card p-5 border-velora-border-strong bg-velora-surface h-full flex flex-col justify-between">
            <div>
              {/* Studio Header */}
              <div className="flex items-center justify-between pb-3 border-b border-velora-border">
                <span className="text-xs font-mono text-velora-text-muted uppercase tracking-wider">
                  Deliverable Artifacts
                </span>
                {selectedArtifact && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(selectedArtifact.content)}
                      className="p-1 rounded text-velora-text-secondary hover:text-white"
                      title="Copy text"
                    >
                      {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleExport(selectedArtifact.content, selectedArtifact.title, 'md')}
                      className="p-1 rounded text-velora-text-secondary hover:text-white"
                      title="Download Markdown"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (editingArtifact) {
                          setEditingArtifact(false);
                        } else {
                          setEditedContent(selectedArtifact.content);
                          setEditingArtifact(true);
                        }
                      }}
                      className="p-1 rounded text-velora-text-secondary hover:text-white"
                      title="Edit content"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Artifact Selector Tabs */}
              {task.artifacts.length > 0 ? (
                <div className="flex gap-1.5 py-3 overflow-x-auto border-b border-velora-border">
                  {task.artifacts.map((art) => (
                    <button
                      key={art.id}
                      onClick={() => {
                        setSelectedArtifact(art);
                        setEditingArtifact(false);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                        selectedArtifact?.id === art.id
                          ? 'bg-white text-black font-medium'
                          : 'bg-velora-bg text-velora-text-secondary hover:text-white border border-velora-border'
                      }`}
                    >
                      {art.title}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center text-xs text-velora-text-muted">
                  Run steps on the left to generate reviewable deliverables.
                </div>
              )}

              {/* Artifact Content Viewer / Editor */}
              {selectedArtifact && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-velora-text-muted font-mono">
                    <span>{selectedArtifact.title}</span>
                    <span>v{selectedArtifact.version}</span>
                  </div>

                  {editingArtifact ? (
                    <div className="space-y-3">
                      <textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="w-full bg-velora-bg border border-velora-border rounded-lg p-3 text-xs text-white font-mono min-h-[360px] focus:outline-none resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingArtifact(false)}
                          className="btn-ghost text-xs py-1 px-3"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveArtifact}
                          disabled={savingArtifact}
                          className="btn-primary text-xs py-1 px-3 flex items-center gap-1.5"
                        >
                          {savingArtifact ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          <span>Save changes</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-velora-bg border border-velora-border rounded-lg p-4 text-xs text-white leading-relaxed whitespace-pre-wrap font-sans max-h-[500px] overflow-y-auto">
                      {selectedArtifact.content}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Attached Files List */}
            {task.attachments.length > 0 && (
              <div className="mt-6 pt-3 border-t border-velora-border text-xs">
                <span className="text-[11px] font-mono text-velora-text-muted uppercase mb-2 block">
                  Attached Context
                </span>
                <div className="space-y-1">
                  {task.attachments.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded bg-velora-bg border border-velora-border"
                    >
                      <span className="text-velora-text-secondary truncate">{file.fileName}</span>
                      <span className="text-[10px] font-mono text-velora-text-muted">
                        {(file.fileSize / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

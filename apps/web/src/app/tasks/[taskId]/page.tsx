'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
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
  ChevronRight,
  ShieldAlert,
  Sparkles,
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
    if (!confirm('Are you sure you want to permanently delete this task workspace?')) return;
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
        <Loader2 className="w-5 h-5 animate-spin text-velora-violet" />
        <span>Loading Execution Workspace...</span>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-velora-bg flex flex-col items-center justify-center p-4">
        <div className="card p-8 text-center max-w-md space-y-4">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <h2 className="text-base font-bold text-velora-text">Unable to Load Task</h2>
          <p className="text-xs text-velora-text-muted">{error || 'Task not found'}</p>
          <Link href="/dashboard" className="btn-primary inline-flex text-xs py-2 px-4">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-velora-bg text-velora-text flex flex-col pb-16">
      {/* Top Workspace Header */}
      <header className="sticky top-0 z-40 bg-velora-bg/90 backdrop-blur-md border-b border-velora-border px-4 sm:px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 rounded-lg text-velora-text-secondary hover:text-velora-text hover:bg-velora-surface border border-velora-border"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-velora-text truncate max-w-[300px] sm:max-w-md">
                {task.title}
              </h1>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  task.status === 'COMPLETED'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : task.status === 'WAITING_FOR_USER'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-velora-violet-bg text-velora-violet-light border border-velora-violet-border'
                }`}
              >
                {task.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-[11px] text-velora-text-muted truncate max-w-lg hidden sm:block">
              {task.originalGoal}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end mr-2">
            <span className="text-[11px] text-velora-text-muted">Workflow Progress</span>
            <div className="w-32 bg-zinc-800 rounded-full h-1.5 mt-1 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  task.progressPercent === 100 ? 'bg-emerald-500' : 'bg-velora-violet'
                }`}
                style={{ width: `${task.progressPercent}%` }}
              />
            </div>
          </div>
          <button
            onClick={handleDeleteTask}
            className="p-2 rounded-lg text-velora-text-muted hover:text-red-400 hover:bg-velora-surface border border-velora-border transition-colors"
            title="Delete Task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Grid: Left = Workflow Steps, Right = Live Deliverables/Artifacts */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 grid lg:grid-cols-12 gap-6 flex-1">
        {/* Left Column: Workflow Steps Engine (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Objective Summary Card */}
          <div className="card p-4 bg-velora-surface/60 border-velora-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-velora-violet-light mb-1 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Target Objective</span>
            </div>
            <p className="text-xs text-velora-text leading-relaxed">
              {task.normalizedObjective || task.originalGoal}
            </p>
            {task.completionCriteria && (
              <div className="mt-3 pt-2.5 border-t border-velora-border text-[11px] text-velora-text-muted">
                <span className="font-semibold text-zinc-300">Completion Condition:</span>{' '}
                {task.completionCriteria}
              </div>
            )}
          </div>

          {/* Workflow Steps List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-bold text-velora-text">Execution Steps ({task.steps.length})</h2>
              <span className="text-xs text-velora-text-muted">
                {task.steps.filter((s) => s.status === 'COMPLETED').length} / {task.steps.length} completed
              </span>
            </div>

            {task.steps.map((step, index) => {
              const isExecuting = executingStepId === step.id;
              const isReady = step.status === 'READY';
              const isCompleted = step.status === 'COMPLETED';
              const isWaitingApproval = step.status === 'WAITING_FOR_APPROVAL';
              const isFailed = step.status === 'FAILED';
              const isPending = step.status === 'PENDING';

              return (
                <div
                  key={step.id}
                  className={`card p-4 transition-all ${
                    isCompleted
                      ? 'border-zinc-800 bg-velora-surface/40'
                      : isReady || isWaitingApproval
                      ? 'border-velora-violet/60 bg-velora-surface shadow-md'
                      : 'border-velora-border bg-velora-surface/60 opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {isCompleted ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        ) : isWaitingApproval ? (
                          <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                            <ShieldAlert className="w-3 h-3" />
                          </div>
                        ) : isExecuting ? (
                          <div className="w-5 h-5 rounded-full bg-velora-violet/20 text-velora-violet flex items-center justify-center">
                            <Loader2 className="w-3 h-3 animate-spin" />
                          </div>
                        ) : isFailed ? (
                          <div className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                            <X className="w-3 h-3" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center text-[10px] font-bold">
                            {index + 1}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-semibold text-velora-text">{step.title}</h3>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                            {step.stepType}
                          </span>
                        </div>
                        <p className="text-[11px] text-velora-text-secondary mt-0.5 leading-relaxed">
                          {step.description}
                        </p>

                        {step.errorDetails && (
                          <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
                            Error: {step.errorDetails}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isReady && (
                        <button
                          onClick={() => handleExecuteStep(step.id)}
                          disabled={isExecuting}
                          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 font-semibold"
                        >
                          {isExecuting ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 fill-current" />
                          )}
                          <span>Run Step</span>
                        </button>
                      )}

                      {isWaitingApproval && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleApproveStep(step.id, true)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleApproveStep(step.id, false)}
                            className="bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors"
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
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      )}

                      {(isReady || isPending) && (
                        <button
                          onClick={() => handleSkipStep(step.id)}
                          className="btn-ghost text-[11px] p-1.5 text-zinc-500 hover:text-zinc-300"
                          title="Skip step"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Step Artifact link if output generated */}
                  {step.actualOutput && (
                    <div className="mt-3 pt-2 border-t border-velora-border/60 flex items-center justify-between text-[11px]">
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Deliverable Produced</span>
                      </span>
                      <button
                        onClick={() => {
                          const art = task.artifacts.find((a) => a.id === step.artifactId);
                          if (art) setSelectedArtifact(art);
                        }}
                        className="text-velora-violet-light hover:underline flex items-center gap-1"
                      >
                        <span>View Artifact</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Activity Timeline Events */}
          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-bold text-velora-text uppercase tracking-wider">
              Execution Event Log
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {task.events.map((evt) => (
                <div key={evt.id} className="text-[11px] flex items-start justify-between gap-2 border-b border-velora-border/40 pb-1.5">
                  <span className="text-velora-text-secondary">{evt.message}</span>
                  <span className="text-velora-text-muted flex-shrink-0">{formatRelativeTime(evt.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Generated Deliverables / Artifacts Viewer & Editor (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card p-5 h-full flex flex-col justify-between border-velora-border-light shadow-xl bg-velora-surface/90">
            <div>
              {/* Artifact Selector Header */}
              <div className="flex items-center justify-between pb-3 border-b border-velora-border">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-velora-violet-light" />
                  <span className="text-xs font-bold text-velora-text">Artifact Studio</span>
                </div>
                {selectedArtifact && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleExport(selectedArtifact.content, selectedArtifact.title, 'md')}
                      className="p-1 rounded text-velora-text-muted hover:text-velora-text hover:bg-velora-bg"
                      title="Export as Markdown"
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
                      className="p-1 rounded text-velora-text-muted hover:text-velora-text hover:bg-velora-bg"
                      title={editingArtifact ? 'Cancel Edit' : 'Edit Artifact'}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Artifact Selection Tabs */}
              {task.artifacts.length > 0 ? (
                <div className="flex gap-2 py-3 overflow-x-auto border-b border-velora-border">
                  {task.artifacts.map((art) => (
                    <button
                      key={art.id}
                      onClick={() => {
                        setSelectedArtifact(art);
                        setEditingArtifact(false);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                        selectedArtifact?.id === art.id
                          ? 'bg-velora-violet text-white shadow-sm'
                          : 'bg-velora-surface text-velora-text-secondary hover:text-velora-text border border-velora-border'
                      }`}
                    >
                      {art.title}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-velora-text-muted">
                  No deliverables produced yet. Run the workflow steps to generate content.
                </div>
              )}

              {/* Artifact Display / Editor */}
              {selectedArtifact && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-velora-text">{selectedArtifact.title}</span>
                    <span className="text-[10px] text-velora-text-muted">
                      v{selectedArtifact.version} {selectedArtifact.isEdited && '(edited)'}
                    </span>
                  </div>

                  {editingArtifact ? (
                    <div className="space-y-3">
                      <textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="w-full bg-velora-bg border border-velora-border rounded-lg p-3 text-xs text-velora-text font-mono min-h-[350px] focus:outline-none focus:ring-1 focus:ring-velora-violet resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingArtifact(false)}
                          className="btn-ghost text-xs py-1.5 px-3"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveArtifact}
                          disabled={savingArtifact}
                          className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5"
                        >
                          {savingArtifact ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          <span>Save Changes</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-velora-bg border border-velora-border rounded-lg p-4 text-xs text-velora-text leading-relaxed whitespace-pre-wrap font-sans max-h-[500px] overflow-y-auto">
                      {selectedArtifact.content}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Attached Files Box */}
            {task.attachments.length > 0 && (
              <div className="mt-6 pt-4 border-t border-velora-border space-y-2">
                <span className="text-[11px] font-semibold text-velora-text-muted uppercase tracking-wider">
                  Associated Files ({task.attachments.length})
                </span>
                <div className="space-y-1.5">
                  {task.attachments.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between text-xs p-2 rounded bg-velora-bg border border-velora-border"
                    >
                      <span className="truncate max-w-[200px] text-velora-text-secondary">{file.fileName}</span>
                      <span className="text-[10px] text-velora-text-muted">
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

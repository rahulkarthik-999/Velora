'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export default function HistoryPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '50');

      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTasks();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-velora-text">Task History &amp; Archives</h1>
        <p className="text-xs text-velora-text-muted mt-1">
          Search, filter, resume, or export past execution workflows.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-velora-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by goal or title..."
            className="w-full bg-velora-surface border border-velora-border rounded-lg pl-10 pr-4 py-2 text-xs text-velora-text placeholder:text-velora-text-muted focus:outline-none focus:ring-1 focus:ring-velora-violet"
          />
        </form>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-velora-text-muted" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-velora-surface border border-velora-border rounded-lg px-3 py-2 text-xs text-velora-text focus:outline-none focus:ring-1 focus:ring-velora-violet"
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="READY">Ready</option>
            <option value="WAITING_FOR_USER">Waiting for User</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="card p-12 text-center text-xs text-velora-text-muted flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-velora-violet" />
          <span>Searching history...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="card p-12 text-center text-xs text-velora-text-muted">
          No tasks found matching your criteria.
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="card p-4 hover:border-velora-violet/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      task.status === 'COMPLETED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {task.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[11px] text-velora-text-muted flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(task.updatedAt)}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-velora-text group-hover:text-velora-violet-light transition-colors">
                  {task.title}
                </h3>
                <p className="text-xs text-velora-text-muted line-clamp-1 max-w-xl">
                  {task.originalGoal}
                </p>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <div className="text-xs font-semibold text-velora-text">{task.progressPercent}%</div>
                  <div className="text-[10px] text-velora-text-muted">{task.steps?.length || 0} steps</div>
                </div>
                <div className="p-2 rounded-lg bg-velora-surface-hover border border-velora-border text-velora-violet-light group-hover:bg-velora-violet group-hover:text-white transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

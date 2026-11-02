import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, Loader2, X } from 'lucide-react';
import { ipc, onModelInstall } from '../../lib/ipc';
import type { InstallProgress, ModelsOverview, ModelStatus } from '../../types';

/** Mirrors models::SLOW_RTF in Rust. */
const SLOW_RTF = 0.8;

const ROLE_TEXT: Record<ModelStatus['spec']['role'], string> = {
  default: 'Recommended. Best balance of accuracy and speed.',
  fallback: 'Lighter and faster. Used automatically when memory is low.',
  quality: 'Most accurate, slower. For 16 GB PCs.',
};

function progressText(p: InstallProgress): string {
  switch (p.stage) {
    case 'downloading':
      return `Downloading ${Math.floor((p.received / p.total) * 100)}% (${Math.round(p.received / 1_048_576)} of ${Math.round(p.total / 1_048_576)} MB)`;
    case 'verifying':
      return 'Verifying checksum…';
    case 'selfTest':
      return 'Testing transcription on this PC…';
  }
}

export function ModelSetup() {
  const [overview, setOverview] = useState<ModelsOverview | null>(null);
  const [progress, setProgress] = useState<{ modelId: string; progress: InstallProgress } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => ipc.getModels().then(setOverview, (e: Error) => setError(e.message)), []);

  useEffect(() => {
    refresh();
    const unlisten = onModelInstall((e) => {
      if (e.status === 'progress') setProgress({ modelId: e.modelId, progress: e.progress });
      else {
        setProgress(null);
        if (e.status === 'failed') setError(e.message);
        refresh();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const install = async (id: string) => {
    setError(null);
    try {
      await ipc.installModel(id);
      setProgress({ modelId: id, progress: { stage: 'downloading', received: 0, total: 1 } });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const [testing, setTesting] = useState<string | null>(null);
  const retest = async (id: string) => {
    setError(null);
    setTesting(id);
    try {
      await ipc.benchmarkModel(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(null);
    }
  };

  if (!overview) return <p className="muted">{error ?? 'Checking speech models…'}</p>;

  const busy = overview.installing ?? progress?.modelId ?? null;
  const anyInstalled = overview.models.some((m) => m.installed);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">Speech model</h2>
        <p className="muted text-sm">
          Transcription runs on this PC. Download a model once; audio never leaves your computer.
        </p>
      </div>

      {!overview.cpuSupported && (
        <p role="alert" className="text-sm text-red-400">
          This processor doesn't support AVX2, which local transcription needs.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <ul className="card divide-y divide-[var(--border)]">
        {overview.models.map((m) => {
          const installingThis = busy === m.spec.id;
          return (
            <li key={m.spec.id} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1">
                <div className="font-medium">
                  {m.spec.id} <span className="muted text-xs font-normal">· {Math.round(m.spec.sizeBytes / 1_048_576)} MB</span>
                </div>
                <div className="muted text-xs">{ROLE_TEXT[m.spec.role]}</div>
                {installingThis && progress && (
                  <div className="mt-1.5">
                    <div className="h-1.5 overflow-hidden rounded bg-[var(--surface-2)]">
                      <div
                        className="h-full bg-[var(--color-accent)] transition-[width]"
                        style={{
                          width:
                            progress.progress.stage === 'downloading'
                              ? `${(progress.progress.received / progress.progress.total) * 100}%`
                              : '100%',
                        }}
                      />
                    </div>
                    <div className="muted mt-1 text-xs">{progressText(progress.progress)}</div>
                  </div>
                )}
              </div>
              {m.installed ? (
                <div className="flex flex-col items-end gap-1 text-right">
                  <span className="flex items-center gap-1.5 text-sm text-emerald-500">
                    <CheckCircle2 size={15} /> Ready
                    {m.selfTestRtf !== null && (
                      <span className="muted text-xs" title="Processing time ÷ audio length, measured on this PC">
                        ({m.selfTestRtf.toFixed(2)}× real time)
                      </span>
                    )}
                  </span>
                  {m.selfTestRtf === null ? (
                    <span className="text-xs text-amber-500">Speed not measured with current settings</span>
                  ) : (
                    m.selfTestRtf > SLOW_RTF && (
                      <span className="text-xs text-amber-500">Too slow for live speech on this PC; base.en is used when downloaded</span>
                    )
                  )}
                  <button className="btn py-1 text-xs" disabled={!!testing || !!busy} onClick={() => retest(m.spec.id)}>
                    {testing === m.spec.id ? <Loader2 size={12} className="animate-spin" /> : null}
                    {testing === m.spec.id ? 'Testing…' : 'Test speed'}
                  </button>
                </div>
              ) : installingThis ? (
                <button className="btn" onClick={() => ipc.cancelModelInstall()}>
                  {progress?.progress.stage === 'downloading' ? <X size={14} /> : <Loader2 size={14} className="animate-spin" />}
                  {progress?.progress.stage === 'downloading' ? 'Cancel' : 'Working…'}
                </button>
              ) : (
                <button
                  className={m.spec.role === 'default' && !anyInstalled ? 'btn btn-primary' : 'btn'}
                  disabled={!!busy || !overview.cpuSupported}
                  onClick={() => install(m.spec.id)}
                >
                  <Download size={14} /> Download
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

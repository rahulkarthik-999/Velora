import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, HardDrive, MemoryStick, Radio } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { formatMemory } from '../../lib/format';
import { useApp } from '../../stores/app';
import type { SystemInfo } from '../../types';
import { ModelSetup } from './ModelSetup';

function Stat({ icon: Icon, label, value, note }: { icon: typeof Cpu; label: string; value: string; note?: string }) {
  return (
    <div className="card p-4">
      <div className="muted mb-2 flex items-center gap-2 text-xs uppercase tracking-wide">
        <Icon size={14} /> {label}
      </div>
      <div className="text-[15px] font-medium">{value}</div>
      {note && <div className="muted mt-1 text-xs">{note}</div>}
    </div>
  );
}

export function OverviewPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setPage = useApp((s) => s.setPage);

  useEffect(() => {
    ipc.getSystemInfo().then(setInfo, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="muted mt-1">Check this PC is ready, then start a live interview or a practice session.</p>
      </header>

      <div className="card flex items-center justify-between p-5">
        <div>
          <div className="font-medium">Ready for an interview?</div>
          <div className="muted text-sm">The copilot opens in a small always-on-top window you can move anywhere.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setPage('live')}>
          <Radio size={16} /> Go to Live Copilot
        </button>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold">This PC</h2>
        {error && <p className="text-red-400">Could not read system information: {error}</p>}
        {!info && !error && <p className="muted">Checking hardware…</p>}
        {info && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat
                icon={MemoryStick}
                label="Memory"
                value={formatMemory(info.totalMemoryMb)}
                note={`${formatMemory(info.availableMemoryMb)} free now`}
              />
              <Stat icon={Cpu} label="Processor" value={`${info.logicalCores} threads`} note={info.cpuBrand || undefined} />
              <Stat
                icon={HardDrive}
                label="Recommended model"
                value={info.recommendedModel}
                note={info.meetsMinimumRam ? 'Based on this PC’s memory' : 'Lighter model for low memory'}
              />
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              {info.meetsMinimumRam ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span>
                    Meets the 8 GB minimum{info.meetsRecommendedRam ? ' and the 16 GB recommendation' : ''}.
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle size={16} className="text-amber-500" />
                  <span>Below the 8 GB minimum. Velora will use the lighter base.en model.</span>
                </>
              )}
            </div>
            <p className="muted mt-1 text-xs">
              {info.os} · Velora {info.appVersion}
            </p>
          </>
        )}
      </section>

      <ModelSetup />
    </div>
  );
}

import clsx from 'clsx';
import { Mic, MonitorUp, Volume2 } from 'lucide-react';
import type { CaptureState, CaptureStatus, SourceKind } from '../../types';

const SOURCES = [
  { key: 'microphone', label: 'Microphone', Icon: Mic },
  { key: 'systemAudio', label: 'System audio', Icon: Volume2 },
  { key: 'screen', label: 'Screen', Icon: MonitorUp },
] as const;

const STATUS_TEXT: Record<CaptureStatus, string> = {
  active: 'Recording',
  off: 'Off',
  failed: 'Stopped: device error',
  unavailable: 'Not available yet',
};

/** Maps speech RMS (~0.001 quiet to ~0.3 loud) onto 0..1 for a meter. */
export function levelToPercent(rms: number): number {
  if (rms <= 0.001) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 60) / 50));
}

/** Shows exactly what the native layer reports. Never infers "recording" on its own. */
export function CaptureIndicators({
  capture,
  levels,
  compact = false,
}: {
  capture: CaptureState;
  levels?: Partial<Record<SourceKind, number>>;
  compact?: boolean;
}) {
  return (
    <ul className={clsx('flex', compact ? 'gap-3' : 'flex-col gap-2')} aria-label="Capture status">
      {SOURCES.map(({ key, label, Icon }) => {
        const status = capture[key];
        const level = key !== 'screen' && status === 'active' ? levels?.[key] : undefined;
        return (
          <li
            key={key}
            className="flex items-center gap-1.5"
            aria-label={`${label}: ${STATUS_TEXT[status]}`}
            data-testid={`capture-${key}`}
            data-status={status}
          >
            <span
              className={clsx(
                'h-2 w-2 rounded-full',
                status === 'active' && 'bg-red-500 animate-pulse',
                status === 'failed' && 'bg-amber-500',
                status === 'off' && 'bg-zinc-500',
                status === 'unavailable' && 'bg-zinc-600/40'
              )}
            />
            <Icon size={14} className="muted" aria-hidden />
            {level !== undefined && (
              <span className="h-1.5 w-8 overflow-hidden rounded bg-[var(--surface-2)]" aria-hidden>
                <span
                  className="block h-full bg-emerald-500 transition-[width] duration-100"
                  style={{ width: `${levelToPercent(level) * 100}%` }}
                />
              </span>
            )}
            {compact ? (
              <span className="sr-only">{`${label}: ${STATUS_TEXT[status]}`}</span>
            ) : (
              <span>
                {label} <span className="muted">· {STATUS_TEXT[status]}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

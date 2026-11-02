import { Pause, Play, Square } from 'lucide-react';
import { useApp } from '../../stores/app';

export function SessionControls({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const session = useApp((s) => s.session);
  const pending = useApp((s) => s.pending);
  const { pause, resume, end } = useApp.getState();
  const status = session?.status;
  const icon = size === 'sm' ? 14 : 16;

  if (status !== 'active' && status !== 'paused') return null;

  return (
    <div className="flex gap-2">
      {status === 'active' ? (
        <button className="btn" onClick={pause} disabled={pending}>
          <Pause size={icon} /> Pause
        </button>
      ) : (
        <button className="btn" onClick={resume} disabled={pending}>
          <Play size={icon} /> Resume
        </button>
      )}
      <button className="btn btn-danger" onClick={end} disabled={pending}>
        <Square size={icon} /> End
      </button>
    </div>
  );
}

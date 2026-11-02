import { useEffect, useState } from 'react';
import { formatDuration } from '../../lib/format';
import { useApp } from '../../stores/app';

export function SessionTimer() {
  const session = useApp((s) => s.session);
  const receivedAt = useApp((s) => s.sessionReceivedAt);
  const [now, setNow] = useState(Date.now());
  const running = session?.status === 'active';

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running]);

  if (!session) return null;
  const elapsed = session.activeMs + (running ? Math.max(0, now - receivedAt) : 0);
  return <span className="tabular-nums">{formatDuration(elapsed)}</span>;
}

import { Info } from 'lucide-react';
import { useApp } from '../../stores/app';

/** Shows the current app notice (e.g. why a shortcut did nothing) for a few seconds. */
export function Toast() {
  const notice = useApp((s) => s.notice);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="card fixed bottom-4 left-1/2 z-50 flex max-w-[90%] -translate-x-1/2 items-center gap-2 px-3 py-2 text-[13px] shadow-lg"
    >
      <Info size={14} className="text-accent shrink-0" />
      {notice}
    </div>
  );
}

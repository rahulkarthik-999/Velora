import type { LucideIcon } from 'lucide-react';

/** Honest placeholder for a section whose engine isn't built yet. No fake controls. */
export function PlannedFeature({
  icon: Icon,
  title,
  description,
  milestone,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  milestone: string;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-8 py-14 text-center">
      <Icon size={28} className="text-accent" aria-hidden />
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="muted max-w-md">{description}</p>
      <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs muted">Coming in {milestone}</span>
    </div>
  );
}

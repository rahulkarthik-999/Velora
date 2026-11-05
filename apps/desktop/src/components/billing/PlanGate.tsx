import { useEffect, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../../stores/app';
import { useBilling } from '../../stores/billing';

/**
 * Shows its children when the account has an active plan; otherwise a clear path to
 * choose one. The server enforces this too; this only replaces an error with a choice.
 */
export function PlanGate({ feature, children }: { feature: string; children: ReactNode }) {
  const status = useBilling((s) => s.status);
  const refresh = useBilling((s) => s.refresh);
  const setPage = useApp((s) => s.setPage);

  useEffect(() => {
    if (!status) refresh();
  }, [status, refresh]);

  // Until the status loads (or if it can't), don't block: the server decides.
  if (!status || status.entitlement.active) return <>{children}</>;

  const reason = status.entitlement.reason;
  const message =
    reason === 'payment_issue'
      ? 'Your last payment didn’t go through. Update your payment method to keep using Velora.'
      : reason === 'expired' || reason === 'cancelled'
        ? 'Your plan has ended. Renew to continue.'
        : `${feature} is included in every Velora plan.`;

  return (
    <div className="card flex flex-col items-center gap-3 px-8 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-accent)]/15">
        <Lock size={18} className="text-accent" />
      </span>
      <h2 className="font-display text-2xl">Choose a plan to continue</h2>
      <p className="muted max-w-md text-sm">{message}</p>
      <button className="btn btn-primary mt-2" onClick={() => setPage('usage')}>
        See plans
      </button>
    </div>
  );
}

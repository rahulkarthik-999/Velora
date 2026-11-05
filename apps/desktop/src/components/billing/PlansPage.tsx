import { useEffect } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Check, CreditCard, ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { onAccountChanged } from '../../lib/ipc';
import { useBilling, usageLevel, usedPercent } from '../../stores/billing';
import type { BillingInterval, Entitlement, PlanId, PlanOffer } from '../../types';

const INTERVAL_TEXT: Record<BillingInterval, string> = {
  month: '/ month',
  quarter: '/ 3 months',
  year: '/ year',
  one_time: 'one-time',
};

const BADGES: Partial<Record<PlanId, string>> = {
  STARTER: 'Best place to start',
  PRO_ANNUAL: 'Best value',
};

/** Effective monthly price, for comparing billing intervals honestly. */
function perMonth(p: PlanOffer): string | null {
  const months = p.interval === 'quarter' ? 3 : p.interval === 'year' ? 12 : 0;
  return months ? `$${(p.priceUsd / months).toFixed(2)}/mo billed ${p.interval === 'quarter' ? 'quarterly' : 'yearly'}` : null;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function Meter({ label, used, allowance, unit, soon }: { label: string; used: number; allowance: number; unit: string; soon?: boolean }) {
  const pct = usedPercent(used, allowance);
  const level = usageLevel(pct);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="muted tabular-nums">
          {soon ? 'Coming soon' : `${Math.max(0, allowance - used).toLocaleString()} of ${allowance.toLocaleString()} ${unit} left`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden>
        <div
          className={clsx('h-full rounded-full transition-all', level === 100 ? 'bg-red-500' : level ? 'bg-amber-500' : 'bg-[var(--color-accent)]')}
          style={{ width: `${soon ? 0 : pct}%` }}
        />
      </div>
      {!soon && level && (
        <p className={clsx('text-xs', level === 100 ? 'text-red-400' : 'text-amber-500')}>
          {level === 100 ? `You've used all of this month's ${label.toLowerCase()}.` : `${pct}% used this month.`}
        </p>
      )}
    </div>
  );
}

function CurrentPlan({ ent, onPortal }: { ent: Entitlement; onPortal: () => void }) {
  const a = ent.allowances;
  const statusText =
    ent.reason === 'payment_issue'
      ? 'Payment issue: update your payment method'
      : ent.cancelAtPeriodEnd && ent.renewsAt
        ? `Cancels on ${formatDate(ent.renewsAt)}`
        : ent.plan?.interval === 'one_time'
          ? 'Lifetime access'
          : ent.renewsAt
            ? `Renews on ${formatDate(ent.renewsAt)}`
            : '';
  return (
    <section className="card flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="muted text-xs uppercase tracking-wider">Current plan</p>
          <h2 className="font-display mt-1 text-3xl">{ent.plan?.name}</h2>
          <p className={clsx('mt-1 text-sm', ent.reason === 'payment_issue' ? 'text-amber-500' : 'muted')}>{statusText}</p>
        </div>
        <button className="btn" onClick={onPortal}>
          <CreditCard size={15} /> Manage subscription <ExternalLink size={12} />
        </button>
      </div>
      {a && (
        <div className="grid gap-5 sm:grid-cols-3">
          <Meter label="AI credits" used={ent.used.aiCredits} allowance={a.aiCredits} unit="credits" />
          <Meter label="Transcription minutes" used={ent.used.transcriptionMinutes} allowance={a.transcriptionMinutes} unit="min" />
          <Meter label="Screenshot analyses" used={ent.used.screenshots} allowance={a.screenshots} unit="" soon />
        </div>
      )}
      <p className="muted text-xs">Allowances reset on {formatDate(ent.resetsAt)}. Unused allowances don't roll over.</p>
    </section>
  );
}

function PlanCard({ plan, current, busy, onChoose }: { plan: PlanOffer; current: boolean; busy: boolean; onChoose: () => void }) {
  const badge = BADGES[plan.id];
  const featured = plan.id === 'PRO_ANNUAL';
  return (
    <div className={clsx('card relative flex flex-col gap-4 p-5', featured && 'plan-featured')}>
      {badge && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 text-[11px] font-semibold text-black">
          {badge}
        </span>
      )}
      <div>
        <h3 className="font-semibold">{plan.name}</h3>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="font-display text-4xl">${plan.priceUsd}</span>
          <span className="muted text-sm">{INTERVAL_TEXT[plan.interval]}</span>
        </div>
        <p className="muted mt-1 h-4 text-xs">{perMonth(plan) ?? (plan.interval === 'one_time' ? 'Pay once. No recurring charges.' : 'Billed monthly')}</p>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-accent" /> {plan.allowances.transcriptionMinutes} transcription minutes / month</li>
        <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-accent" /> {plan.allowances.aiCredits} AI credits / month</li>
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-accent" /> {f}</li>
        ))}
      </ul>
      <button className={clsx('btn mt-auto justify-center', !current && 'btn-primary')} disabled={busy || current} onClick={onChoose}>
        {current ? 'Your plan' : plan.interval === 'one_time' ? 'Buy Lifetime' : `Choose ${plan.name}`}
      </button>
    </div>
  );
}

/** Plan, usage this month, payment history, and the plans on offer. */
export function PlansPage() {
  const { status, error, loading, awaitingPlan, refresh, checkout, portal } = useBilling();

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const unlisten = onAccountChanged(() => refresh());
    return () => {
      window.removeEventListener('focus', onFocus);
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const ent = status?.entitlement;
  const hasPlan = Boolean(ent?.plan) && ent?.reason !== 'no_plan';

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Plan &amp; usage</h1>
          <p className="muted mt-2 max-w-2xl">
            Every plan includes the live interview copilot, answers grounded in your own resume and notes, and practice with
            feedback. Allowances renew each month. AI usage is never unlimited.
          </p>
        </div>
        <button className="btn" onClick={refresh} disabled={loading} aria-label="Refresh">
          <RefreshCw size={14} className={clsx(loading && 'animate-spin')} />
        </button>
      </header>

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle size={15} /> {error}
        </p>
      )}

      {awaitingPlan && (
        <div className="card flex items-center gap-3 p-4 text-sm" role="status">
          <Loader2 size={16} className="animate-spin text-accent" />
          Finish checkout in your browser. Your plan switches on here automatically once the payment is confirmed.
        </div>
      )}

      {!status && !error && <p className="muted">Loading your plan…</p>}

      {ent && hasPlan && <CurrentPlan ent={ent} onPortal={portal} />}

      {ent && !hasPlan && (
        <div className="card flex items-center gap-4 p-5">
          <Sparkles size={22} className="text-accent" />
          <div className="flex-1">
            <div className="font-medium">Choose a plan to start using the copilot</div>
            <div className="muted text-sm">
              {ent.reason === 'expired' || ent.reason === 'cancelled'
                ? 'Your previous plan has ended. Pick a plan to continue.'
                : 'Velora is a paid app. There is no free trial; every plan can be cancelled any time.'}
            </div>
          </div>
        </div>
      )}

      {status && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">{hasPlan ? 'All plans' : 'Plans'}</h2>
          <div className="grid gap-4 pt-2 md:grid-cols-2 xl:grid-cols-5">
            {status.plans.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                current={ent?.plan?.id === p.id && ent.active}
                busy={awaitingPlan !== null}
                onChoose={() => (hasPlan && ent?.active && p.interval !== 'one_time' ? portal() : checkout(p.id))}
              />
            ))}
          </div>
          <p className="muted text-xs leading-relaxed">
            Prices in USD. Monthly, quarterly and yearly plans renew automatically until you cancel; cancel any time from
            Manage subscription and keep access until the end of the period you paid for. Lifetime is a single payment with
            monthly fair-use allowances and no recurring charges. Payments are processed by Dodo Payments; Velora never sees
            your card details.
          </p>
        </section>
      )}

      {status && status.payments.length > 0 && (
        <section className="card px-5 py-3">
          <h2 className="py-2 text-sm font-semibold">Payment history</h2>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {status.payments.map((p) => (
              <li key={p.externalId} className="flex items-center justify-between py-2.5">
                <span>{formatDate(p.createdAt)}</span>
                <span className="muted">{p.plan ? status.plans.find((x) => x.id === p.plan)?.name ?? p.plan : '—'}</span>
                <span className="tabular-nums">
                  {(p.amount / 100).toLocaleString(undefined, { style: 'currency', currency: p.currency || 'USD' })}
                </span>
                <span className={clsx('w-28 text-right text-xs', p.status === 'succeeded' ? 'text-emerald-500' : 'muted')}>
                  {p.status.replace(/_/g, ' ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

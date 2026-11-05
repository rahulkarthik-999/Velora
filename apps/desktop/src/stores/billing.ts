import { create } from 'zustand';
import { ipc } from '../lib/ipc';
import type { BillingStatus, PlanId } from '../types';

/** After checkout opens, check for the new plan this often, for up to 15 minutes. */
const ACTIVATION_POLL_MS = 5_000;
const ACTIVATION_TIMEOUT_MS = 15 * 60_000;

interface BillingStore {
  status: BillingStatus | null;
  loading: boolean;
  error: string | null;
  /** A checkout was opened; waiting for Dodo's webhook to switch the plan on. */
  awaitingPlan: PlanId | null;

  refresh: () => Promise<void>;
  checkout: (plan: PlanId) => Promise<void>;
  portal: () => Promise<void>;
  reset: () => void;
}

let pollTimer = 0;

export const useBilling = create<BillingStore>((set, get) => ({
  status: null,
  loading: false,
  error: null,
  awaitingPlan: null,

  refresh: async () => {
    set({ loading: true });
    try {
      const status = await ipc.billingStatus();
      set({ status, error: null });
      if (status.entitlement.active && get().awaitingPlan) {
        window.clearInterval(pollTimer);
        set({ awaitingPlan: null });
      }
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  checkout: async (plan) => {
    set({ error: null });
    try {
      await ipc.billingCheckout(plan);
      set({ awaitingPlan: plan });
      const started = Date.now();
      window.clearInterval(pollTimer);
      pollTimer = window.setInterval(() => {
        if (Date.now() - started > ACTIVATION_TIMEOUT_MS) {
          window.clearInterval(pollTimer);
          set({ awaitingPlan: null });
          return;
        }
        get().refresh();
      }, ACTIVATION_POLL_MS);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  portal: async () => {
    set({ error: null });
    try {
      await ipc.billingPortal();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  reset: () => {
    window.clearInterval(pollTimer);
    set({ status: null, error: null, awaitingPlan: null });
  },
}));

/** Share of a monthly allowance used, 0-100. */
export function usedPercent(used: number, allowance: number): number {
  return allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 0;
}

/** The usage notice to show at 75, 90 and 100 percent, or null below that. */
export function usageLevel(pct: number): 75 | 90 | 100 | null {
  if (pct >= 100) return 100;
  if (pct >= 90) return 90;
  if (pct >= 75) return 75;
  return null;
}

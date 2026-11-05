import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }));

const { PlansPage } = await import('./PlansPage');
const { PlanGate } = await import('./PlanGate');
const { useBilling, usageLevel, usedPercent } = await import('../../stores/billing');

const plans = [
  { id: 'STARTER', name: 'Starter', priceUsd: 9, interval: 'month', allowances: { transcriptionMinutes: 30, aiCredits: 150, screenshots: 10 }, features: ['Core Live Interview Copilot'] },
  { id: 'PRO_ANNUAL', name: 'Pro Annual', priceUsd: 149, interval: 'year', allowances: { transcriptionMinutes: 150, aiCredits: 750, screenshots: 50 }, features: [] },
  { id: 'LIFETIME', name: 'Lifetime', priceUsd: 299, interval: 'one_time', allowances: { transcriptionMinutes: 60, aiCredits: 300, screenshots: 20 }, features: [] },
];

const noPlan = {
  active: false, reason: 'no_plan', plan: null, status: null, renewsAt: null, cancelAtPeriodEnd: false, resetsAt: null,
  allowances: null, used: { aiCredits: 0, transcriptionMinutes: 0, screenshots: 0 }, remaining: null,
};

afterEach(() => {
  cleanup();
  invoke.mockReset();
  useBilling.getState().reset();
});

describe('usage thresholds', () => {
  it('warn at 75, 90 and 100 percent', () => {
    expect(usedPercent(113, 150)).toBe(75);
    expect([usageLevel(74), usageLevel(75), usageLevel(91), usageLevel(100)]).toEqual([null, 75, 90, 100]);
    expect(usedPercent(5, 0)).toBe(0);
  });
});

describe('PlansPage', () => {
  it('shows all plans with honest billing terms and starts checkout', async () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === 'billing_status' ? Promise.resolve({ entitlement: noPlan, payments: [], plans }) : Promise.resolve()
    );
    render(<PlansPage />);
    expect(await screen.findByText('Choose a plan to start using the copilot')).toBeTruthy();
    expect(screen.getByText('Best value')).toBeTruthy();
    expect(screen.getByText('$12.42/mo billed yearly')).toBeTruthy();
    expect(screen.getByText('Pay once. No recurring charges.')).toBeTruthy();
    expect(screen.queryByText(/unlimited (ai|credits|minutes|usage)\b/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro Annual' }));
    await screen.findByText(/Finish checkout in your browser/);
    expect(invoke).toHaveBeenCalledWith('billing_checkout', { plan: 'PRO_ANNUAL' });
  });

  it('shows the current plan, renewal and usage', async () => {
    invoke.mockResolvedValue({
      entitlement: {
        ...noPlan, active: true, reason: 'active', plan: { id: 'STARTER', name: 'Starter', interval: 'month' },
        renewsAt: '2026-12-15T10:00:00Z', resetsAt: '2026-12-15T10:00:00Z', allowances: plans[0].allowances,
        used: { aiCredits: 140, transcriptionMinutes: 5, screenshots: 0 }, remaining: { aiCredits: 10, transcriptionMinutes: 25, screenshots: 10 },
      },
      payments: [],
      plans,
    });
    render(<PlansPage />);
    expect(await screen.findByText(/Renews on/)).toBeTruthy();
    expect(screen.getByText('10 of 150 credits left')).toBeTruthy();
    expect(screen.getByText('93% used this month.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Your plan' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('PlanGate', () => {
  it('replaces a paid feature with a way to choose a plan', async () => {
    invoke.mockResolvedValue({ entitlement: noPlan, payments: [], plans });
    render(
      <PlanGate feature="The live interview copilot">
        <button>Start copilot</button>
      </PlanGate>
    );
    expect(await screen.findByText('Choose a plan to continue')).toBeTruthy();
    expect(screen.queryByText('Start copilot')).toBeNull();
  });

  it('shows the feature when the plan is active', async () => {
    invoke.mockResolvedValue({ entitlement: { ...noPlan, active: true, reason: 'active' }, payments: [], plans });
    render(
      <PlanGate feature="Practice">
        <button>Start copilot</button>
      </PlanGate>
    );
    expect(await screen.findByText('Start copilot')).toBeTruthy();
  });
});

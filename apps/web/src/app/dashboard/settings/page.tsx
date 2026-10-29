'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  Shield,
  CreditCard,
  User,
  Trash2,
  CheckCircle2,
  Sparkles,
  Zap,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

export default function SettingsPage() {
  const { data: session } = useSession();
  const [usageData, setUsageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch('/api/usage')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUsageData(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleDeleteAccount = async () => {
    if (
      !confirm(
        'CAUTION: This will permanently delete your account, all associated workflows, uploaded documents, and generated artifacts. This action cannot be undone. Proceed?'
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch('/api/user', { method: 'DELETE' });
      if (res.ok) {
        signOut({ callbackUrl: '/' });
      } else {
        alert('Failed to delete account');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-velora-text">Account &amp; Subscriptions</h1>
        <p className="text-xs text-velora-text-muted mt-1">
          Manage your execution quotas, billing tier, profile, and data controls.
        </p>
      </div>

      {/* Profile Overview */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-velora-text">
          <User className="w-4 h-4 text-velora-violet" />
          <span>Profile Information</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-velora-text-muted block mb-1">Full Name</label>
            <div className="p-2.5 rounded-lg bg-velora-bg border border-velora-border text-velora-text">
              {session?.user?.name || 'Velora User'}
            </div>
          </div>
          <div>
            <label className="text-velora-text-muted block mb-1">Email Address</label>
            <div className="p-2.5 rounded-lg bg-velora-bg border border-velora-border text-velora-text">
              {session?.user?.email || 'authenticated@google.com'}
            </div>
          </div>
        </div>
      </div>

      {/* Subscription & Entitlements */}
      <div className="card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-velora-text">
            <CreditCard className="w-4 h-4 text-velora-violet" />
            <span>Subscription &amp; Quotas</span>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-velora-violet-bg text-velora-violet-light border border-velora-violet-border font-semibold">
            {usageData?.tier || 'FREE'} PLAN
          </span>
        </div>

        {loading ? (
          <div className="text-xs text-velora-text-muted flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-velora-violet" />
            <span>Loading billing details...</span>
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-velora-bg border border-velora-border">
              <span className="text-[11px] text-velora-text-muted block mb-1">Monthly AI Credits</span>
              <div className="text-xl font-bold text-velora-text">
                {usageData?.usage?.creditsUsed || 0} / {usageData?.limits?.monthlyAICredits || 50}
              </div>
              <span className="text-[10px] text-velora-text-muted">Resets on the 1st of every month</span>
            </div>

            <div className="p-4 rounded-xl bg-velora-bg border border-velora-border">
              <span className="text-[11px] text-velora-text-muted block mb-1">Active Tasks</span>
              <div className="text-xl font-bold text-velora-text">
                {usageData?.tasks?.active || 0} / {usageData?.limits?.maxActiveTasks || 3}
              </div>
              <span className="text-[10px] text-velora-text-muted">Concurrent tasks in progress</span>
            </div>

            <div className="p-4 rounded-xl bg-velora-bg border border-velora-border">
              <span className="text-[11px] text-velora-text-muted block mb-1">Max Attachment Size</span>
              <div className="text-xl font-bold text-velora-text">
                {(usageData?.limits?.maxFileSize || 5242880) / (1024 * 1024)} MB
              </div>
              <span className="text-[10px] text-velora-text-muted">Per uploaded document</span>
            </div>
          </div>
        )}

        {/* Upgrade Cards */}
        <div className="border-t border-velora-border pt-6">
          <h3 className="text-xs font-bold text-velora-text uppercase tracking-wider mb-4">
            Available Plan Upgrades
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-velora-bg border border-velora-violet/50 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-sm font-bold text-velora-text">Velora Plus</h4>
                  <div className="text-lg font-bold text-velora-violet-light mt-0.5">
                    ₹499 <span className="text-xs font-normal text-velora-text-muted">/ month</span>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-velora-violet text-white font-medium">Recommended</span>
              </div>
              <ul className="text-xs text-velora-text-secondary space-y-1.5">
                <li>• 500 AI credits / month</li>
                <li>• 15 concurrent active tasks</li>
                <li>• 15MB file upload limit</li>
                <li>• Full handler registry</li>
              </ul>
              <button
                onClick={() => alert('Dodo Payments checkout is active. Configure DODO_PRODUCT_PLUS in production.')}
                className="btn-primary w-full text-xs py-2 text-center block font-semibold"
              >
                Upgrade to Plus
              </button>
            </div>

            <div className="p-4 rounded-xl bg-velora-bg border border-velora-border space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-sm font-bold text-velora-text">Velora Pro</h4>
                  <div className="text-lg font-bold text-velora-text mt-0.5">
                    ₹999 <span className="text-xs font-normal text-velora-text-muted">/ month</span>
                  </div>
                </div>
              </div>
              <ul className="text-xs text-velora-text-secondary space-y-1.5">
                <li>• 2,000 AI credits / month</li>
                <li>• 50 concurrent active tasks</li>
                <li>• 20MB file upload limit</li>
                <li>• Priority execution &amp; exports</li>
              </ul>
              <button
                onClick={() => alert('Dodo Payments checkout is active. Configure DODO_PRODUCT_PRO in production.')}
                className="btn-secondary w-full text-xs py-2 text-center block font-semibold"
              >
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone: Account Deletion */}
      <div className="card p-6 border-red-500/20 bg-red-950/10 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-red-400">
          <AlertTriangle className="w-4 h-4" />
          <span>Danger Zone: Account Deletion</span>
        </div>
        <p className="text-xs text-velora-text-secondary leading-relaxed">
          Permanently delete your Velora account. This irrevocably purges your profile, all created tasks,
          workflow states, uploaded attachments, and generated deliverables.
        </p>
        <button
          onClick={handleDeleteAccount}
          disabled={deleting}
          className="bg-red-600 hover:bg-red-500 text-white font-semibold text-xs py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          <span>Permanently Delete Account</span>
        </button>
      </div>
    </div>
  );
}

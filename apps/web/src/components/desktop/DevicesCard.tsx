'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Monitor } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** Desktop apps signed in to this account, with remote sign-out. */
export function DevicesCard() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/devices')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Could not load devices'))))
      .then((data) => setDevices(data.devices))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const revoke = async (device: Device) => {
    if (!confirm(`Sign out "${device.name}"? It will need to be connected again.`)) return;
    setRevoking(device.id);
    try {
      const res = await fetch(`/api/devices/${device.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not sign out the device');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2 text-sm font-bold text-velora-text">
        <Monitor className="w-4 h-4 text-velora-violet" />
        <span>Desktop apps</span>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {devices === null && !error ? (
        <div className="text-xs text-velora-text-muted flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-velora-violet" /> Loading…
        </div>
      ) : devices?.length === 0 ? (
        <p className="text-xs text-velora-text-muted">
          No desktop apps are connected. Open Velora on your PC and choose Account → Connect.
        </p>
      ) : (
        <ul className="divide-y divide-velora-border">
          {devices?.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-3 text-xs">
              <div>
                <div className="font-semibold text-velora-text">{d.name}</div>
                <div className="text-velora-text-muted">
                  Connected {date(d.createdAt)}
                  {d.lastUsedAt ? ` · last used ${date(d.lastUsedAt)}` : ''}
                </div>
              </div>
              <button className="btn-secondary text-xs" disabled={revoking === d.id} onClick={() => revoke(d)}>
                {revoking === d.id ? 'Signing out…' : 'Sign out'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import type { AnswerStyle, AudioDevice, AudioDevices, Settings, ShortcutSettings, Theme } from '../../types';

function DeviceSelect({
  devices,
  value,
  disabled,
  label,
  onChange,
}: {
  devices: AudioDevice[] | undefined;
  value: string | null;
  disabled: boolean;
  label: string;
  onChange: (id: string | null) => void;
}) {
  const missing = value !== null && devices !== undefined && !devices.some((d) => d.id === value);
  return (
    <>
      <select
        className="field"
        aria-label={label}
        disabled={disabled || devices === undefined}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Windows default{devices?.find((d) => d.isDefault) ? ` (${devices.find((d) => d.isDefault)!.name})` : ''}</option>
        {devices?.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
        {missing && <option value={value}>Disconnected device</option>}
      </select>
      {missing && <p className="mt-1 text-xs text-amber-500">This device isn't connected; the Windows default will be used.</p>}
    </>
  );
}

const SHORTCUT_LABELS: Record<keyof ShortcutSettings, string> = {
  toggleCopilot: 'Show / hide copilot panel',
  pauseResume: 'Pause / resume session',
  endSession: 'End session',
};

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] items-start gap-4 py-3">
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="muted text-xs">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const saved = useApp((s) => s.settings);
  const saveSettings = useApp((s) => s.saveSettings);
  const [draft, setDraft] = useState<Settings | null>(saved);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => setDraft(saved), [saved]);

  const [devices, setDevices] = useState<AudioDevices | null>(null);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  useEffect(() => {
    ipc.listAudioDevices().then(setDevices, (e: Error) => setDevicesError(e.message));
  }, []);

  if (!draft || !saved) return <p className="muted">Loading settings…</p>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const update = (patch: Partial<Settings>) => {
    setJustSaved(false);
    setDraft({ ...draft, ...patch });
  };

  const onSave = async () => {
    setSaving(true);
    const ok = await saveSettings(draft);
    setSaving(false);
    setJustSaved(ok);
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">AI Settings</h1>
        <p className="muted mt-1">Saved on this PC.</p>
      </header>

      <section className="card divide-y divide-[var(--border)] px-5">
        <Row label="Theme">
          <select className="field" value={draft.theme} onChange={(e) => update({ theme: e.target.value as Theme })}>
            <option value="system">Match Windows</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Row>
        <Row label="Model answer style" hint="How practice feedback writes its example answers.">
          <select
            className="field"
            value={draft.answerStyle}
            onChange={(e) => update({ answerStyle: e.target.value as AnswerStyle })}
          >
            <option value="concise">Concise: about 60–90 seconds spoken</option>
            <option value="detailed">Detailed: about 2 minutes</option>
            <option value="star">STAR: situation, task, action, result</option>
          </select>
        </Row>
        <Row label="Custom instructions" hint="Tailors practice questions, feedback and model answers.">
          <textarea
            className="field min-h-24"
            value={draft.customInstructions}
            maxLength={1500}
            placeholder="e.g. I'm moving from QA to backend development. Keep answers simple and confident, and focus on Java and system design."
            onChange={(e) => update({ customInstructions: e.target.value })}
            aria-label="Custom instructions"
          />
          <div className="muted mt-1 text-right text-xs">{draft.customInstructions.length} / 1500</div>
        </Row>
        <Row label="Speech model" hint="Download models on the Overview page.">
          <select
            className="field"
            value={draft.transcription.modelId}
            onChange={(e) => update({ transcription: { modelId: e.target.value } })}
          >
            <option value="small.en-q5_1">small.en: recommended</option>
            <option value="base.en-q5_1">base.en: lighter and faster</option>
            <option value="small.en-q8_0">small.en Q8: most accurate</option>
          </select>
        </Row>
      </section>

      <section className="card divide-y divide-[var(--border)] px-5">
        <h2 className="py-3 text-sm font-semibold">Audio</h2>
        <Row label="Microphone" hint="Records your answers in Practice.">
          <DeviceSelect
            devices={devices?.inputs}
            value={draft.audio.microphoneDeviceId}
            disabled={false}
            label="Microphone device"
            onChange={(id) => update({ audio: { ...draft.audio, microphoneDeviceId: id } })}
          />
        </Row>
        <Row label="System audio" hint="What a recorded session transcribes: sound from your speakers or headphones.">
          <DeviceSelect
            devices={devices?.outputs}
            value={draft.audio.systemAudioDeviceId}
            disabled={false}
            label="Output device"
            onChange={(id) => update({ audio: { ...draft.audio, systemAudioDeviceId: id } })}
          />
        </Row>
        {devicesError && <p className="py-2 text-sm text-red-400">{devicesError}</p>}
      </section>

      <section className="card divide-y divide-[var(--border)] px-5">
        <h2 className="py-3 text-sm font-semibold">Keyboard shortcuts</h2>
        {(Object.keys(SHORTCUT_LABELS) as (keyof ShortcutSettings)[]).map((key) => (
          <Row key={key} label={SHORTCUT_LABELS[key]} hint="Works from any app. Example: Ctrl+Shift+V">
            <input
              className="field font-mono"
              value={draft.shortcuts[key]}
              spellCheck={false}
              aria-label={SHORTCUT_LABELS[key]}
              onChange={(e) => update({ shortcuts: { ...draft.shortcuts, [key]: e.target.value } })}
            />
          </Row>
        ))}
      </section>

      <section className="card px-5">
        <Row label="Velora API" hint="Only change this for development.">
          <input
            className="field font-mono"
            value={draft.apiBaseUrl}
            spellCheck={false}
            aria-label="Velora API URL"
            onChange={(e) => update({ apiBaseUrl: e.target.value })}
          />
        </Row>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={onSave} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button className="btn" onClick={() => setDraft(saved)} disabled={!dirty || saving}>
          Discard
        </button>
        {justSaved && !dirty && (
          <span className="flex items-center gap-1 text-sm text-emerald-500">
            <Check size={14} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

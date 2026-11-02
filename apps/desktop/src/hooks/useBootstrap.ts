import { useEffect } from 'react';
import { ipc, onPipelineEvent, onSessionChanged, onSettingsChanged } from '../lib/ipc';
import { useApp } from '../stores/app';
import { useTranscript } from '../stores/transcript';
import type { Theme } from '../types';

/** Loads state from Rust and keeps this window in sync with the others. */
export function useBootstrap() {
  const theme = useApp((s) => s.settings?.theme ?? 'system');
  const sessionId = useApp((s) => s.session?.id ?? null);

  useEffect(() => {
    const { load, setSession, setSettings } = useApp.getState();
    load();
    const unlisten = [
      onSessionChanged(setSession),
      onSettingsChanged(setSettings),
      onPipelineEvent((event) => {
        useTranscript.getState().handle(event);
        // A device dropping out changes the capture indicators.
        if (event.kind === 'sourceFailed') ipc.getSession().then(setSession, () => {});
      }),
    ];
    return () => unlisten.forEach((p) => p.then((fn) => fn()));
  }, []);

  useEffect(() => {
    useTranscript.getState().attach(sessionId);
  }, [sessionId]);

  useEffect(() => applyTheme(theme), [theme]);
}

function applyTheme(theme: Theme) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const update = () => {
    const dark = theme === 'dark' || (theme === 'system' && media.matches);
    document.documentElement.classList.toggle('dark', dark);
  };
  update();
  if (theme === 'system') {
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }
}

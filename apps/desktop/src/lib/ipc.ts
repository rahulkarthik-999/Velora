import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AudioDevices,
  InstallEvent,
  ModelsOverview,
  PipelineEvent,
  SessionMode,
  SessionRecord,
  SessionSnapshot,
  Settings,
  SystemInfo,
  TranscriptSegment,
} from '../types';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Rust commands reject with a plain message string; normalise to Error. */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : e instanceof Error ? e.message : `Command ${cmd} failed`);
  }
}

export const ipc = {
  getSettings: () => call<Settings>('get_settings'),
  updateSettings: (settings: Settings) => call<Settings>('update_settings', { settings }),
  getSystemInfo: () => call<SystemInfo>('get_system_info'),
  listAudioDevices: () => call<AudioDevices>('list_audio_devices'),
  getModels: () => call<ModelsOverview>('get_models'),
  installModel: (modelId: string) => call<void>('install_model', { modelId }),
  cancelModelInstall: () => call<void>('cancel_model_install'),
  getSession: () => call<SessionSnapshot>('get_session'),
  startSession: (mode: SessionMode) => call<SessionSnapshot>('start_session', { mode }),
  pauseSession: () => call<SessionSnapshot>('pause_session'),
  resumeSession: () => call<SessionSnapshot>('resume_session'),
  endSession: () => call<SessionSnapshot>('end_session'),
  getTranscript: (sessionId: string) => call<TranscriptSegment[]>('get_transcript', { sessionId }),
  updateTranscriptSegment: (id: string, text: string) =>
    call<TranscriptSegment>('update_transcript_segment', { id, text }),
  listSessions: () => call<SessionRecord[]>('list_sessions'),
  deleteSession: (id: string) => call<void>('delete_session', { id }),
  showCopilot: () => call<void>('show_copilot'),
  toggleCopilot: () => call<void>('toggle_copilot'),
  showMain: () => call<void>('show_main'),
};

export function onSessionChanged(cb: (s: SessionSnapshot) => void): Promise<UnlistenFn> {
  return listen<SessionSnapshot>('session-changed', (e) => cb(e.payload));
}

export function onSettingsChanged(cb: (s: Settings) => void): Promise<UnlistenFn> {
  return listen<Settings>('settings-changed', (e) => cb(e.payload));
}

export function onPipelineEvent(cb: (e: PipelineEvent) => void): Promise<UnlistenFn> {
  return listen<PipelineEvent>('pipeline-event', (e) => cb(e.payload));
}

export function onModelInstall(cb: (e: InstallEvent) => void): Promise<UnlistenFn> {
  return listen<InstallEvent>('model-install', (e) => cb(e.payload));
}

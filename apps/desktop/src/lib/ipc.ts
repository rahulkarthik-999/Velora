import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AccountEvent,
  AccountStatus,
  AudioDevices,
  CandidateFact,
  Difficulty,
  FactKind,
  Job,
  LinkStart,
  PracticeFocus,
  PracticeItem,
  PracticeSessionSummary,
  PracticeView,
  ProfileView,
  ResumeInfo,
  InstallEvent,
  ModelsOverview,
  ModelStatus,
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
  benchmarkModel: (modelId: string) => call<ModelStatus>('benchmark_model', { modelId }),
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
  accountStatus: () => call<AccountStatus>('account_status'),
  accountStartLink: () => call<LinkStart>('account_start_link'),
  accountCancelLink: () => call<void>('account_cancel_link'),
  accountSignOut: () => call<void>('account_sign_out'),
  importResume: (path: string) => call<ResumeInfo>('import_resume', { path }),
  getResume: () => call<ResumeInfo | null>('get_resume'),
  readDocument: (path: string) => call<string>('read_document', { path }),
  getProfile: () => call<ProfileView>('get_profile'),
  extractProfile: () => call<ProfileView>('extract_profile'),
  saveFact: (id: string | null, kind: FactKind, text: string) => call<CandidateFact>('save_fact', { id, kind, text }),
  deleteFact: (id: string) => call<void>('delete_fact', { id }),
  listJobs: () => call<Job[]>('list_jobs'),
  saveJob: (job: { id: string | null; title: string; company: string; description: string }) => call<Job>('save_job', job),
  deleteJob: (id: string) => call<void>('delete_job', { id }),
  createPractice: (jobId: string, focus: PracticeFocus, difficulty: Difficulty, count: number) =>
    call<PracticeView>('create_practice', { jobId, focus, difficulty, count }),
  listPractice: () => call<PracticeSessionSummary[]>('list_practice'),
  getPractice: (sessionId: string) => call<PracticeItem[]>('get_practice', { sessionId }),
  deletePractice: (sessionId: string) => call<void>('delete_practice', { sessionId }),
  savePracticeAnswer: (itemId: string, answer: string) => call<PracticeItem>('save_practice_answer', { itemId, answer }),
  practiceRecordStart: (itemId: string) => call<void>('practice_record_start', { itemId }),
  practiceRecordStop: () => call<PracticeItem>('practice_record_stop'),
  practiceFeedback: (itemId: string) => call<PracticeItem>('practice_feedback', { itemId }),
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

export function onAppNotice(cb: (message: string) => void): Promise<UnlistenFn> {
  return listen<string>('app-notice', (e) => cb(e.payload));
}

export function onModelInstall(cb: (e: InstallEvent) => void): Promise<UnlistenFn> {
  return listen<InstallEvent>('model-install', (e) => cb(e.payload));
}

export function onAccountChanged(cb: (e: AccountEvent) => void): Promise<UnlistenFn> {
  return listen<AccountEvent>('account-changed', (e) => cb(e.payload));
}

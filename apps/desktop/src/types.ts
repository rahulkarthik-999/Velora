// Mirrors the serde types in src-tauri/src. Keep the two in sync.

export type Theme = 'system' | 'dark' | 'light';
export type AnswerStyle = 'concise' | 'detailed' | 'star';

export interface ShortcutSettings {
  toggleCopilot: string;
  pauseResume: string;
  endSession: string;
}

export interface Settings {
  schemaVersion: number;
  theme: Theme;
  answerStyle: AnswerStyle;
  shortcuts: ShortcutSettings;
  audio: {
    captureMicrophone: boolean;
    captureSystemAudio: boolean;
    /** null = Windows default device */
    microphoneDeviceId: string | null;
    systemAudioDeviceId: string | null;
    /** Ignore the mic while system audio has speech (laptop speakers). */
    echoGuard: boolean;
  };
  transcription: { modelId: string };
  apiBaseUrl: string;
}

export type SessionMode = 'live' | 'practice';
export type SessionStatus = 'idle' | 'active' | 'paused' | 'ended';
export type CaptureStatus = 'off' | 'active' | 'failed' | 'unavailable';

export interface CaptureState {
  microphone: CaptureStatus;
  systemAudio: CaptureStatus;
  screen: CaptureStatus;
}

export interface SessionSnapshot {
  id: string | null;
  mode: SessionMode | null;
  status: SessionStatus;
  startedAtMs: number | null;
  endedAtMs: number | null;
  activeMs: number;
  capture: CaptureState;
}

export interface SystemInfo {
  appVersion: string;
  os: string;
  cpuBrand: string;
  logicalCores: number;
  totalMemoryMb: number;
  availableMemoryMb: number;
  meetsMinimumRam: boolean;
  meetsRecommendedRam: boolean;
  recommendedModel: string;
  modelsDir: string;
  modelsDirExists: boolean;
  installedModels: string[];
}

export type SourceKind = 'microphone' | 'systemAudio';

export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface AudioDevices {
  inputs: AudioDevice[];
  outputs: AudioDevice[];
}

export interface ModelSpec {
  id: string;
  quantization: string;
  fileName: string;
  sizeBytes: number;
  role: 'default' | 'fallback' | 'quality';
}

export interface ModelStatus {
  spec: ModelSpec;
  installed: boolean;
  selfTestRtf: number | null;
}

export interface ModelsOverview {
  models: ModelStatus[];
  cpuSupported: boolean;
  installing: string | null;
  engineInfo: string;
}

export type InstallProgress =
  | { stage: 'downloading'; received: number; total: number }
  | { stage: 'verifying' }
  | { stage: 'selfTest' };

export type InstallEvent =
  | { status: 'progress'; modelId: string; progress: InstallProgress }
  | { status: 'done'; modelId: string; model: ModelStatus }
  | { status: 'failed'; modelId: string; message: string };

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  source: SourceKind;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  corrected: boolean;
}

export interface SessionRecord {
  id: string;
  mode: SessionMode;
  startedAtMs: number;
  endedAtMs: number | null;
  activeMs: number;
  status: string;
  segmentCount: number;
}

export type PipelineEvent =
  | { kind: 'segment'; segment: TranscriptSegment }
  | { kind: 'level'; source: SourceKind; rms: number }
  | { kind: 'transcriberLoading'; modelId: string }
  | { kind: 'transcriberReady'; modelId: string; loadMs: number }
  | { kind: 'transcriberFailed'; message: string }
  | { kind: 'sourceFailed'; source: SourceKind; message: string }
  | { kind: 'segmentDropped'; source: SourceKind };

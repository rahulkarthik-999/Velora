// Mirrors the serde types in src-tauri/src. Keep the two in sync.

export type Theme = 'system' | 'dark' | 'light';
export type AnswerStyle = 'concise' | 'detailed' | 'star';

export interface ShortcutSettings {
  toggleCopilot: string;
  pauseResume: string;
  endSession: string;
  answerNow: string;
  analyzeScreen: string;
  toggleMain: string;
  toggleAutoAnswer: string;
  toggleClickThrough: string;
}

export interface CopilotSettings {
  /** Answer automatically when the interviewer finishes a question. */
  autoAnswer: boolean;
  /** Job that grounds live answers. */
  jobId: string | null;
  /** 0.3 to 1 */
  opacity: number;
  /** 0.8 to 1.5 */
  fontScale: number;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  showTranscript: boolean;
  /** Also transcribe the microphone in live sessions. */
  transcribeMicrophone: boolean;
  compact: boolean;
}

export interface Settings {
  schemaVersion: number;
  theme: Theme;
  answerStyle: AnswerStyle;
  shortcuts: ShortcutSettings;
  audio: {
    /** null = Windows default device */
    microphoneDeviceId: string | null;
    systemAudioDeviceId: string | null;
  };
  /** Speech is transcribed by OpenAI gpt-4o-mini-transcribe through the Velora API. */
  transcription: { language: string };
  copilot: CopilotSettings;
  /** Tailors live answers, practice questions, feedback and model answers. */
  customInstructions: string;
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

// --- Account (web API via the desktop sign-in) ---

export interface AccountStatus {
  signedIn: boolean;
  user?: { name: string | null; email: string | null };
  device?: { id: string; name: string };
  usage?: { tier: string; monthlyAICredits: number; creditsUsed: number; creditsRemaining: number; periodStart: string };
}

export interface LinkStart {
  userCode: string;
  verificationUrl: string;
  interval: number;
  expiresIn: number;
}

export type AccountEvent = { status: 'signedIn' | 'signedOut' | 'denied' | 'expired' | 'failed' };

// --- Interview preparation ---

export interface ResumeInfo {
  id: string;
  fileName: string;
  chars: number;
  importedAtMs: number;
  preview: string;
  text?: string;
}

export type FactKind = 'skill' | 'experience' | 'project' | 'education' | 'other';

export interface CandidateFact {
  id: string;
  kind: FactKind;
  text: string;
}

export interface CandidateProfile {
  headline: string;
  skills: string[];
  experiences: { title: string; company: string; period: string; highlights: string[] }[];
  projects: { name: string; description: string; technologies: string[] }[];
  education: { qualification: string; institution: string; period: string }[];
}

export interface ProfileView {
  profile: CandidateProfile | null;
  facts: CandidateFact[];
}

export interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  updatedAtMs: number;
}

export type PracticeFocus = 'mixed' | 'behavioral' | 'technical' | 'situational';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Feedback {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
  talkingPoints: string[];
  evidenceUsed: string[];
  followUpQuestion: string;
}

export interface PracticeItem {
  id: string;
  sessionId: string;
  position: number;
  question: string;
  category: string;
  focus: string;
  answer: string | null;
  feedback: Feedback | null;
  score: number | null;
}

export interface PracticeSessionSummary {
  id: string;
  jobId: string | null;
  title: string;
  focus: PracticeFocus;
  difficulty: Difficulty;
  createdAtMs: number;
  itemCount: number;
  answeredCount: number;
  averageScore: number | null;
}

export interface PracticeView {
  sessionId: string;
  items: PracticeItem[];
  creditsRemaining: number | null;
}

// --- Live copilot ---

export interface LiveAnswer {
  question: string;
  answer: string;
  keyPoints: string[];
  sources: string[];
  followUps: string[];
}

export interface SavedAnswer {
  id: string;
  sessionId: string | null;
  question: string;
  answer: LiveAnswer;
  createdAtMs: number;
}

export type AnswerEvent =
  | { status: 'pending'; requestId: string; question: string; askedAtMs: number | null; heardUntilMs: number | null }
  | { status: 'done'; requestId: string; answer: SavedAnswer; creditsRemaining: number | null }
  | { status: 'failed'; requestId: string; question: string; message: string };

export interface KnowledgeDoc {
  id: string;
  title: string;
  source: 'note' | 'file';
  chars: number;
  chunks: number;
  preview: string;
  createdAtMs: number;
}

// --- Plans and billing (from /api/billing/status) ---

export type PlanId = 'STARTER' | 'PRO_MONTHLY' | 'PRO_QUARTERLY' | 'PRO_ANNUAL' | 'LIFETIME';
export type BillingInterval = 'month' | 'quarter' | 'year' | 'one_time';

export interface Allowances {
  transcriptionMinutes: number;
  aiCredits: number;
  screenshots: number;
}

export interface PlanOffer {
  id: PlanId;
  name: string;
  priceUsd: number;
  interval: BillingInterval;
  allowances: Allowances;
  features: string[];
}

export type AccessReason = 'active' | 'no_plan' | 'payment_issue' | 'expired' | 'cancelled' | 'refunded';

export interface Entitlement {
  active: boolean;
  reason: AccessReason;
  plan: { id: PlanId; name: string; interval: BillingInterval; priceUsd?: number } | null;
  status: string | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  resetsAt: string | null;
  allowances: Allowances | null;
  used: { aiCredits: number; transcriptionMinutes: number; screenshots: number };
  remaining: { aiCredits: number; transcriptionMinutes: number; screenshots: number } | null;
}

export interface PaymentRecord {
  externalId: string;
  plan: PlanId | null;
  amount: number;
  currency: string;
  status: string;
  refundedAmount: number;
  createdAt: string;
}

export interface BillingStatus {
  entitlement: Entitlement;
  payments: PaymentRecord[];
  plans: PlanOffer[];
}

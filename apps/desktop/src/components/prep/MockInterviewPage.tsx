import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Award,
  Clock,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { useApp } from '../../stores/app';
import type { Job } from '../../types';

export type MockInterviewType =
  | 'hr'
  | 'behavioral'
  | 'technical'
  | 'coding'
  | 'system_design'
  | 'managerial'
  | 'project';

export interface MockTurn {
  speaker: 'interviewer' | 'candidate';
  text: string;
  timestampMs: number;
  durationMs?: number;
  responseLatencyMs?: number;
  questionCategory?: string;
  quickFeedback?: string;
}

export interface SavedMockSession {
  id: string;
  role: string;
  company: string;
  experienceLevel: 'entry' | 'mid' | 'senior' | 'lead';
  interviewType: MockInterviewType;
  startedAtMs: number;
  elapsedSeconds: number;
  completed: boolean;
  turns: MockTurn[];
  reportId?: string;
}

interface MockTurnApiResponse {
  interviewerResponse: string;
  currentQuestion: string;
  questionNumber: number;
  questionCategory: string;
  isFollowUp: boolean;
  isInterviewComplete: boolean;
  quickFeedbackOnLastAnswer: string;
  coachingHint: string;
}

const INTERVIEW_TYPES: { id: MockInterviewType; label: string; desc: string }[] = [
  { id: 'hr', label: 'HR Screening', desc: 'Career motivation, culture alignment, compensation & role expectations' },
  { id: 'behavioral', label: 'Behavioral (STAR)', desc: 'Leadership, conflict resolution, ownership & past execution' },
  { id: 'technical', label: 'Technical Deep-Dive', desc: 'Core stack architecture, debugging, APIs & domain expertise' },
  { id: 'coding', label: 'Coding & Algorithms', desc: 'Problem solving, data structures, complexity & edge cases' },
  { id: 'system_design', label: 'System Design', desc: 'Distributed systems, scalability, databases, caching & trade-offs' },
  { id: 'managerial', label: 'Managerial & Leadership', desc: 'Cross-functional delivery, mentorship, strategy & prioritization' },
  { id: 'project', label: 'Project Discussion', desc: 'Deep-dive into your resume projects, architecture choices & impact' },
];

export function MockInterviewPage() {
  const setPage = useApp((s) => s.setPage);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [role, setRole] = useState('Senior Software Engineer');
  const [company, setCompany] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'entry' | 'mid' | 'senior' | 'lead'>('senior');
  const [interviewType, setInterviewType] = useState<MockInterviewType>('technical');
  const [targetQuestions, setTargetQuestions] = useState(5);

  const [sessions, setSessions] = useState<SavedMockSession[]>([]);
  const [activeSession, setActiveSession] = useState<SavedMockSession | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidateInput, setCandidateInput] = useState('');
  const [coachingHint, setCoachingHint] = useState('');
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [listeningMic, setListeningMic] = useState(false);

  const lastInterviewerTurnAt = useRef<number>(Date.now());
  const answerStartedAt = useRef<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const loadData = useCallback(() => {
    ipc.listJobs().then((list) => {
      setJobs(list);
      if (list.length > 0 && !selectedJobId) {
        setSelectedJobId(list[0].id);
        setRole(list[0].title);
        setCompany(list[0].company);
      }
    }, () => {});
    ipc.getCareerStore<SavedMockSession[]>('career:mock_interviews').then((saved) => {
      if (Array.isArray(saved)) setSessions(saved);
    }, () => {});
  }, [selectedJobId]);

  useEffect(loadData, [loadData]);

  // Timer tick when active & not paused
  useEffect(() => {
    if (!activeSession || activeSession.completed || paused) return;
    const id = window.setInterval(() => {
      setActiveSession((cur) => (cur ? { ...cur, elapsedSeconds: cur.elapsedSeconds + 1 } : null));
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeSession, paused]);

  const speakText = (text: string) => {
    if (!voiceOutputEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore TTS errors
    }
  };

  const toggleVoiceMic = () => {
    if (listeningMic) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setListeningMic(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setError('Browser SpeechRecognition is unavailable in this webview; type your response or use Practice voice recording.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      if (!answerStartedAt.current) answerStartedAt.current = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript.trim()) {
          setCandidateInput((prev) => `${prev ? prev + ' ' : ''}${finalTranscript.trim()}`);
        }
      };
      rec.onerror = () => setListeningMic(false);
      rec.onend = () => setListeningMic(false);
      recognitionRef.current = rec;
      rec.start();
      setListeningMic(true);
    } catch {
      setListeningMic(false);
    }
  };

  const persistSession = async (next: SavedMockSession) => {
    const updatedList = [next, ...sessions.filter((s) => s.id !== next.id)].slice(0, 30);
    setSessions(updatedList);
    await ipc.saveCareerStore('career:mock_interviews', updatedList);
  };

  const startMockInterview = async () => {
    setBusy(true);
    setError(null);
    try {
      const [resume, profile] = await Promise.all([
        ipc.getResume().catch(() => null),
        ipc.getProfile().catch(() => ({ facts: [] })),
      ]);
      const resumeContext = [resume?.text || resume?.preview || '', ...profile.facts.map((f) => f.text)].filter(Boolean).join('\n');
      const selectedJob = jobs.find((j) => j.id === selectedJobId);

      const res = await ipc.careerApiPost<MockTurnApiResponse>('/api/career/mock/turn', {
        role: role.trim() || 'Software Engineer',
        company: company.trim() || undefined,
        experienceLevel,
        interviewType,
        resumeText: resumeContext || undefined,
        jobDescription: selectedJob?.description || undefined,
        history: [],
        targetQuestionCount: targetQuestions,
      });

      const newSession: SavedMockSession = {
        id: `mock-${Date.now()}`,
        role: role.trim() || 'Software Engineer',
        company: company.trim(),
        experienceLevel,
        interviewType,
        startedAtMs: Date.now(),
        elapsedSeconds: 0,
        completed: false,
        turns: [
          {
            speaker: 'interviewer',
            text: res.interviewerResponse,
            timestampMs: Date.now(),
            questionCategory: res.questionCategory,
          },
        ],
      };

      setActiveSession(newSession);
      setCoachingHint(res.coachingHint || '');
      setPaused(false);
      lastInterviewerTurnAt.current = Date.now();
      answerStartedAt.current = null;
      await persistSession(newSession);
      speakText(res.interviewerResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCandidateAnswer = async () => {
    if (!activeSession || !candidateInput.trim() || busy) return;
    if (listeningMic) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setListeningMic(false);
    }

    const answerText = candidateInput.trim();
    const now = Date.now();
    const latencyMs = answerStartedAt.current
      ? Math.max(200, answerStartedAt.current - lastInterviewerTurnAt.current)
      : Math.max(500, now - lastInterviewerTurnAt.current);
    const durationMs = answerStartedAt.current ? Math.max(1500, now - answerStartedAt.current) : undefined;

    const candidateTurn: MockTurn = {
      speaker: 'candidate',
      text: answerText,
      timestampMs: now,
      durationMs,
      responseLatencyMs: latencyMs,
    };

    const updatedTurns = [...activeSession.turns, candidateTurn];
    const optimisticSession: SavedMockSession = { ...activeSession, turns: updatedTurns };
    setActiveSession(optimisticSession);
    setCandidateInput('');
    setBusy(true);
    setError(null);

    try {
      const [resume, profile] = await Promise.all([
        ipc.getResume().catch(() => null),
        ipc.getProfile().catch(() => ({ facts: [] })),
      ]);
      const resumeContext = [resume?.text || resume?.preview || '', ...profile.facts.map((f) => f.text)].filter(Boolean).join('\n');
      const selectedJob = jobs.find((j) => j.id === selectedJobId);

      const res = await ipc.careerApiPost<MockTurnApiResponse>('/api/career/mock/turn', {
        role: activeSession.role,
        company: activeSession.company || undefined,
        experienceLevel: activeSession.experienceLevel,
        interviewType: activeSession.interviewType,
        resumeText: resumeContext || undefined,
        jobDescription: selectedJob?.description || undefined,
        history: activeSession.turns.map((t) => ({
          speaker: t.speaker,
          text: t.text,
          timestampMs: t.timestampMs,
          responseLatencyMs: t.responseLatencyMs,
        })),
        candidateMessage: answerText,
        targetQuestionCount: targetQuestions,
      });

      const interviewerTurn: MockTurn = {
        speaker: 'interviewer',
        text: res.interviewerResponse,
        timestampMs: Date.now(),
        questionCategory: res.questionCategory,
        quickFeedback: res.quickFeedbackOnLastAnswer,
      };

      const nextSession: SavedMockSession = {
        ...optimisticSession,
        completed: res.isInterviewComplete,
        turns: [...updatedTurns, interviewerTurn],
      };

      setActiveSession(nextSession);
      setCoachingHint(res.coachingHint || '');
      lastInterviewerTurnAt.current = Date.now();
      answerStartedAt.current = null;
      await persistSession(nextSession);
      speakText(res.interviewerResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const generateReportForSession = async (sessionToEvaluate: SavedMockSession) => {
    if (sessionToEvaluate.turns.length < 2) {
      setError('Answer at least one question before generating a Performance Report.');
      return;
    }
    setGeneratingReport(true);
    setError(null);
    try {
      const [resume, profile] = await Promise.all([
        ipc.getResume().catch(() => null),
        ipc.getProfile().catch(() => ({ facts: [] })),
      ]);
      const resumeContext = [resume?.text || resume?.preview || '', ...profile.facts.map((f) => f.text)].filter(Boolean).join('\n');
      const selectedJob = jobs.find((j) => j.id === selectedJobId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reportRes = await ipc.careerApiPost<any>('/api/career/reports/evaluate', {
        role: sessionToEvaluate.role,
        company: sessionToEvaluate.company || undefined,
        interviewType: sessionToEvaluate.interviewType,
        turns: sessionToEvaluate.turns,
        resumeText: resumeContext || undefined,
        jobDescription: selectedJob?.description || undefined,
      });

      const reportRecord = {
        id: `rep-${Date.now()}`,
        sessionId: sessionToEvaluate.id,
        role: sessionToEvaluate.role,
        company: sessionToEvaluate.company,
        interviewType: sessionToEvaluate.interviewType,
        createdAtMs: Date.now(),
        ...reportRes,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingReports = (await ipc.getCareerStore<any[]>('career:reports').catch(() => [])) || [];
      const nextReports = [reportRecord, ...existingReports].slice(0, 30);
      await ipc.saveCareerStore('career:reports', nextReports);

      const markedSession = { ...sessionToEvaluate, completed: true, reportId: reportRecord.id };
      setActiveSession(markedSession);
      await persistSession(markedSession);
      setPage('reports');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGeneratingReport(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">AI Mock Interviews</h1>
          <p className="muted mt-1 max-w-2xl">
            Realistic voice &amp; conversational mock interviews grounded in your resume and target job description,
            with dynamic follow-up questions and instant performance evaluation.
          </p>
        </div>
        {activeSession && (
          <div className="flex items-center gap-2">
            <button
              className="btn text-xs"
              onClick={() => setVoiceOutputEnabled((v) => !v)}
              title={voiceOutputEnabled ? 'Mute voice interviewer' : 'Enable voice interviewer'}
            >
              {voiceOutputEnabled ? <Volume2 size={14} className="text-accent" /> : <VolumeX size={14} />}
              {voiceOutputEnabled ? 'Voice ON' : 'Voice Muted'}
            </button>
            <button className="btn text-xs" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className="btn btn-primary text-xs"
              disabled={generatingReport || activeSession.turns.length < 2}
              onClick={() => generateReportForSession(activeSession)}
            >
              {generatingReport ? <Loader2 size={14} className="animate-spin" /> : <Award size={14} />}
              Finish &amp; Generate Report
            </button>
          </div>
        )}
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {error}
        </p>
      )}

      {!activeSession ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="card flex flex-col gap-4 p-6">
            <h2 className="text-base font-semibold">Configure Mock Interview</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                Use saved Job Context
                <select
                  className="field mt-1"
                  value={selectedJobId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedJobId(id);
                    const found = jobs.find((j) => j.id === id);
                    if (found) {
                      setRole(found.title);
                      setCompany(found.company);
                    }
                  }}
                >
                  <option value="">Custom role below</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                      {j.company ? ` · ${j.company}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Experience Level
                <select
                  className="field mt-1"
                  value={experienceLevel}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onChange={(e) => setExperienceLevel(e.target.value as any)}
                >
                  <option value="entry">Entry / Junior (0–2 yrs)</option>
                  <option value="mid">Mid-Level (2–5 yrs)</option>
                  <option value="senior">Senior (5–8+ yrs)</option>
                  <option value="lead">Staff / Lead / Principal</option>
                </select>
              </label>
              <label className="text-xs">
                Target Role Title
                <input className="field mt-1" value={role} onChange={(e) => setRole(e.target.value)} />
              </label>
              <label className="text-xs">
                Company (Optional)
                <input className="field mt-1" value={company} placeholder="e.g. Stripe, Microsoft" onChange={(e) => setCompany(e.target.value)} />
              </label>
            </div>

            <div>
              <span className="text-xs font-medium">Select Interview Round Type</span>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {INTERVIEW_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setInterviewType(t.id)}
                    className={clsx(
                      'rounded-lg border p-3 text-left transition-colors',
                      interviewType === t.id
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                        : 'border-[var(--border)] hover:bg-[var(--surface-2)]'
                    )}
                  >
                    <div className="text-xs font-semibold">{t.label}</div>
                    <div className="muted mt-0.5 text-[11px]">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs">
                <span>Number of questions:</span>
                <select
                  className="field w-20 py-1"
                  value={targetQuestions}
                  onChange={(e) => setTargetQuestions(Number(e.target.value))}
                >
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={8}>8</option>
                  <option value={10}>10</option>
                </select>
              </label>
              <button className="btn btn-primary px-5 py-2" disabled={busy || !role.trim()} onClick={startMockInterview}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                Start Voice Mock Interview
              </button>
            </div>
          </section>

          <aside className="card flex flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold">Mock Interview History ({sessions.length})</h2>
            {sessions.length === 0 ? (
              <p className="muted text-xs">Your completed and in-progress mock interviews appear here for replay and review.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] overflow-y-auto">
                {sessions.map((s) => (
                  <li key={s.id} className="py-2.5">
                    <button
                      className="w-full text-left hover:opacity-90"
                      onClick={() => setActiveSession(s)}
                    >
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span>{s.role}</span>
                        <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px]">
                          {s.interviewType.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="muted mt-0.5 text-[11px]">
                        {new Date(s.startedAtMs).toLocaleDateString()} · {s.turns.length} turns · {formatTimer(s.elapsedSeconds)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Session Status Bar */}
          <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div>
              <div className="text-sm font-semibold">
                {activeSession.role}
                {activeSession.company ? ` · ${activeSession.company}` : ''}
              </div>
              <div className="muted text-xs capitalize">
                {activeSession.interviewType.replace('_', ' ')} Interview · {activeSession.experienceLevel} level
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-mono text-sm">
                <Clock size={14} className="text-accent" />
                {formatTimer(activeSession.elapsedSeconds)}
                {paused && <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">PAUSED</span>}
              </span>
              <button className="btn py-1 text-xs" onClick={() => setActiveSession(null)}>
                All Mock Sessions
              </button>
            </div>
          </div>

          {/* Conversation Transcript */}
          <div className="card flex max-h-[52vh] flex-col gap-3 overflow-y-auto p-5">
            {activeSession.turns.map((t, idx) => (
              <div
                key={idx}
                className={clsx(
                  'flex flex-col gap-1 rounded-xl p-3.5 text-sm',
                  t.speaker === 'interviewer'
                    ? 'mr-8 border border-[var(--border)] bg-[var(--surface-2)]'
                    : 'ml-8 border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10'
                )}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    {t.speaker === 'interviewer' ? 'AI Interviewer' : 'You (Candidate)'}
                  </span>
                  {t.questionCategory && (
                    <span className="rounded bg-black/25 px-2 py-0.5 text-[10px] text-accent">{t.questionCategory}</span>
                  )}
                </div>
                {t.quickFeedback && (
                  <div className="mb-1 rounded bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300">
                    <strong>Coach note on previous answer:</strong> {t.quickFeedback}
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>

          {coachingHint && !activeSession.completed && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs">
              <strong className="text-accent">Interviewer Hint:</strong> <span className="muted">{coachingHint}</span>
            </div>
          )}

          {/* Candidate Response Box */}
          {!activeSession.completed ? (
            <div className="card flex flex-col gap-2.5 p-4">
              <textarea
                className="field min-h-24 text-sm"
                disabled={paused || busy}
                placeholder="Speak using the microphone button or type your answer here..."
                value={candidateInput}
                onChange={(e) => {
                  if (!answerStartedAt.current) answerStartedAt.current = Date.now();
                  setCandidateInput(e.target.value);
                }}
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className={clsx('btn text-xs', listeningMic && 'border-red-500/50 bg-red-500/15 text-red-300')}
                  onClick={toggleVoiceMic}
                  disabled={paused || busy}
                >
                  {listeningMic ? <MicOff size={14} /> : <Mic size={14} />}
                  {listeningMic ? 'Stop Voice Dictation' : 'Speak Answer (Voice-to-Text)'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={paused || busy || !candidateInput.trim()}
                  onClick={submitCandidateAnswer}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {busy ? 'Interviewer thinking…' : 'Submit Answer'}
                </button>
              </div>
            </div>
          ) : (
            <div className="card flex items-center justify-between p-5">
              <div>
                <h3 className="font-semibold">Mock Interview Complete</h3>
                <p className="muted text-xs">Generate your detailed 7-point Performance Report with suggested improved answers.</p>
              </div>
              <button
                className="btn btn-primary"
                disabled={generatingReport}
                onClick={() => generateReportForSession(activeSession)}
              >
                {generatingReport ? <Loader2 size={15} className="animate-spin" /> : <Award size={15} />}
                Generate Performance Report
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

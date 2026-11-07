'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Award,
  BookOpen,
  Briefcase,
  Camera,
  Check,
  CheckCircle2,
  Circle,
  Code2,
  Compass,
  Copy,
  CreditCard,
  Database,
  Download,
  FileText,
  Layers,
  LayoutDashboard,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Printer,
  Radio,
  Send,
  ShieldAlert,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';

type WebPage =
  | 'overview'
  | 'resume'
  | 'job'
  | 'knowledge'
  | 'mock'
  | 'reports'
  | 'live'
  | 'coding'
  | 'sql'
  | 'system_design'
  | 'roadmap'
  | 'account';

const NAV_GROUPS: { group: string; items: { id: WebPage; label: string; Icon: typeof LayoutDashboard }[] }[] = [
  {
    group: 'HOME',
    items: [{ id: 'overview', label: 'Career Dashboard', Icon: LayoutDashboard }],
  },
  {
    group: 'PREPARE',
    items: [
      { id: 'resume', label: 'Resume Intelligence', Icon: FileText },
      { id: 'job', label: 'Job Match Analyzer', Icon: Briefcase },
      { id: 'knowledge', label: 'Knowledge Base', Icon: BookOpen },
    ],
  },
  {
    group: 'PRACTICE',
    items: [
      { id: 'mock', label: 'AI Mock Interviews', Icon: Mic },
      { id: 'reports', label: 'Performance Reports', Icon: Award },
    ],
  },
  {
    group: 'PERFORM',
    items: [
      { id: 'live', label: 'Live Interview Copilot', Icon: Radio },
      { id: 'coding', label: 'Coding Assistant', Icon: Code2 },
      { id: 'sql', label: 'SQL Assistant', Icon: Database },
      { id: 'system_design', label: 'System Design Assistant', Icon: Layers },
    ],
  },
  {
    group: 'IMPROVE',
    items: [{ id: 'roadmap', label: 'Learning Roadmap', Icon: Compass }],
  },
  {
    group: 'ACCOUNT',
    items: [{ id: 'account', label: 'Plan, Usage & Profile', Icon: CreditCard }],
  },
];

export default function CareerCompanionWebDashboard() {
  const [page, setPage] = useState<WebPage>('overview');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Shared Career Context state (persisted via /api/career/context)
  const [resumeText, setResumeText] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  
  const [resumeAnalysis, setResumeAnalysis] = useState<any>(null);
  
  const [resumeVersions, setResumeVersions] = useState<any[]>([]);
  const [editableSummary, setEditableSummary] = useState('');
  const [summaryApproved, setSummaryApproved] = useState(false);

  const [jobTitle, setJobTitle] = useState('Senior Software Engineer');
  const [company, setCompany] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  
  const [jobMatch, setJobMatch] = useState<any>(null);

  const [knowledgeNotes, setKnowledgeNotes] = useState<Array<{ id: string; title: string; text: string }>>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');

  // Mock Interview state
  const [mockRole, setMockRole] = useState('Senior Software Engineer');
  const [mockLevel, setMockLevel] = useState<'entry' | 'mid' | 'senior' | 'lead'>('senior');
  const [mockType, setMockType] = useState('technical');
  
  const [mockTurns, setMockTurns] = useState<any[]>([]);
  const [mockInput, setMockInput] = useState('');
  const [mockHint, setMockHint] = useState('');
  const [mockComplete, setMockComplete] = useState(false);
  const [voiceTts, setVoiceTts] = useState(true);
  const [micActive, setMicActive] = useState(false);
  
  const recognitionRef = useRef<any>(null);

  // Reports state
  
  const [reports, setReports] = useState<any[]>([]);
  
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // Live Copilot Web state
  const [liveQuestion, setLiveQuestion] = useState('');
  
  const [liveFeed, setLiveFeed] = useState<any[]>([]);

  // Technical Assistants state
  const [codingProblem, setCodingProblem] = useState('');
  const [codingLang, setCodingLang] = useState('TypeScript');
  
  const [codingOut, setCodingOut] = useState<any>(null);

  const [sqlPrompt, setSqlPrompt] = useState('');
  const [sqlDialect, setSqlDialect] = useState('PostgreSQL');
  
  const [sqlOut, setSqlOut] = useState<any>(null);

  const [sdPrompt, setSdPrompt] = useState('');
  const [sdScale, setSdScale] = useState('High-Growth (10M+ DAU)');
  
  const [sdOut, setSdOut] = useState<any>(null);

  // Roadmap state
  
  const [roadmap, setRoadmap] = useState<any>(null);
  const [roadmapWeeks, setRoadmapWeeks] = useState(4);
  const [roadmapGoals, setRoadmapGoals] = useState('');

  // Billing state
  
  const [billing, setBilling] = useState<any>(null);

  const [busyOp, setBusyOp] = useState<string | null>(null);

  // Load shared career context & billing on mount
  useEffect(() => {
    fetch('/api/career/context')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const ctx = res?.context || {};
        if (ctx['career:resumes']) {
          setResumeText(ctx['career:resumes'].text || '');
          setResumeFileName(ctx['career:resumes'].fileName || '');
          setResumeAnalysis(ctx['career:resumes'].analysis || null);
          setEditableSummary(ctx['career:resumes'].analysis?.improvedSummary || '');
          setResumeVersions(ctx['career:resumes'].versions || []);
        }
        if (ctx['career:jobs']) {
          setJobTitle(ctx['career:jobs'].jobTitle || 'Senior Software Engineer');
          setMockRole(ctx['career:jobs'].jobTitle || 'Senior Software Engineer');
          setCompany(ctx['career:jobs'].company || '');
          setJobDescription(ctx['career:jobs'].jobDescription || '');
          setJobMatch(ctx['career:jobs'].jobMatch || null);
        }
        if (Array.isArray(ctx['career:knowledge'])) setKnowledgeNotes(ctx['career:knowledge']);
        if (Array.isArray(ctx['career:reports'])) {
          setReports(ctx['career:reports']);
          if (ctx['career:reports'][0]) setSelectedReport(ctx['career:reports'][0]);
        }
        if (ctx['career:roadmap']) setRoadmap(ctx['career:roadmap']);
      })
      .catch(() => {});

    fetch('/api/billing/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b) setBilling(b);
      })
      .catch(() => {});
  }, []);

  const saveContextKey = async (key: string, data: unknown) => {
    try {
      await fetch('/api/career/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, data }),
      });
    } catch {
      // ignore offline
    }
  };

  const handleUploadDocument = async (file: File, target: 'resume' | 'job') => {
    setBusyOp(`upload-${target}`);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/career/context', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Document extraction failed');
      if (target === 'resume') {
        setResumeText(data.text || '');
        setResumeFileName(file.name);
        const nextVersions = [
          { id: `v-${Date.now()}`, label: `Uploaded ${file.name}`, text: data.text, createdAtMs: Date.now() },
          ...resumeVersions.slice(0, 14),
        ];
        setResumeVersions(nextVersions);
        await saveContextKey('career:resumes', {
          text: data.text,
          fileName: file.name,
          analysis: resumeAnalysis,
          versions: nextVersions,
        });
        setNotice(`Extracted ${data.wordCount} words from ${file.name}`);
      } else {
        setJobDescription(data.text || '');
        setNotice(`Imported job description from ${file.name}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOp(null);
    }
  };

  const runResumeAnalysis = async () => {
    if (resumeText.trim().length < 40) {
      setError('Please upload or paste your resume text (at least 40 characters) first.');
      return;
    }
    setBusyOp('resume-analyze');
    setError(null);
    try {
      const res = await fetch('/api/career/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText,
          targetRole: jobTitle || undefined,
          jobDescription: jobDescription || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Resume analysis failed');
      const mappedBullets = (data.bulletImprovements || []).map((b: Record<string, unknown>) => ({
        ...b,
        editedText: b.improved,
        approved: false,
      }));
      const enriched = { ...data, bulletImprovements: mappedBullets };
      setResumeAnalysis(enriched);
      setEditableSummary(data.improvedSummary || '');
      setSummaryApproved(false);
      await saveContextKey('career:resumes', {
        text: resumeText,
        fileName: resumeFileName || 'resume.txt',
        analysis: enriched,
        versions: resumeVersions,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOp(null);
    }
  };

  const applyApprovedResumeEdits = async () => {
    if (!resumeAnalysis) return;
    let updated = resumeText;
    
    const approvedBullets = (resumeAnalysis.bulletImprovements || []).filter((b: any) => b.approved);
    for (const b of approvedBullets) {
      if (updated.includes(b.original)) {
        updated = updated.replace(b.original, b.editedText || b.improved);
      } else {
        updated += `\n• ${b.editedText || b.improved}`;
      }
    }
    if (summaryApproved && editableSummary.trim()) {
      updated = `PROFESSIONAL SUMMARY\n${editableSummary.trim()}\n\n${updated}`;
    }
    setResumeText(updated);
    const nextVersions = [
      {
        id: `v-${Date.now()}`,
        label: `Approved Edits (${approvedBullets.length} bullets)`,
        text: updated,
        createdAtMs: Date.now(),
      },
      ...resumeVersions.slice(0, 14),
    ];
    setResumeVersions(nextVersions);
    await saveContextKey('career:resumes', {
      text: updated,
      fileName: resumeFileName || 'improved-resume.txt',
      analysis: resumeAnalysis,
      versions: nextVersions,
    });
    setNotice('Approved edits applied and saved to Resume Version History.');
  };

  const runJobMatchAnalysis = async () => {
    if (jobDescription.trim().length < 30) {
      setError('Paste or upload a job description (at least 30 characters).');
      return;
    }
    setBusyOp('job-match');
    setError(null);
    try {
      const res = await fetch('/api/career/jobs/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: jobTitle || undefined,
          company: company || undefined,
          jobDescription,
          resumeText: resumeText || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Job match analysis failed');
      setJobMatch(data);
      await saveContextKey('career:jobs', {
        jobTitle,
        company,
        jobDescription,
        jobMatch: data,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOp(null);
    }
  };

  const speak = (text: string) => {
    if (!voiceTts || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } catch {
      // ignore
    }
  };

  const toggleMic = (onTranscript: (text: string) => void) => {
    if (micActive) {
      recognitionRef.current?.stop();
      setMicActive(false);
      return;
    }
    
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setError('Browser SpeechRecognition is not supported in this browser; please use Chrome/Edge or type your answer.');
      return;
    }
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    
    rec.onresult = (event: any) => {
      let chunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) chunk += event.results[i][0].transcript + ' ';
      }
      if (chunk.trim()) onTranscript(chunk.trim());
    };
    rec.onerror = () => setMicActive(false);
    rec.onend = () => setMicActive(false);
    recognitionRef.current = rec;
    rec.start();
    setMicActive(true);
  };

  const startOrContinueMock = async (candidateAnswer?: string) => {
    setBusyOp('mock-turn');
    setError(null);
    const updatedHistory = candidateAnswer
      ? [...mockTurns, { speaker: 'candidate' as const, text: candidateAnswer, timestampMs: Date.now() }]
      : [];
    if (candidateAnswer) {
      setMockTurns(updatedHistory);
      setMockInput('');
    }
    try {
      const res = await fetch('/api/career/mock/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: mockRole,
          company: company || undefined,
          experienceLevel: mockLevel,
          interviewType: mockType,
          resumeText: resumeText || undefined,
          jobDescription: jobDescription || undefined,
          history: candidateAnswer ? mockTurns : [],
          candidateMessage: candidateAnswer,
          targetQuestionCount: 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Mock interview request failed');
      const nextTurns = [
        ...updatedHistory,
        {
          speaker: 'interviewer' as const,
          text: data.interviewerResponse,
          questionCategory: data.questionCategory,
          quickFeedback: data.quickFeedbackOnLastAnswer,
          timestampMs: Date.now(),
        },
      ];
      setMockTurns(nextTurns);
      setMockHint(data.coachingHint || '');
      setMockComplete(Boolean(data.isInterviewComplete));
      speak(data.interviewerResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOp(null);
    }
  };

  const evaluateMockReport = async () => {
    if (mockTurns.length < 2) return;
    setBusyOp('report-eval');
    setError(null);
    try {
      const res = await fetch('/api/career/reports/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: mockRole,
          company: company || undefined,
          interviewType: mockType,
          turns: mockTurns,
          resumeText: resumeText || undefined,
          jobDescription: jobDescription || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Report generation failed');
      const reportItem = {
        id: `rep-${Date.now()}`,
        role: mockRole,
        company,
        interviewType: mockType,
        createdAtMs: Date.now(),
        ...data,
      };
      const nextReports = [reportItem, ...reports].slice(0, 30);
      setReports(nextReports);
      setSelectedReport(reportItem);
      await saveContextKey('career:reports', nextReports);
      setPage('reports');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOp(null);
    }
  };

  const askLiveCopilotWeb = async (qText?: string) => {
    const questionToAsk = (qText ?? liveQuestion).trim();
    if (questionToAsk.length < 3) return;
    setBusyOp('live-answer');
    setError(null);
    try {
      const res = await fetch('/api/live/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionToAsk,
          transcript: [{ source: 'systemAudio', text: questionToAsk }],
          style: 'concise',
          job: jobTitle ? { title: jobTitle, company, description: jobDescription } : undefined,
          facts: resumeText ? [resumeText.slice(0, 1500)] : [],
          knowledge: knowledgeNotes.map((n) => `${n.title}: ${n.text}`.slice(0, 600)),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Live copilot answer failed');
      setLiveFeed((prev) => [{ id: Date.now(), ...data }, ...prev]);
      setLiveQuestion('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOp(null);
    }
  };

  const scanWebScreenCopilot = async () => {
    setBusyOp('live-screen');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
      canvas.width = Math.round((video.videoWidth || 1280) * scale);
      canvas.height = Math.round((video.videoHeight || 720) * scale);
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      track.stop();
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

      const res = await fetch('/api/live/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          style: 'concise',
          job: jobTitle ? { title: jobTitle, company, description: jobDescription } : undefined,
          facts: resumeText ? [resumeText.slice(0, 1500)] : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Screen question analysis failed');
      setLiveFeed((prev) => [{ id: Date.now(), ...data }, ...prev]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOp(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Unified Navigation Sidebar */}
      <aside className="lg:col-span-3 flex flex-col gap-5 rounded-xl border border-velora-border bg-velora-surface p-4 h-fit">
        {NAV_GROUPS.map(({ group, items }) => (
          <div key={group}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-velora-text-muted px-2.5 mb-1.5">
              {group}
            </div>
            <ul className="space-y-0.5">
              {items.map(({ id, label, Icon }) => (
                <li key={id}>
                  <button
                    onClick={() => {
                      setPage(id);
                      setError(null);
                      setNotice(null);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                      page === id
                        ? 'bg-velora-gold/15 text-velora-gold border border-velora-gold/30'
                        : 'text-velora-text-secondary hover:text-white hover:bg-velora-bg/60'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      {/* Main Content Area */}
      <div className="lg:col-span-9 flex flex-col gap-5">
        {error && (
          <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="underline ml-3">
              Dismiss
            </button>
          </div>
        )}
        {notice && (
          <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 flex items-center justify-between">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="underline ml-3">
              Dismiss
            </button>
          </div>
        )}

        {/* HOME: CAREER DASHBOARD */}
        {page === 'overview' && (
          <div className="flex flex-col gap-5">
            <div className="p-6 rounded-xl border border-velora-border bg-velora-surface">
              <div className="text-xs font-mono uppercase text-velora-gold mb-1">
                Velora — Your AI Career Companion
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-2">
                Prepare smarter. Practice confidently. Perform better.
              </h1>
              <p className="text-xs sm:text-sm text-velora-text-secondary max-w-2xl mb-5">
                Your resume, target job profile, and knowledge base are shared seamlessly across Resume Intelligence,
                Job Match Analyzer, Voice AI Mock Interviews, Live Interview Copilot, Technical Assistants, and your
                Career Learning Roadmap.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <button onClick={() => setPage('resume')} className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Resume Intelligence
                </button>
                <button onClick={() => setPage('job')} className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-velora-gold" /> Job Match Analyzer
                </button>
                <button onClick={() => setPage('mock')} className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-velora-gold" /> Voice AI Mock Interview
                </button>
                <button onClick={() => setPage('live')} className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-velora-gold" /> Live Interview Copilot
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-velora-border bg-velora-surface">
                <div className="text-xs text-velora-text-muted">Active Resume Context</div>
                <div className="text-lg font-semibold text-white mt-1">
                  {resumeText ? `${resumeText.length.toLocaleString()} chars` : 'Not uploaded yet'}
                </div>
                <button onClick={() => setPage('resume')} className="text-xs text-velora-gold mt-2 hover:underline">
                  {resumeText ? 'View Resume Intelligence →' : 'Upload PDF / DOCX Resume →'}
                </button>
              </div>
              <div className="p-4 rounded-xl border border-velora-border bg-velora-surface">
                <div className="text-xs text-velora-text-muted">Target Job Context</div>
                <div className="text-lg font-semibold text-white mt-1 truncate">{jobTitle || 'General Role'}</div>
                <button onClick={() => setPage('job')} className="text-xs text-velora-gold mt-2 hover:underline">
                  {jobMatch ? `Alignment: ${jobMatch.matchAssessment?.alignmentScore}% →` : 'Analyze Job Description →'}
                </button>
              </div>
              <div className="p-4 rounded-xl border border-velora-border bg-velora-surface">
                <div className="text-xs text-velora-text-muted">Performance Reports</div>
                <div className="text-lg font-semibold text-white mt-1">{reports.length} completed</div>
                <button onClick={() => setPage('reports')} className="text-xs text-velora-gold mt-2 hover:underline">
                  View Rubric Reports →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PREPARE: RESUME INTELLIGENCE */}
        {page === 'resume' && (
          <div className="flex flex-col gap-5">
            <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-semibold text-white">Resume Intelligence</h1>
                  <p className="text-xs text-velora-text-secondary">
                    Upload a PDF/DOCX/TXT resume or paste text. Extracts candidate profile, scores ATS &amp; impact, and
                    suggests editable bullet improvements without fabricating experience.
                  </p>
                </div>
                <label className="btn-secondary text-xs py-2 px-3.5 cursor-pointer flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-velora-gold" />
                  <span>{busyOp === 'upload-resume' ? 'Extracting…' : 'Upload PDF / TXT Resume'}</span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,.docx"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUploadDocument(e.target.files[0], 'resume')}
                  />
                </label>
              </div>

              <textarea
                className="w-full rounded-lg border border-velora-border bg-velora-bg p-3 text-xs text-white min-h-[160px]"
                placeholder="Paste your resume text here or upload a PDF file above..."
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={runResumeAnalysis}
                  disabled={busyOp === 'resume-analyze' || resumeText.trim().length < 40}
                  className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  {busyOp === 'resume-analyze' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>{busyOp === 'resume-analyze' ? 'Analyzing Resume…' : 'Analyze & Improve Resume'}</span>
                </button>
                {resumeText && (
                  <button
                    onClick={() => {
                      const blob = new Blob([resumeText], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'velora-improved-resume.txt';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Improved Resume
                  </button>
                )}
              </div>
            </div>

            {resumeAnalysis && (
              <div className="flex flex-col gap-4">
                <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{resumeAnalysis.disclaimer}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    ['Overall', resumeAnalysis.qualityAnalysis?.overallScore],
                    ['ATS Score', resumeAnalysis.qualityAnalysis?.atsCompatibilityScore],
                    ['Impact', resumeAnalysis.qualityAnalysis?.impactScore],
                    ['Clarity', resumeAnalysis.qualityAnalysis?.clarityScore],
                    ['Completeness', resumeAnalysis.qualityAnalysis?.completenessScore],
                  ].map(([label, val]) => (
                    <div key={label as string} className="p-4 rounded-xl border border-velora-border bg-velora-surface">
                      <div className="text-[11px] text-velora-text-muted">{label}</div>
                      <div className="text-2xl font-bold text-velora-gold mt-1">{val}/100</div>
                    </div>
                  ))}
                </div>

                <div className="p-5 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Suggested Professional Summary (Editable)</h3>
                    <label className="flex items-center gap-2 text-xs text-velora-gold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={summaryApproved}
                        onChange={(e) => setSummaryApproved(e.target.checked)}
                      />
                      Approve Summary
                    </label>
                  </div>
                  <textarea
                    className="w-full rounded-lg border border-velora-border bg-velora-bg p-3 text-xs text-white min-h-[80px]"
                    value={editableSummary}
                    onChange={(e) => setEditableSummary(e.target.value)}
                  />
                </div>

                {resumeAnalysis.bulletImprovements?.length > 0 && (
                  <div className="p-5 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">
                        Experience Bullet Improvements ({resumeAnalysis.bulletImprovements.length})
                      </h3>
                      <button onClick={applyApprovedResumeEdits} className="btn-gold text-xs py-1.5 px-3">
                        Apply Approved Edits to Resume
                      </button>
                    </div>
                    <div className="divide-y divide-velora-border">
                      
                      {resumeAnalysis.bulletImprovements.map((b: any, idx: number) => (
                        <div key={idx} className="py-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="p-3 rounded bg-velora-bg/60 border border-velora-border">
                            <div className="text-[10px] font-mono uppercase text-velora-text-muted mb-1">
                              Original ({b.section})
                            </div>
                            <p className="text-velora-text-secondary">{b.original}</p>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono uppercase text-velora-gold">
                                Improved (Editable)
                              </span>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(b.approved)}
                                  onChange={(e) => {
                                    const next = resumeAnalysis.bulletImprovements.slice();
                                    next[idx] = { ...b, approved: e.target.checked };
                                    setResumeAnalysis({ ...resumeAnalysis, bulletImprovements: next });
                                  }}
                                />
                                <span>Approve</span>
                              </label>
                            </div>
                            <textarea
                              className="w-full rounded border border-velora-border bg-velora-bg p-2 text-xs text-white"
                              value={b.editedText ?? b.improved}
                              onChange={(e) => {
                                const next = resumeAnalysis.bulletImprovements.slice();
                                next[idx] = { ...b, editedText: e.target.value };
                                setResumeAnalysis({ ...resumeAnalysis, bulletImprovements: next });
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PREPARE: JOB MATCH ANALYZER */}
        {page === 'job' && (
          <div className="flex flex-col gap-5">
            <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-semibold text-white">Job Match Analyzer</h1>
                  <p className="text-xs text-velora-text-secondary">
                    Paste or upload a target job description to evaluate required skills, alignment, interview
                    difficulty, and likely interview questions.
                  </p>
                </div>
                <label className="btn-secondary text-xs py-2 px-3.5 cursor-pointer flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-velora-gold" />
                  <span>Import JD File</span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,.docx"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUploadDocument(e.target.files[0], 'job')}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="rounded-lg border border-velora-border bg-velora-bg px-3 py-2 text-xs text-white"
                  placeholder="Job Title (e.g. Senior Backend Engineer)"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
                <input
                  className="rounded-lg border border-velora-border bg-velora-bg px-3 py-2 text-xs text-white"
                  placeholder="Company Name"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>

              <textarea
                className="w-full rounded-lg border border-velora-border bg-velora-bg p-3 text-xs text-white min-h-[160px]"
                placeholder="Paste the complete job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />

              <div>
                <button
                  onClick={runJobMatchAnalysis}
                  disabled={busyOp === 'job-match' || jobDescription.trim().length < 30}
                  className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  {busyOp === 'job-match' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>{busyOp === 'job-match' ? 'Analyzing Job Match…' : 'Analyze Job Match'}</span>
                </button>
              </div>
            </div>

            {jobMatch && (
              <div className="flex flex-col gap-4">
                <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{jobMatch.matchAssessment?.disclaimer}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl border border-velora-border bg-velora-surface">
                    <div className="text-xs text-velora-text-muted">Requirement Alignment</div>
                    <div className="text-3xl font-bold text-velora-gold mt-1">
                      {jobMatch.matchAssessment?.alignmentScore}%
                    </div>
                    <div className="text-xs text-white mt-0.5">{jobMatch.matchAssessment?.alignmentLabel}</div>
                  </div>
                  <div className="p-4 rounded-xl border border-velora-border bg-velora-surface">
                    <div className="text-xs text-velora-text-muted">Seniority &amp; Role</div>
                    <div className="text-base font-semibold text-white mt-1">{jobMatch.jobProfile?.seniority}</div>
                    <div className="text-xs text-velora-text-secondary">{jobMatch.jobProfile?.jobTitle}</div>
                  </div>
                  <div className="p-4 rounded-xl border border-velora-border bg-velora-surface">
                    <div className="text-xs text-velora-text-muted">Interview Difficulty</div>
                    <div className="text-base font-semibold text-white mt-1">{jobMatch.interviewDifficulty?.level}</div>
                    <div className="text-xs text-velora-text-secondary">{jobMatch.interviewDifficulty?.rationale}</div>
                  </div>
                </div>

                <div className="p-5 rounded-xl border border-velora-border bg-velora-surface">
                  <h3 className="text-sm font-semibold text-white mb-2">Likely Interview Questions</h3>
                  <div className="divide-y divide-velora-border text-xs">
                    
                    {jobMatch.likelyInterviewQuestions?.map((q: any, i: number) => (
                      <div key={i} className="py-2.5">
                        <div className="font-semibold text-white">{q.question}</div>
                        <div className="text-velora-text-secondary mt-0.5">Why asked: {q.whyAsked}</div>
                        <div className="text-velora-gold mt-0.5">Prep tip: {q.prepTip}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PREPARE: KNOWLEDGE BASE */}
        {page === 'knowledge' && (
          <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-4">
            <h1 className="text-lg font-semibold text-white">Knowledge Base</h1>
            <p className="text-xs text-velora-text-secondary">
              Store project deep-dives, architecture notes, and STAR stories used to ground your Live Copilot answers.
            </p>
            <div className="flex flex-col gap-2.5">
              <input
                className="rounded-lg border border-velora-border bg-velora-bg px-3 py-2 text-xs text-white"
                placeholder="Note Title (e.g. Payment Service Migration STAR Story)"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
              />
              <textarea
                className="rounded-lg border border-velora-border bg-velora-bg p-3 text-xs text-white min-h-[100px]"
                placeholder="Write key metrics, architecture details, and outcomes..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
              <div>
                <button
                  onClick={async () => {
                    if (!noteTitle.trim() || !noteText.trim()) return;
                    const next = [{ id: `n-${Date.now()}`, title: noteTitle, text: noteText }, ...knowledgeNotes];
                    setKnowledgeNotes(next);
                    setNoteTitle('');
                    setNoteText('');
                    await saveContextKey('career:knowledge', next);
                  }}
                  className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Save to Knowledge Base
                </button>
              </div>
            </div>
            <div className="divide-y divide-velora-border">
              {knowledgeNotes.map((n) => (
                <div key={n.id} className="py-3 text-xs">
                  <div className="font-semibold text-white">{n.title}</div>
                  <p className="text-velora-text-secondary mt-1 whitespace-pre-wrap">{n.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PRACTICE: AI MOCK INTERVIEWS */}
        {page === 'mock' && (
          <div className="flex flex-col gap-5">
            <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-semibold text-white">Voice AI Mock Interviews</h1>
                  <p className="text-xs text-velora-text-secondary">
                    Practice HR, Behavioral, Technical, Coding, System Design, Managerial, and Project Discussion rounds.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVoiceTts((v) => !v)}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    {voiceTts ? <Volume2 className="w-3.5 h-3.5 text-velora-gold" /> : <VolumeX className="w-3.5 h-3.5" />}
                    <span>{voiceTts ? 'Voice Output ON' : 'Voice Muted'}</span>
                  </button>
                  {mockTurns.length >= 2 && (
                    <button
                      onClick={evaluateMockReport}
                      disabled={busyOp === 'report-eval'}
                      className="btn-gold text-xs py-1.5 px-3.5 flex items-center gap-1.5"
                    >
                      {busyOp === 'report-eval' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Award className="w-3.5 h-3.5" />
                      )}
                      <span>Generate Performance Report</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  className="rounded-lg border border-velora-border bg-velora-bg px-3 py-2 text-xs text-white"
                  value={mockRole}
                  onChange={(e) => setMockRole(e.target.value)}
                  placeholder="Target Role"
                />
                <select
                  className="rounded-lg border border-velora-border bg-velora-bg px-3 py-2 text-xs text-white"
                  value={mockLevel}
                  
                  onChange={(e) => setMockLevel(e.target.value as any)}
                >
                  <option value="entry">Entry / Junior</option>
                  <option value="mid">Mid-Level</option>
                  <option value="senior">Senior</option>
                  <option value="lead">Staff / Lead</option>
                </select>
                <select
                  className="rounded-lg border border-velora-border bg-velora-bg px-3 py-2 text-xs text-white"
                  value={mockType}
                  onChange={(e) => setMockType(e.target.value)}
                >
                  <option value="technical">Technical Interview</option>
                  <option value="behavioral">Behavioral (STAR)</option>
                  <option value="coding">Coding Interview</option>
                  <option value="system_design">System Design Interview</option>
                  <option value="hr">HR Screening</option>
                  <option value="managerial">Managerial Interview</option>
                  <option value="project">Project Discussion</option>
                </select>
              </div>

              {mockTurns.length === 0 ? (
                <div>
                  <button
                    onClick={() => startOrContinueMock()}
                    disabled={busyOp === 'mock-turn'}
                    className="btn-gold text-xs py-2.5 px-5 flex items-center gap-2"
                  >
                    {busyOp === 'mock-turn' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>Start Mock Interview</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="max-h-[380px] overflow-y-auto space-y-2.5 p-3 rounded-lg bg-velora-bg border border-velora-border">
                    {mockTurns.map((t, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-lg text-xs ${
                          t.speaker === 'interviewer'
                            ? 'bg-velora-surface border border-velora-border text-white mr-6'
                            : 'bg-velora-gold/10 border border-velora-gold/30 text-white ml-6'
                        }`}
                      >
                        <div className="font-mono text-[10px] uppercase text-velora-gold mb-1">
                          {t.speaker === 'interviewer' ? 'AI Interviewer' : 'You'}
                        </div>
                        {t.quickFeedback && (
                          <div className="mb-1.5 p-2 rounded bg-emerald-500/10 text-emerald-300 text-[11px]">
                            Coach note: {t.quickFeedback}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap leading-relaxed">{t.text}</p>
                      </div>
                    ))}
                  </div>

                  {mockHint && !mockComplete && (
                    <div className="p-2.5 rounded bg-velora-bg border border-velora-border text-xs text-velora-text-secondary">
                      <strong className="text-velora-gold">Coaching Hint:</strong> {mockHint}
                    </div>
                  )}

                  {!mockComplete && (
                    <div className="flex flex-col gap-2">
                      <textarea
                        className="w-full rounded-lg border border-velora-border bg-velora-bg p-3 text-xs text-white min-h-[85px]"
                        placeholder="Speak using Voice Dictation or type your answer..."
                        value={mockInput}
                        onChange={(e) => setMockInput(e.target.value)}
                      />
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => toggleMic((chunk) => setMockInput((prev) => `${prev ? prev + ' ' : ''}${chunk}`))}
                          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                        >
                          {micActive ? <MicOff className="w-3.5 h-3.5 text-red-400" /> : <Mic className="w-3.5 h-3.5 text-velora-gold" />}
                          <span>{micActive ? 'Stop Voice Dictation' : 'Speak Answer'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyOp === 'mock-turn' || !mockInput.trim()}
                          onClick={() => startOrContinueMock(mockInput.trim())}
                          className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
                        >
                          {busyOp === 'mock-turn' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          <span>Submit Answer</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PRACTICE: PERFORMANCE REPORTS */}
        {page === 'reports' && (
          <div className="flex flex-col gap-4">
            <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-white">Interview Performance Reports</h1>
                <p className="text-xs text-velora-text-secondary">
                  Explainable 7-category scores backed by transcript evidence + objective speech delivery metrics.
                </p>
              </div>
              {selectedReport && (
                <button
                  onClick={() => window.print()}
                  className="btn-gold text-xs py-2 px-3.5 flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" /> Export / Print PDF
                </button>
              )}
            </div>

            {!selectedReport ? (
              <div className="p-10 rounded-xl border border-velora-border bg-velora-surface text-center text-xs text-velora-text-secondary">
                Complete a mock interview and click &ldquo;Generate Performance Report&rdquo; to see your evaluation here.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
                  {selectedReport.disclaimer}
                </div>
                <div className="p-5 rounded-xl border border-velora-border bg-velora-surface flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-white">{selectedReport.role}</h2>
                    <p className="text-xs text-velora-text-secondary mt-1">{selectedReport.overallAssessment}</p>
                  </div>
                  <div className="text-3xl font-bold text-velora-gold">{selectedReport.overallScore}/10</div>
                </div>
                <div className="p-5 rounded-xl border border-velora-border bg-velora-surface divide-y divide-velora-border text-xs">
                  
                  {selectedReport.categoryScores?.map((c: any, i: number) => (
                    <div key={i} className="py-2.5">
                      <div className="flex justify-between font-semibold text-white">
                        <span>{c.category}</span>
                        <span className="text-velora-gold">{c.score}/10</span>
                      </div>
                      <p className="text-velora-text-secondary mt-0.5">{c.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PERFORM: WEB LIVE INTERVIEW COPILOT */}
        {page === 'live' && (
          <div className="flex flex-col gap-4">
            <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-semibold text-white">Live Interview Copilot (Web &amp; Screen Scan)</h1>
                  <p className="text-xs text-velora-text-secondary">
                    Speak or type the interviewer&apos;s question, or scan a coding/system design screen window for
                    instant grounded answers.
                  </p>
                </div>
                <button
                  onClick={scanWebScreenCopilot}
                  disabled={busyOp === 'live-screen'}
                  className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5"
                >
                  {busyOp === 'live-screen' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5 text-velora-gold" />
                  )}
                  <span>Scan Screen Question</span>
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-velora-border bg-velora-bg px-3 py-2 text-xs text-white"
                  placeholder="Type or dictate interviewer question..."
                  value={liveQuestion}
                  onChange={(e) => setLiveQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && askLiveCopilotWeb()}
                />
                <button
                  onClick={() => toggleMic((chunk) => askLiveCopilotWeb(chunk))}
                  className="btn-secondary text-xs px-3 py-2"
                  title="Listen to question via Microphone"
                >
                  {micActive ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4 text-velora-gold" />}
                </button>
                <button
                  onClick={() => askLiveCopilotWeb()}
                  disabled={busyOp === 'live-answer' || !liveQuestion.trim()}
                  className="btn-gold text-xs px-4 py-2 flex items-center gap-1.5"
                >
                  {busyOp === 'live-answer' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Answer Now</span>
                </button>
              </div>
            </div>

            {liveFeed.map((item) => (
              <div key={item.id} className="p-5 rounded-xl border border-velora-border bg-velora-surface text-xs">
                <div className="font-semibold text-velora-gold mb-1">Interviewer: {item.question}</div>
                <p className="text-white leading-relaxed whitespace-pre-wrap mb-3">{item.answer}</p>
                {item.keyPoints?.length > 0 && (
                  <ul className="list-disc pl-4 space-y-1 text-velora-text-secondary">
                    {item.keyPoints.map((kp: string, i: number) => (
                      <li key={i}>{kp}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* PERFORM: CODING ASSISTANT */}
        {page === 'coding' && (
          <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-white">Coding Interview Assistant</h1>
              <select
                className="rounded-lg border border-velora-border bg-velora-bg px-3 py-1.5 text-xs text-white"
                value={codingLang}
                onChange={(e) => setCodingLang(e.target.value)}
              >
                {['TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust'].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="w-full rounded-lg border border-velora-border bg-velora-bg p-3 text-xs text-white min-h-[120px]"
              placeholder="Paste coding interview problem statement and constraints..."
              value={codingProblem}
              onChange={(e) => setCodingProblem(e.target.value)}
            />
            <div>
              <button
                onClick={async () => {
                  setBusyOp('coding');
                  setError(null);
                  try {
                    const res = await fetch('/api/career/assistants/coding', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ problemStatement: codingProblem, language: codingLang }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error?.message || 'Coding assistant failed');
                    setCodingOut(data);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusyOp(null);
                  }
                }}
                disabled={busyOp === 'coding' || codingProblem.trim().length < 10}
                className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
              >
                {busyOp === 'coding' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Code2 className="w-3.5 h-3.5" />}
                <span>Generate Solution, Complexity &amp; Test Cases</span>
              </button>
            </div>
            {codingOut && (
              <div className="flex flex-col gap-3 text-xs">
                <p className="text-velora-text-secondary">{codingOut.problemExplanation}</p>
                <div className="p-3 rounded bg-velora-bg border border-velora-border">
                  <div className="text-velora-gold font-semibold">
                    Optimal: {codingOut.optimizedApproach?.algorithmPattern} ({codingOut.optimizedApproach?.timeComplexity}{' '}
                    time, {codingOut.optimizedApproach?.spaceComplexity} space)
                  </div>
                  <p className="text-velora-text-secondary mt-1">{codingOut.optimizedApproach?.summary}</p>
                </div>
                <pre className="p-4 rounded-lg bg-black/60 border border-velora-border font-mono overflow-x-auto text-white">
                  {codingOut.codeSolution}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* PERFORM: SQL ASSISTANT */}
        {page === 'sql' && (
          <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-white">SQL Interview Assistant</h1>
              <select
                className="rounded-lg border border-velora-border bg-velora-bg px-3 py-1.5 text-xs text-white"
                value={sqlDialect}
                onChange={(e) => setSqlDialect(e.target.value)}
              >
                {['PostgreSQL', 'MySQL', 'Snowflake', 'BigQuery', 'SQL Server'].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="w-full rounded-lg border border-velora-border bg-velora-bg p-3 text-xs text-white min-h-[120px]"
              placeholder="Describe the SQL query, joins, window functions, or schema optimization question..."
              value={sqlPrompt}
              onChange={(e) => setSqlPrompt(e.target.value)}
            />
            <div>
              <button
                onClick={async () => {
                  setBusyOp('sql');
                  setError(null);
                  try {
                    const res = await fetch('/api/career/assistants/sql', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ question: sqlPrompt, dialect: sqlDialect }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error?.message || 'SQL assistant failed');
                    setSqlOut(data);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusyOp(null);
                  }
                }}
                disabled={busyOp === 'sql' || sqlPrompt.trim().length < 10}
                className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
              >
                {busyOp === 'sql' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                <span>Generate SQL Query &amp; Indexing Strategy</span>
              </button>
            </div>
            {sqlOut && (
              <div className="flex flex-col gap-3 text-xs">
                <pre className="p-4 rounded-lg bg-black/60 border border-velora-border font-mono overflow-x-auto text-white">
                  {sqlOut.sqlQuery}
                </pre>
                <p className="text-velora-text-secondary">{sqlOut.queryExplanation}</p>
              </div>
            )}
          </div>
        )}

        {/* PERFORM: SYSTEM DESIGN ASSISTANT */}
        {page === 'system_design' && (
          <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-white">System Design Interview Assistant</h1>
              <select
                className="rounded-lg border border-velora-border bg-velora-bg px-3 py-1.5 text-xs text-white"
                value={sdScale}
                onChange={(e) => setSdScale(e.target.value)}
              >
                <option value="Startup / Mid-Scale">Startup / Mid-Scale</option>
                <option value="High-Growth (10M+ DAU)">High-Growth (10M+ DAU)</option>
                <option value="Planet-Scale (100M+ DAU)">Planet-Scale (100M+ DAU)</option>
              </select>
            </div>
            <textarea
              className="w-full rounded-lg border border-velora-border bg-velora-bg p-3 text-xs text-white min-h-[110px]"
              placeholder="e.g. Design a Global Rate Limiter, Design WhatsApp, Design Real-Time Analytics..."
              value={sdPrompt}
              onChange={(e) => setSdPrompt(e.target.value)}
            />
            <div>
              <button
                onClick={async () => {
                  setBusyOp('sd');
                  setError(null);
                  try {
                    const res = await fetch('/api/career/assistants/system-design', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ prompt: sdPrompt, scaleLevel: sdScale }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error?.message || 'System design assistant failed');
                    setSdOut(data);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusyOp(null);
                  }
                }}
                disabled={busyOp === 'sd' || sdPrompt.trim().length < 10}
                className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
              >
                {busyOp === 'sd' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                <span>Generate Complete System Design Blueprint</span>
              </button>
            </div>
            {sdOut && (
              <div className="flex flex-col gap-3 text-xs">
                <div className="font-semibold text-white text-sm">{sdOut.systemTitle}</div>
                <p className="text-velora-text-secondary">{sdOut.executiveSummary}</p>
                <pre className="p-4 rounded-lg bg-black/60 border border-velora-border font-mono overflow-x-auto text-velora-gold">
                  {sdOut.architectureDiagramAscii}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* IMPROVE: CAREER LEARNING ROADMAP */}
        {page === 'roadmap' && (
          <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-4">
            <h1 className="text-lg font-semibold text-white">Personalized Career Learning Roadmap</h1>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                className="rounded-lg border border-velora-border bg-velora-bg px-3 py-2 text-xs text-white"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Target Role"
              />
              <select
                className="rounded-lg border border-velora-border bg-velora-bg px-3 py-2 text-xs text-white"
                value={roadmapWeeks}
                onChange={(e) => setRoadmapWeeks(Number(e.target.value))}
              >
                {[2, 4, 6, 8, 12].map((w) => (
                  <option key={w} value={w}>
                    {w} Weeks Plan
                  </option>
                ))}
              </select>
              <input
                className="rounded-lg border border-velora-border bg-velora-bg px-3 py-2 text-xs text-white"
                placeholder="Specific learning goals..."
                value={roadmapGoals}
                onChange={(e) => setRoadmapGoals(e.target.value)}
              />
            </div>
            <div>
              <button
                onClick={async () => {
                  setBusyOp('roadmap');
                  setError(null);
                  try {
                    const res = await fetch('/api/career/roadmap/generate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        targetRole: jobTitle || 'Software Engineer',
                        resumeText: resumeText || undefined,
                        jobDescription: jobDescription || undefined,
                        weeksAvailable: roadmapWeeks,
                        userGoals: roadmapGoals || undefined,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error?.message || 'Roadmap generation failed');
                    setRoadmap(data);
                    await saveContextKey('career:roadmap', data);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusyOp(null);
                  }
                }}
                disabled={busyOp === 'roadmap'}
                className="btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
              >
                {busyOp === 'roadmap' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Compass className="w-3.5 h-3.5" />}
                <span>Generate Personalized Learning Roadmap</span>
              </button>
            </div>
            {roadmap && (
              <div className="flex flex-col gap-3 text-xs">
                <h2 className="text-sm font-semibold text-white">{roadmap.roadmapTitle}</h2>
                <p className="text-velora-text-secondary">{roadmap.executiveSummary}</p>
                <div className="divide-y divide-velora-border">
                  
                  {roadmap.learningPaths?.map((t: any) => (
                    <div key={t.id} className="py-2.5">
                      <div className="font-semibold text-velora-gold">
                        {t.title} ({t.priority} Priority · ~{t.estimatedHours}h)
                      </div>
                      <p className="text-velora-text-secondary mt-0.5">{t.whyItMatters}</p>
                      <div className="text-white mt-1">Exercise: {t.technicalExercise}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACCOUNT: PLAN, USAGE & SUBSCRIPTION */}
        {page === 'account' && (
          <div className="p-6 rounded-xl border border-velora-border bg-velora-surface flex flex-col gap-5">
            <h1 className="text-lg font-semibold text-white">Plan, Usage &amp; Subscription</h1>
            <p className="text-xs text-velora-text-secondary">
              Manage your Dodo Payments subscription and monthly AI allowances across Web and Desktop.
            </p>
            {billing?.plans && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {billing.plans.map((p: any) => (
                  <div key={p.id} className="p-4 rounded-xl border border-velora-border bg-velora-bg flex flex-col justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">{p.name}</div>
                      <div className="text-2xl font-bold text-velora-gold mt-1">${p.priceUsd}</div>
                      <div className="text-[11px] text-velora-text-muted mt-1">
                        {p.allowances.aiCredits} AI credits · {p.allowances.transcriptionMinutes}m audio ·{' '}
                        {p.allowances.screenshots} screen scans
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/billing/checkout', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ plan: p.id }),
                        });
                        const data = await res.json();
                        if (data.checkoutUrl) window.location.href = data.checkoutUrl;
                      }}
                      className="btn-gold text-xs py-2 px-3 mt-4"
                    >
                      Select {p.name}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

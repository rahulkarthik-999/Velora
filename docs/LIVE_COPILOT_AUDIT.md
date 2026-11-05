# Velora Live Interview Copilot: Phase 0 audit and plan

Audited: 2026-11-03, branch `feat/client-deliverable-platform` at `215c02a` plus 32 modified
and 11 new uncommitted files. Read-only audit; no code was changed.

## 1. Architecture as it is today

```
Desktop (Tauri 2, Rust + React)                      Web (Next.js on Vercel, Neon Postgres)
-------------------------------------------          ------------------------------------------
cpal/WASAPI mic + system-audio loopback              Google OAuth (NextAuth, DB sessions)
  -> dsp.rs downmix + 16 kHz resample                 Desktop device-code + email/password sign-in
  -> vad.rs energy VAD, 650 ms end-of-speech          Device bearer tokens (sha256 hashed)
  -> pipeline.rs bounded queues, echo gate            /api/live/transcribe -> OpenAI gpt-4o-mini-transcribe
  -> engine: whisper.cpp (local) | cloud.rs  ----->   /api/live/answer     -> AIRouter (Groq > 4o-mini > DeepSeek)
SQLite (WAL, FTS5): sessions, segments, resume,       /api/practice/{questions,feedback,profile}
  facts, jobs, practice, knowledge, live_answers      /api/ai/models, /api/usage
copilot.rs: question = interviewer speech since       UsageLedger: tokens, cost, latency, fallback, errors
  last answer; knowledge via FTS; POST answer         Monthly credits from TIER_LIMITS (50 / 500 / ...)
Windows: main + copilot overlay; global shortcuts
Token in Windows Credential Manager
```

The design is **local-first**: resume, transcripts, answers and audio stay in SQLite on the PC.
The server sees only per-request text (question, ≤10 passages, ≤4,000 chars of conversation)
and short audio clips that it forwards and does not store. That boundary is a strength and the
plan below keeps it.

## 2. Responsible-use findings (P0)

The spec requires transparent use and no design around bypassing interview monitoring. Three
things in the current code conflict with that:

| Finding | Where | Recommendation |
|---|---|---|
| The **main window is still excluded from screen capture** (`contentProtected: true`). `IMPLEMENTATION_STATUS.md` says the windows stay visible in screen shares, which is no longer true for the main window. | `apps/desktop/src-tauri/tauri.conf.json:23` | Remove it. Nothing in Velora needs to be hidden from capture. |
| The interviewer's audio is captured and sent to a cloud transcriber with no consent step. Recording a call can need the other party's consent, depending on jurisdiction. | `LiveInterviewPage.tsx`, `transcription/cloud.rs` | Per-session acknowledgement before system-audio capture starts, plus a visible "Velora is transcribing" state. Default retention setting. |
| The overlay combines click-through, transparency, always-on-top and auto-answer, and the prompt writes first-person scripts "as the candidate would say it". | `copilot.rs`, `lib/live.ts:59` | Keep the copilot as a visible assistant: show key points and structure first, the full answer on demand, and present it as a suggestion. Don't add anything aimed at avoiding proctoring or detection. |

I won't implement capture-hiding, proctoring evasion or similar features in later phases.

## 3. Implementation inventory

Legend: **Done**: works and has tests. **Partial**: exists but misses spec requirements. **Missing**: not present.

### Module A: transcription
| Requirement | State | Notes |
|---|---|---|
| Mic selection, device config | Done | `audio/capture.rs`, Windows default fallback |
| System-audio (loopback) capture | Done | Tested on hardware per `hardware-benchmarks.md` |
| VAD, chunking, no silence sent | Done | Energy VAD, 15 s cap, 300 ms overlap, blip rejection |
| Providers | Done (2) | whisper.cpp local (English `.en` models) and OpenAI `gpt-4o-mini-transcribe` through the backend. **No Deepgram or Sarvam code exists.** |
| Provider-independent `STTProvider` | Partial | Two engines switched by an enum inside `pipeline.rs`; no shared trait, usage or error contract |
| Partial transcripts | Missing | Clip-based: text appears only after end-of-speech. Real partials need a streaming STT (OpenAI Realtime transcription or similar). |
| Finalized, timestamped segments | Done | Session-relative ms, confidence, user corrections |
| Speaker identification | Partial | Channel-based (mic = candidate, loopback = interviewer); no diarization within a channel |
| Language detection / multilingual | Partial | Cloud: language code or auto-detect. Local: English-only models. |
| Recovery after connection failure | Partial | A failed clip is reported; no retry queue, no automatic switch to local |
| Status indicators | Done | `CaptureIndicators.tsx`, level meters |
| Usage tracking | **Missing** | Cloud clips aren't written to `UsageLedger` and use no credits. See §6. |

### Module B: question detection
| Requirement | State | Notes |
|---|---|---|
| Detect complete questions | Partial | Frontend `looksLikeQuestion` regex + a pause timer (`CopilotWindow.tsx:402`) |
| Classification (10 types) | Missing | Practice has 6 categories for generated questions only |
| Structured record (id, type, confidence, related id) | Missing | Only `answered_until_ms`; the question text exists only on `live_answers` |
| Follow-up recognition, dedupe | Missing | |
| Manual submission | Done | Typed questions, regenerate |
| History | Partial | Answer history per session |

### Module C: AI response engine
| Requirement | State | Notes |
|---|---|---|
| Adapter architecture | Done | `OpenAICompatibleProvider` + `AIRouter` (`lib/ai/provider.ts`) |
| Allowlisted models, routing | Done | `lib/ai/models.ts`: realtime → Groq, reasoning → DeepSeek, vision → GPT-4o |
| Fallback, timeouts, cooldown | Done | One fallback on another provider; total budget; per-provider cooldown (per serverless instance only) |
| Retry policy | Partial | Fallback only, no same-provider retry. Acceptable for latency. |
| Streaming | **Missing** | Whole JSON response; biggest first-token latency cost |
| Token, cost, latency, error tracking | Done | `lib/ai/ledger.ts`. Needs `db push` for the new columns. |
| Quota enforcement | Partial | Check-then-charge (concurrent requests can overspend slightly) |
| User model preferences | Partial | Request `model` field validated against plan; desktop doesn't expose a picker yet |
| Keys server-side only | Done | No key in the desktop app |

Model IDs to verify against each provider's `/models` endpoint before release: `deepseek-flash`
and `deepseek-v4-pro` (I couldn't confirm these names), `openai/gpt-oss-120b` and
`openai/gpt-oss-20b` on Groq.

### Module D: resume and candidate context
Done: PDF/DOCX/TXT parsed locally, AI extraction to skills, experience, projects and education
as editable facts, jobs with descriptions, FTS5 retrieval, "never invent" rules in every prompt.
Missing: certifications, company notes, an explicit "gap" field in answers (the prompt says
"keep personal claims generic" but doesn't surface the gap to the user).

### Module E: screen and vision
**Missing.** The router supports image parts and a vision route, but no endpoint accepts
images and the desktop has no capture or upload code.

### Module F: technical assistants
Missing as distinct modes. One generic live prompt; coding/SQL/system design aren't routed or
formatted differently.

### Module G: presentation
Partial: answer, key points, sources, follow-ups. Style (concise / detailed / STAR) is a global
setting rather than a per-answer toggle. No code blocks, keywords or separate short/detailed views.

### Module H: session memory
Partial: last 4,000 characters of conversation plus FTS retrieval, isolated per local session.
No rolling summary, no memory of earlier answers or discussed projects.

### Module I: workspace
Done: transcript, answers, timer, mic/transcriber status, start/pause/resume/end, transcript
editing, session history, auto-end on exit.
Missing: notes, bookmarks, in-session search UI (the FTS index exists), export, token/model/
provider status, recovery of a session interrupted by a crash.

### Module J: mock interview
Partial: AI-generated questions per role/difficulty, voice or typed answers, scored feedback
grounded in facts, kept separate from live sessions. Missing: conversational AI interviewer,
adaptive difficulty, dynamic follow-ups, final evaluation across the session.

### Module K: analytics
Missing beyond the per-answer 1–10 score. No objective metrics (filler words, words per minute,
response latency).

### Module L: desktop
Done: shortcuts, device selection, resizable windows, themes, settings persistence, startup
error dialog. Missing: tray, multi-monitor placement memory, crash recovery, error reporting.

### Module M: exports
**Missing.**

### Module N: admin and usage
Partial: per-user ledger and `/api/usage`. Missing: admin role, admin pages, provider/cost
analytics, STT minutes.

## 4. Defects and risks found

| # | Severity | Issue | Where |
|---|---|---|---|
| 1 | High (cost) | Cloud transcription is unmetered. A free account with 1 credit left can send 90 clips/min indefinitely, all billed to the OpenAI key. | `app/api/live/transcribe/route.ts` |
| 2 | High | Rate limits and provider cooldowns are in-process `Map`s. On Vercel each instance has its own, so limits (including login brute-force limits) don't hold under load. | `lib/api-utils.ts:41`, `provider.ts:220` |
| 3 | High | Main window hidden from screen capture. | §2 |
| 4 | Medium | 43 uncommitted files, including the model router, ledger and password sign-up. `UsageLedger` metrics columns and `User.passwordHash` need `prisma db push`. | working tree |
| 5 | Medium | Credit check and charge aren't atomic. | `lib/practice.ts:205` |
| 6 | Low | `LIVE_TRANSCRIBE_MODEL` is read but missing from `.env.example` and `turbo.json`. | `lib/live.ts:9` |
| 7 | Low | Transcribe route calls `AI_BASE_URL` directly, bypassing provider config and the ledger. | `transcribe/route.ts:44` |

## 5. Database

**Server (Prisma):** the spec's InterviewSession, TranscriptSegment, InterviewQuestion,
AIResponse, SessionNote, Resume and CandidateProfile are deliberately **not** on the server;
they live in desktop SQLite. Moving them server-side would weaken the privacy model, so I don't
recommend it. Server changes I'd make:

- `UsageLedger`: add `kind` (`llm` | `stt`) and `audioMs`. STT rows reuse the existing ledger.
- `RateLimit` table (key, windowStart, count) with an atomic upsert, so limits hold across
  instances without adding Redis.
- `User.role` (`USER` | `ADMIN`) for admin pages.

**Desktop (SQLite, schema v4):** `live_questions` (id, session_id, text, type, confidence,
heard_at_ms, related_question_id, source: auto|manual), `session_notes`, `bookmarks`,
`screenshots` (local path, hash, extracted text), and a `question_id` column on `live_answers`.
Mock-interview evaluations stay in `practice_*` tables, separate from live history.

## 6. Recommended sequence

**Step 0: before new features (small, low risk)**
1. Commit the pending work and run `db push` against Neon.
2. Remove `contentProtected`; add the per-session capture acknowledgement.
3. Meter cloud transcription: ledger rows with `audioMs`, a monthly STT-minutes quota per tier.
4. Postgres-backed rate limiter for login, register, transcribe and AI routes.

**Phase 1: core copilot**
1. Rust `SttProvider` trait over local and cloud engines (start / send / receive / stop /
   usage / error), with retry and automatic fallback to local when the cloud fails.
2. Rust question detector on finalized segments: boundary detection, rule-based type
   classification with confidence, dedupe, follow-up linking, manual correction. Rules first
   (no LLM call per sentence); the answer call can return a refined type.
3. Streaming answers: SSE from `/api/live/answer`, incremental rendering in the overlay.
4. Explicit screenshot or image upload → preview → `/api/live/vision` (GPT-4o), asynchronous,
   never automatic.
5. Rolling session memory: short summary of earlier Q&A plus retrieval.

**Phase 2: technical intelligence.** Type-specific prompts and routing (coding/SQL → DeepSeek,
system design → strongest configured model), code blocks, per-answer short/detailed/STAR
toggle, notes, bookmarks, search, HTML export (PDF via the WebView's print).

**Phase 3: coaching.** Conversational mock interviewer with adaptive difficulty and follow-ups;
evaluation report that keeps objective measurements (filler-word rate, words per minute, response
latency, answer length) separate from AI-judged scores; learning roadmap.

**Phase 4: production.** Admin role and usage/cost/provider dashboards, tray, crash recovery,
error reporting, code-signing certificate, 60-minute soak test, clean-machine installer test.

Live partial transcripts need a streaming STT session (OpenAI Realtime transcription over
WebSocket with a short-lived token minted by the backend). This is a separate design decision
because it changes cost and the privacy boundary. I'd do it after Phase 1, once the clip-based
latency has been measured.

## 7. Test and build results (run 2026-11-03)

| Check | Result |
|---|---|
| Web `tsc --noEmit` | Pass |
| Web Vitest | 53 / 53 passed (7 files) |
| Desktop `tsc --noEmit` | Pass |
| Desktop Vitest | 39 / 39 passed (9 files) |
| Rust `cargo check --all-targets` | Pass, no warnings shown |
| Rust `cargo test --lib` | 83 passed, 3 ignored (hardware tests that need a model and devices) |
| Production builds (`next build`, `tauri build`) | Not run in this audit |

## 8. What this environment can't verify

- Real interview audio quality, WER on accented speech, end-to-end latency in a live call.
- Provider calls (I didn't read or use the API keys) and the model IDs listed in §3.
- Multi-monitor behaviour, installer on a clean Windows machine, SmartScreen with no signing.
- Neon schema state (whether `db push` has been applied).

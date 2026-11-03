# Velora Desktop: Implementation Status

Last updated: 2026-11-02

The desktop copilot is always visible: an ordinary always-on-top window that
appears in screen shares and screenshots. Capture runs only after the user
starts a session, and its state is always shown.

## Sprint 1: desktop foundation (done)

**Location:** `apps/desktop` (Tauri 2.12 + React 18 + TypeScript + Rust)

- Main window with navigation, compact always-on-top copilot panel (hides instead of closing)
- Session lifecycle in Rust (start / pause / resume / end), ended automatically on exit
- Configurable, validated global shortcuts: Ctrl+Shift+V panel, Ctrl+Shift+Space pause/resume, Ctrl+Shift+E end
- Settings as JSON with atomic writes; logging with rotation; dark / light / system theme

## Sprint 2: local audio engine (done)

| Feature | State | Where |
|---|---|---|
| Microphone capture (WASAPI via cpal), device selection, Windows default fallback | Working | `src-tauri/src/audio/capture.rs` |
| System-audio capture via WASAPI loopback, output-device selection | Working, tested on hardware | `audio/capture.rs` |
| Device errors and disconnections flagged; indicators switch to "device error" | Implemented; not yet tested by unplugging a device | `audio/capture.rs`, `commands.rs` |
| Downmix + 16 kHz resampling with anti-alias low-pass | Working | `audio/dsp.rs` |
| Local VAD (energy, adaptive noise floor), pre-roll, 650 ms end-of-speech, 8 s cap with 300 ms overlap, blip rejection | Working | `audio/vad.rs` |
| Bounded queues everywhere (capture → processing → transcription); counted drops | Working | `transcription/pipeline.rs` |
| Transcription: OpenAI `gpt-4o-mini-transcribe` through the Velora API (`/api/live/transcribe`), one speech clip at a time, 3 clips in flight, recent words sent as context, one retry on network/429/5xx | Working (unit-tested; not yet re-measured on hardware) | `transcription/cloud.rs`, `transcription/pipeline.rs` |
| Hallucination and non-speech filtering | Working | `pipeline.rs` |
| Per-clip usage on the server: minutes (as cost), latency, failures | Working | web `api/live/transcribe`, `lib/ai/ledger.ts` |
| SQLite: migrations, foreign keys, WAL, integrity check, FTS5 transcript index | Working | `src-tauri/src/storage.rs` |
| Transcript persistence, editing (marked as corrected), session history, delete | Working | `storage.rs`, `SessionsPage.tsx` |
| Copilot: live transcript with source labels, timestamps, low-confidence marks, audio level meters | Working | `CopilotWindow.tsx`, `TranscriptView.tsx` |
| Static C runtime: the portable exe needs no VC++ redistributable | Working | `.cargo/config.toml` |

Raw audio exists only in bounded in-memory queues and is never written to disk.
Speech clips (never silence) are sent to OpenAI through the Velora API and not
stored; only transcript text is stored, locally. The on-device whisper.cpp
engine was removed: transcription is OpenAI only.

### Changes from the spec

- **VAD is energy-based, not Silero.** Silero would add ONNX Runtime. The VAD scores frames against an adaptive noise floor, and the 0.55 threshold applies to that score. Tune it on real interview recordings.

### Tests

- Rust: 70 unit tests (`cargo test`)
- Frontend: 24 Vitest tests
- Measured results: `docs/hardware-benchmarks.md`

### Build

```powershell
cd apps\desktop
pnpm tauri build
```

- Portable exe: `apps/desktop/src-tauri/target/release/velora-desktop.exe`
- Installer: `apps/desktop/src-tauri/target/release/bundle/nsis/`

Build machine needs: VS 2022 Build Tools (C++ workload, includes CMake), Rust stable MSVC, Node + pnpm.
The exe needs the WebView2 runtime (ships with Windows 10/11) and an AVX2 CPU (most PCs from 2013 on).

## Interview preparation (done)

Velora is an interview **preparation** tool. It does not generate answers during a
live interview, and its windows stay visible in screen shares, screenshots and the taskbar.

| Feature | Where |
|---|---|
| Desktop sign-in via device code; token in Windows Credential Manager; revocable from the website | `src-tauri/src/api.rs`, `prep.rs`; web `api/desktop/auth/*`, `desktop/link` |
| Resume import (PDF, DOCX, TXT) parsed locally | `src-tauri/src/documents.rs` |
| AI profile extraction into editable, searchable facts (FTS5 with Porter stemming) | `prep.rs`, `storage/prep.rs` |
| Jobs with descriptions (paste or import a file) | `JobsPage.tsx` |
| Practice: AI questions for the role, answer by voice (mic, OpenAI transcription) or typing, scored feedback with a model answer grounded in the 4 most relevant facts | `PracticePage.tsx`; web `api/practice/*` |
| Custom instructions and model-answer style | AI Settings |
| Usage and plan from the account; monthly credits enforced on the server | `UsagePage`; web `lib/usage.ts` |
| Record Session: transcribes system audio only (mic never opened) for later review | `LiveInterviewPage.tsx` |

Privacy: the resume, transcripts and audio stay on the PC. Feedback requests send the question, the
answer text and at most 4 matching facts. Resume extraction sends the resume text when you click
"Extract facts".

**Needs `db:push`:** the web app's new `Device` and `DeviceAuthRequest` tables (and `StoredFile`).

## Web app

- Ready for Vercel (see `docs/DEPLOY_VERCEL.md`)
- Uploaded files are stored in Postgres (`StoredFile`), so Neon or Supabase free tiers work with no separate storage service. **The schema change still has to be applied with `db:push`.**

## Next: Sprint 3, question intelligence

- Question boundary detection and classification on the transcript, done locally
- Deduplication, confidence, manual question selection
- Reduce end-of-speech latency for long utterances (see benchmarks)

## Known blockers and gaps

- Code signing certificate: not available; unsigned builds trigger SmartScreen.
- Backend for AI answers (Sprint 4) needs hosting and the OpenAI key on the server.
- Not yet run: the 60-minute soak test, an 8 GB-machine benchmark, word-error-rate measurement on Indian-English interview audio, Vulkan.

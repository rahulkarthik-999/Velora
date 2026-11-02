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
| Local VAD (energy, adaptive noise floor), pre-roll, 650 ms end-of-speech, 15 s cap with 300 ms overlap, blip rejection | Working | `audio/vad.rs` |
| Bounded queues everywhere (capture → processing → transcription); counted drops | Working | `transcription/pipeline.rs` |
| whisper.cpp 1.8.3, CPU, built from a pinned, checksum-verified source via a C shim | Working | `native/velora_whisper.c`, `build.rs`, `scripts/fetch-whisper.ps1` |
| One model instance per session, freed when the session ends | Working | `transcription/pipeline.rs` |
| Model manifest pinned to an exact upstream commit, with size + SHA-256 | Working | `resources/model-manifest.json` |
| Download: disk-space check, HTTPS only, progress, cancel, SHA-256, atomic rename | Working | `transcription/models.rs` |
| Self-test after download (must transcribe the reference sample) with measured RTF | Working | `transcription/models.rs` |
| Low-memory fallback to `base.en` (< 1.5 GB free) | Working | `models::select` |
| AVX2 check before loading (clear error instead of a crash) | Working | `transcription/engine.rs` |
| Confidence (mean token probability) and no-speech filtering | Working | `engine.rs`, `pipeline.rs` |
| SQLite: migrations, foreign keys, WAL, integrity check, FTS5 transcript index | Working | `src-tauri/src/storage.rs` |
| Transcript persistence, editing (marked as corrected), session history, delete | Working | `storage.rs`, `SessionsPage.tsx` |
| Copilot: live transcript with source labels, timestamps, low-confidence marks, audio level meters | Working | `CopilotWindow.tsx`, `TranscriptView.tsx` |
| Static C runtime: the portable exe needs no VC++ redistributable | Working | `.cargo/config.toml` |

Raw audio exists only in bounded in-memory queues. It is never written to disk
or sent over the network; only transcript text is stored, locally.

### Changes from the spec

- **Q5_0 → Q5_1.** Upstream whisper.cpp publishes no Q5_0 builds of `small.en`/`base.en`, only Q5_1 and Q8_0. Q5_1 is the closest pinned artifact.
- **VAD is energy-based, not Silero.** Silero would add ONNX Runtime. The VAD scores frames against an adaptive noise floor, and the 0.55 threshold applies to that score. Tune it on real interview recordings.
- **No whisper-rs.** Its bundled bindings are generated on Linux and have the wrong struct layouts on Windows. Generating them needs libclang (LLVM), which this machine doesn't have. A C shim avoids both.

### Tests

- Rust: 50 unit tests, plus 2 hardware tests (`cargo test -- --ignored`, needs `VELORA_TEST_MODEL`)
- Frontend: 24 Vitest tests
- Measured results: `docs/hardware-benchmarks.md`

### Build

```powershell
.\scripts\fetch-whisper.ps1     # once per checkout
cd apps\desktop
pnpm tauri build
```

- Portable exe: `apps/desktop/src-tauri/target/release/velora-desktop.exe`
- Installer: `apps/desktop/src-tauri/target/release/bundle/nsis/`

Build machine needs: VS 2022 Build Tools (C++ workload, includes CMake), Rust stable MSVC, Node + pnpm.
The exe needs the WebView2 runtime (ships with Windows 10/11) and an AVX2 CPU (most PCs from 2013 on).

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

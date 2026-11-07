# VELORA — PHASE 0 REPOSITORY & PRODUCTION AUDIT REPORT

## 1. Repository & Architecture Overview

- **`apps/desktop`**: Tauri 2.12 + React 18 + TypeScript + Rust desktop app with local SQLite (`rusqlite`, WAL, FTS5), WASAPI mic + loopback audio capture (`cpal`), local energy-based VAD, GDI screen capture (`screen.rs`), floating overlay (`CopilotWindow.tsx`), and main dashboard (`MainShell.tsx`).
- **`apps/web`**: Next.js 14 App Router web application deployed on Vercel, backed by Supabase PostgreSQL + Prisma ORM, NextAuth (Google OAuth + device-code flow + email/password), Dodo Payments (Standard Webhooks + checkout/portal), and multi-provider AI routing (`AIRouter`: OpenAI, DeepSeek, Groq).
- **`packages/schemas`**: Shared Zod schemas and TypeScript types.

## 2. Existing Working Functionality

- Tauri + React + Rust desktop architecture (`apps/desktop`)
- Supabase PostgreSQL + Prisma ORM connectivity (`apps/web/prisma/schema.prisma`)
- Google OAuth + Desktop Device Code + Email/Password authentication (`apps/web/src/lib/auth.ts`, `desktop-auth.ts`)
- Dodo Payments checkout, portal, and Standard Webhooks (`apps/web/src/lib/billing/dodo.ts`, `webhook.ts`)
- Dodo product plans ($9 Starter, $29 Pro Monthly, $69 Pro Quarterly, $149 Pro Annual, $299 Lifetime) (`apps/web/src/lib/billing/plans.ts`)
- Atomic usage reservation and credit metering (`apps/web/src/lib/billing/entitlements.ts`)
- AI provider routing and fallback across OpenAI, DeepSeek, and Groq (`apps/web/src/lib/ai/models.ts`, `provider.ts`)
- Audio capture (WASAPI mic + loopback) and local energy VAD (`apps/desktop/src-tauri/src/audio/`)
- Cloud transcription (`gpt-4o-mini-transcribe`) (`apps/desktop/src-tauri/src/transcription/cloud.rs`, `apps/web/src/app/api/live/transcribe/route.ts`)
- Live Interview Copilot & floating overlay (`apps/desktop/src-tauri/src/copilot.rs`, `CopilotWindow.tsx`)
- Local document text extraction for PDF, DOCX, TXT, MD (`apps/desktop/src-tauri/src/documents.rs`)
- Basic resume fact extraction and FTS5 retrieval (`apps/desktop/src-tauri/src/prep.rs`)
- Windows NSIS installer and GitHub release workflow (`.github/workflows/desktop-release.yml`)

## 3. Defects Fixed in Phase 1

1. **Removed Hardcoded API Key in Desktop Rust Binary**: Removed `FALLBACK_OPENAI_KEY` and direct client-side OpenAI calls from `apps/desktop/src-tauri/src/copilot.rs` to comply with Rule 11 (no API keys in frontend/desktop).
2. **Restored Server-Side Subscription Entitlement Enforcement**: Restored `accessFor` and `getEntitlement` in `apps/web/src/lib/billing/entitlements.ts` so server-side plan and quota enforcement is active and `billing.test.ts` passes.
3. **Screen Question Analysis Speed & Shortcut**:
   - Optimized `apps/desktop/src-tauri/src/screen.rs` to downscale screen captures to max 1280px width, RGB (no alpha), with `png::Compression::Fast`, reducing payload size by ~85% and encoding time to <10ms.
   - Emitted `AnswerEvent::Pending` immediately in `copilot.rs` before the network call.
   - Updated `/api/live/screen` to use `detail: 'auto'`, `maxTokens: 750`, and fast vision routing (`gpt-4o-mini` primary for low-latency screen answers).
   - Added configurable global shortcut `analyzeScreen` (`Ctrl+Shift+S` default) and local shortcut `Alt+S` in `CopilotWindow.tsx`.
4. **Live Copilot Show/Hide Velora Toggle**:
   - Added `toggle_main`, `hide_main`, and `is_main_visible` Tauri commands in `commands.rs` and global shortcut `toggleMain` (`Ctrl+Shift+M` default) so clicking Show/Hide Velora in the Copilot toggles the main Velora window while the Copilot remains open.
5. **Unified Web + Desktop Authentication on AI Endpoints**:
   - Updated `handlePractice` and `/api/live/transcribe` to accept both Desktop Bearer tokens (`getDesktopCaller`) and Web NextAuth sessions (`getAuthenticatedUser`).

## 4. Phases 2–7 Implementation Summary

- **Phase 2 — Resume Intelligence**: `/api/career/resume/analyze` + `ResumePage` (Desktop & Web) with candidate profile extraction, resume quality score, ATS formatting audit, missing skills, summary generator, editable before/after bullet improvements with explicit user approval, version history, and export.
- **Phase 3 — Job Match Analyzer**: `/api/career/jobs/analyze` + `JobsPage` (Desktop & Web) with structured job profile, seniority, required/preferred skills, missing skills, non-probabilistic compatibility assessment, difficulty assessment, likely interview questions, and preparation recommendations.
- **Phase 4 — AI Mock Interviews**: `/api/career/mock/turn` + `MockInterviewPage` (Desktop & Web) with 7 interview types (HR, Behavioral, Technical, Coding, System Design, Managerial, Project Discussion), voice (STT + TTS) and text modes, adaptive follow-up questions, timer, pause/resume, transcript, and session history.
- **Phase 5 — Interview Performance Reports**: `/api/career/reports/evaluate` + `ReportsPage` (Desktop & Web) with category-wise explainable scores, STAR evaluation, strongest/weakest answers, improved answers, objective speech metrics (filler words, WPM, response latency), personalized improvement roadmap, and print/PDF export.
- **Phase 6 — Technical Interview Assistants**: `/api/career/assistants/{coding,sql,system-design}` + `AssistantsPage` (Desktop & Web) for Coding, SQL, and System Design assistants integrated with AI routing and credit metering.
- **Phase 7 — Career Learning Roadmap**: `/api/career/roadmap/generate` + `RoadmapPage` (Desktop & Web) with skill gap dashboard, topic learning paths, weekly goals, daily practice tasks, technical exercises, question banks, progress tracking, and user customization.
- **Unified UX & Shared Career Context**: `/api/career/context` + unified navigation (`HOME`, `PREPARE`, `PRACTICE`, `PERFORM`, `IMPROVE`, `ACCOUNT`) across Desktop and Web Dashboard, plus redesigned **Velora — Your AI Career Companion** landing page.

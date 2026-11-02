# Velora Desktop: What It Is, and Why It Feels Like Nothing Works

Date: 2026-11-02 · Build: 0.1.0 (Sprints 1–2) · Tested on: Intel Core i5-7440HQ (4 cores, 4 threads), 16 GB RAM

## 1. What the .exe is today

Velora 0.1.0 is the **foundation** of the interview copilot, not the finished product.
It does one thing end to end: **transcribe speech locally**.

| Feature | In this build? |
|---|---|
| Download and verify a speech model | Yes |
| Capture microphone and system audio | Yes |
| Live transcript on your PC, labelled Mic / System | Yes, but slow on this PC (see §3.2) |
| Edit transcript lines; session history | Yes |
| Start / pause / end, global shortcuts | Yes |
| **Detect the interviewer's question** | **No.** Sprint 3 |
| **AI answer suggestions** (the Final Round–style part) | **No.** Sprint 4, needs a backend |
| Resume and job description import | No. Sprint 6 |
| Screen capture for coding questions | No. Sprint 5 |
| Sign-in, plan, usage | No. Sprints 4 and 7 |

The "Current question" and "Suggested answer" panels in the copilot say
"arrives in the next build". **That is the main reason it feels like nothing works:
the part that helps you in an interview isn't built yet.**

## 2. What happened in your session

From the app's log and local database:

| Time | Event |
|---|---|
| 15:58:14 | `small.en-q5_1` downloaded, checksum verified, self-test passed: **RTF 1.38** |
| 15:58:36 | Model loaded (176 ms); microphone ("Microphone Array") and system audio ("Speakers / Headphones") started |
| 15:58–16:00 | 1 min 38 s of active capture |
| 16:00:13 | Paused; capture confirmed stopped |
| 16:01:46 | Session ended and saved |
| 16:06–16:07 | Ctrl+Shift+Space / Ctrl+Shift+E pressed four times after the session had ended; **ignored, with nothing shown on screen** |

What was transcribed (5 lines in about 98 s of audio):

| Source | Text | Verdict |
|---|---|---|
| System | "TypeScript compilation error." | Plausible |
| Mic | "Hello. What is typescript?" | **Correct** |
| System | "TypeScript Compilation Error" | Plausible |
| Mic | "We're going to do a little bit of a video." | **Hallucination** (typical Whisper output on noise) |
| Mic | "That's fifth compilation, Karen." | **Echo**: the laptop mic hearing the speakers, garbled |

## 3. Problems found, most serious first

### 3.1 The AI answer features don't exist yet
Expected behaviour, but nothing in the app made it obvious enough. Question detection
(Sprint 3) and AI answers (Sprint 4) are the next work.

### 3.2 Transcription is slower than real time on this PC
- The self-test measured **RTF 1.38**: 10 s of speech takes about 14 s to transcribe. Live text
  falls further behind the longer people talk, and once the queue fills, speech is skipped.
- **Cause 1 (a bug):** the thread count is "logical cores ÷ 2", so this 4-core CPU without
  hyper-threading uses only **2 of its 4 cores**.
- **Cause 2:** beam search with width 3 costs roughly 2–3× more than greedy decoding, for little
  accuracy gain in live use.
- **Cause 3:** `small.en` was chosen from RAM alone (16 GB). The CPU is the bottleneck here.
  For comparison, `base.en` ran at RTF 0.42 on this PC.

### 3.3 Echo and hallucinations from the laptop microphone
Without headphones, the laptop mic records the speakers too, so the interviewer's words come
back garbled as "Mic" lines. Whisper also invents text from background noise. Nothing in the
app filters these yet.

### 3.4 Shortcuts fail silently
Pressing a shortcut when no session is running does nothing visible; it is only logged. It
looks broken.

### 3.5 Text appears only after a sentence ends
A line is transcribed only after 650 ms of silence. Combined with §3.2, long questions show
up well after they were asked.

### 3.6 Portable exe needs MSVCP140.dll
This build depends on the Visual C++ runtime. It works on this PC but may not on a clean one.
The fix is committed; the rebuild is waiting for Velora to be closed.

## 4. What you can do right now

- **Use headphones.** That removes the echo (§3.3).
- In **AI Settings → Speech model**, choose **base.en** and download it on the Overview page.
  On this PC it runs about 3× faster than small.en.
- Expect a transcript only. Answers aren't in this build.

## 5. Fix pass: done (2026-11-02)

| Problem | Fix | Measured on this PC |
|---|---|---|
| §3.2 Only 2 of 4 cores used | One thread per physical core (2 to 8) | n/a |
| §3.2 Slow decoding | Greedy decoding instead of beam search (width 3) | `small.en`: RTF **1.38 → 0.88**; `base.en`: **0.42 → 0.21** |
| §3.2 Model chosen by RAM only | Model chosen by measured speed: above 0.8× real time, `base.en` is used if downloaded; "Test speed" button on Overview; speed figures from the old settings are discarded | `small.en` (0.88) → `base.en` used automatically |
| §3.3 Hallucinations | Drop lines below 0.4 confidence; drop known Whisper phrases ("…little bit of a video", "thanks for watching", …) unless confidence ≥ 0.9 | Your session's "We're going to do a little bit of a video" (0.79) is now dropped |
| §3.3 Echo from laptop speakers | **Echo guard**: the mic is muted while system audio has speech (setting; on by default) | Speakers + both sources: **0 echo lines**. Same test with the guard off: a garbled duplicate at 0.94 confidence |
| §3.4 Silent shortcuts | On-screen notice in both windows: "No session is running…" | n/a |
| §3.6 MSVCP140.dll | whisper.cpp and the shim built with the static C++ runtime | Checked with `dumpbin` after the rebuild |

Not addressed yet: §3.1 (question detection and answers, Sprints 3–4) and §3.5
(text appears only after a sentence ends).

## 6. Proposed fixes (original plan)

**Fix pass (before Sprint 3):**
1. Use all physical cores; switch live transcription to greedy decoding.
2. Pick the model by measured speed: if the self-test RTF is above 0.8, recommend and use `base.en`.
3. Filter common Whisper hallucinations and low-confidence noise lines.
4. Echo guard: drop a Mic line that repeats what System audio captured at the same moment.
5. Show feedback when a shortcut can't act ("No session running").
6. Rebuild the portable exe with the static runtime.

**Then Sprint 3, question detection:** spot completed questions in the transcript and show them in
"Current question".

**Then Sprint 4, AI answers:** backend with your OpenAI key held server-side; answer cards in the copilot.

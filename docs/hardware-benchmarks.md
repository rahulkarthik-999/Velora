# Hardware Benchmarks

Only results that were actually run are recorded here.

## 2026-11-02: development PC

- Windows 10 Pro 19045, x64, CPU inference (AVX2), 2 to 4 threads (adaptive)
- whisper.cpp 1.8.3, `base.en` Q5_1, beam size 3, temperature 0

| Test | Result | Target |
|---|---|---|
| Model self-test (11 s reference sample), RTF | **0.42** | ≤ 1.0 gate, ≤ 0.7 preferred: **pass** |
| Model load time | 1.08 s | n/a |
| End-to-end WASAPI loopback (speakers → loopback → VAD → whisper → SQLite) | Exact transcript, confidence 0.87 | Correct text: **pass** |
| Final text after speech ends, one 10.6 s unbroken utterance | ~5 s | ≤ 4 s gate: **fail** for long unbroken speech |

### Notes

- The latency failure comes from VAD segmenting: a long sentence without a 650 ms
  pause is transcribed as one block after it ends. Shorter questions are faster.
  Options for Sprint 3: greedy decoding (beam 1) for live text, a shorter maximum
  segment, or interim partial transcription.
- `small.en` (the default) has not been benchmarked yet. Run the ignored test with it:
  `VELORA_TEST_MODEL=...\ggml-small.en-q5_1.bin cargo test real_model_self_test -- --ignored --nocapture`

## Not yet run

- 8 GB RAM / integrated-graphics machine
- 60-minute session soak (memory growth, dropped frames)
- Word error rate on Indian-English, technical-vocabulary and noisy recordings
- Microphone device unplug / replug during a session
- Vulkan backend

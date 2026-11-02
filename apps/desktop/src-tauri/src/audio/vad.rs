//! Local voice activity detection and speech segmentation.
//!
//! Energy-based VAD with an adaptive noise floor. Each 30 ms frame gets a
//! speech score in 0..1 from how far its level sits above the tracked noise
//! floor; `speech_threshold` is compared against that score. The thresholds
//! are starting points and must be tuned on real recordings.

use std::collections::VecDeque;

use serde::{Deserialize, Serialize};

use super::dsp::{rms, TARGET_RATE};

const FRAME_MS: u32 = 30;
const FRAME: usize = (TARGET_RATE * FRAME_MS / 1000) as usize;
const PRE_ROLL_MS: u32 = 210;
/// Audio kept from the end of a force-split segment and replayed into the next.
const SPLIT_OVERLAP_MS: u32 = 300;
/// A frame this many dB above the noise floor scores 1.0.
const FULL_SCORE_DB: f32 = 15.0;
/// Below this absolute level a frame is never speech (digital silence, hiss).
const ABSOLUTE_FLOOR: f32 = 0.002;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct VadConfig {
    pub speech_threshold: f32,
    pub silence_duration_ms: u32,
    pub minimum_speech_ms: u32,
    pub maximum_segment_ms: u32,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self { speech_threshold: 0.55, silence_duration_ms: 650, minimum_speech_ms: 250, maximum_segment_ms: 15_000 }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SpeechSegment {
    pub samples: Vec<f32>,
    /// Milliseconds since this source started capturing.
    pub start_ms: u64,
    pub end_ms: u64,
}

pub struct Segmenter {
    cfg: VadConfig,
    noise_floor: f32,
    pending: Vec<f32>,
    pre_roll: VecDeque<f32>,
    current: Vec<f32>,
    in_speech: bool,
    speech_ms: u32,
    silence_ms: u32,
    /// Samples consumed so far; the stream clock.
    consumed: u64,
    segment_start: u64,
}

fn ms_to_samples(ms: u32) -> usize {
    (TARGET_RATE as usize * ms as usize) / 1000
}

fn samples_to_ms(samples: u64) -> u64 {
    samples * 1000 / TARGET_RATE as u64
}

impl Segmenter {
    pub fn new(cfg: VadConfig) -> Self {
        Self {
            cfg,
            noise_floor: 0.01,
            pending: Vec::with_capacity(FRAME),
            pre_roll: VecDeque::with_capacity(ms_to_samples(PRE_ROLL_MS)),
            current: Vec::new(),
            in_speech: false,
            speech_ms: 0,
            silence_ms: 0,
            consumed: 0,
            segment_start: 0,
        }
    }

    #[cfg(test)]
    pub fn is_in_speech(&self) -> bool {
        self.in_speech
    }

    /// Speech score of a frame given the current noise floor.
    pub fn score(&self, level: f32) -> f32 {
        if level < ABSOLUTE_FLOOR {
            return 0.0;
        }
        let db_above = 20.0 * (level / self.noise_floor.max(1e-5)).log10();
        (db_above / FULL_SCORE_DB).clamp(0.0, 1.0)
    }

    /// Feeds 16 kHz mono audio. Completed segments are appended to `out`.
    pub fn push(&mut self, samples: &[f32], out: &mut Vec<SpeechSegment>) {
        for &s in samples {
            self.pending.push(s);
            if self.pending.len() == FRAME {
                let frame = std::mem::take(&mut self.pending);
                self.process_frame(&frame, out);
                self.pending = frame;
                self.pending.clear();
            }
        }
    }

    /// Ends any speech in progress (used when capture stops).
    pub fn flush(&mut self, out: &mut Vec<SpeechSegment>) {
        if self.in_speech {
            self.finish(out, 0);
        }
        self.pending.clear();
    }

    fn process_frame(&mut self, frame: &[f32], out: &mut Vec<SpeechSegment>) {
        let level = rms(frame);
        let is_speech = self.score(level) >= self.cfg.speech_threshold;

        // Noise floor: falls quickly to quieter frames, rises slowly so speech doesn't drag it up.
        if level < self.noise_floor {
            self.noise_floor = self.noise_floor * 0.7 + level.max(1e-5) * 0.3;
        } else if !is_speech {
            self.noise_floor = self.noise_floor * 0.995 + level * 0.005;
        }

        let frame_start = self.consumed;
        self.consumed += frame.len() as u64;

        if !self.in_speech {
            if is_speech {
                self.in_speech = true;
                self.speech_ms = FRAME_MS;
                self.silence_ms = 0;
                self.segment_start = frame_start - self.pre_roll.len() as u64;
                self.current.clear();
                self.current.extend(self.pre_roll.drain(..));
                self.current.extend_from_slice(frame);
            } else {
                self.pre_roll.extend(frame);
                let cap = ms_to_samples(PRE_ROLL_MS);
                while self.pre_roll.len() > cap {
                    self.pre_roll.pop_front();
                }
            }
            return;
        }

        self.current.extend_from_slice(frame);
        if is_speech {
            self.speech_ms += FRAME_MS;
            self.silence_ms = 0;
        } else {
            self.silence_ms += FRAME_MS;
        }

        if self.silence_ms >= self.cfg.silence_duration_ms {
            // Trim most of the trailing silence, keeping a short tail.
            let keep_tail = ms_to_samples(150);
            let trailing = ms_to_samples(self.silence_ms);
            let trim = trailing.saturating_sub(keep_tail).min(self.current.len());
            self.current.truncate(self.current.len() - trim);
            self.finish(out, 0);
        } else if self.current.len() >= ms_to_samples(self.cfg.maximum_segment_ms) {
            self.finish(out, ms_to_samples(SPLIT_OVERLAP_MS));
        }
    }

    /// Emits the current segment. `carry` samples from its end start the next
    /// one, so words cut by a forced split appear in both.
    fn finish(&mut self, out: &mut Vec<SpeechSegment>, carry: usize) {
        let samples = std::mem::take(&mut self.current);
        let start_ms = samples_to_ms(self.segment_start);
        let end_ms = start_ms + samples_to_ms(samples.len() as u64);

        if carry > 0 && carry < samples.len() {
            self.current.extend_from_slice(&samples[samples.len() - carry..]);
            self.segment_start += (samples.len() - carry) as u64;
        } else {
            self.in_speech = false;
            self.pre_roll.clear();
        }
        let speech_ms = std::mem::replace(&mut self.speech_ms, 0);
        self.silence_ms = 0;

        // No-speech rejection: drop clicks, coughs and blips.
        if speech_ms >= self.cfg.minimum_speech_ms {
            out.push(SpeechSegment { samples, start_ms, end_ms });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn noise(ms: u32, amp: f32, seed: &mut u32) -> Vec<f32> {
        (0..ms_to_samples(ms))
            .map(|_| {
                *seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                ((*seed >> 9) as f32 / (1u32 << 23) as f32 - 0.5) * 2.0 * amp
            })
            .collect()
    }

    fn tone(ms: u32, amp: f32) -> Vec<f32> {
        (0..ms_to_samples(ms))
            .map(|i| (i as f32 * 2.0 * std::f32::consts::PI * 220.0 / TARGET_RATE as f32).sin() * amp)
            .collect()
    }

    fn run(chunks: &[Vec<f32>]) -> Vec<SpeechSegment> {
        let mut seg = Segmenter::new(VadConfig::default());
        let mut out = Vec::new();
        for c in chunks {
            for piece in c.chunks(733) {
                seg.push(piece, &mut out);
            }
        }
        seg.flush(&mut out);
        out
    }

    #[test]
    fn silence_produces_no_segments() {
        let mut seed = 1;
        assert!(run(&[noise(5_000, 0.005, &mut seed)]).is_empty());
    }

    #[test]
    fn detects_one_utterance_with_timestamps() {
        let mut seed = 1;
        let out = run(&[noise(1_000, 0.005, &mut seed), tone(1_500, 0.3), noise(1_500, 0.005, &mut seed)]);
        assert_eq!(out.len(), 1);
        let s = &out[0];
        // Starts near 1000 ms (minus pre-roll), ends shortly after 2500 ms.
        assert!((750..=1_000).contains(&s.start_ms), "start {}", s.start_ms);
        assert!((2_500..=2_800).contains(&s.end_ms), "end {}", s.end_ms);
    }

    #[test]
    fn short_pause_does_not_split_but_long_pause_does() {
        let mut seed = 7;
        let quiet = |ms, seed: &mut u32| noise(ms, 0.005, seed);
        let out = run(&[
            quiet(800, &mut seed),
            tone(800, 0.3),
            quiet(300, &mut seed), // shorter than 650 ms silence: same segment
            tone(800, 0.3),
            quiet(1_200, &mut seed), // longer: new segment
            tone(800, 0.3),
            quiet(1_200, &mut seed),
        ]);
        assert_eq!(out.len(), 2, "{:?}", out.iter().map(|s| (s.start_ms, s.end_ms)).collect::<Vec<_>>());
    }

    #[test]
    fn rejects_blips_shorter_than_minimum_speech() {
        let mut seed = 3;
        let out = run(&[noise(1_000, 0.005, &mut seed), tone(90, 0.4), noise(1_500, 0.005, &mut seed)]);
        assert!(out.is_empty());
    }

    #[test]
    fn long_speech_is_split_with_overlap_and_bounded_length() {
        let mut seed = 5;
        let out = run(&[noise(500, 0.005, &mut seed), tone(40_000, 0.3), noise(1_500, 0.005, &mut seed)]);
        assert!(out.len() >= 3);
        for s in &out {
            assert!(s.samples.len() <= ms_to_samples(15_000) + FRAME);
        }
        // Consecutive segments overlap rather than leaving a gap.
        assert!(out[1].start_ms < out[0].end_ms);
    }

    #[test]
    fn flush_emits_speech_cut_off_by_stop() {
        let mut seed = 9;
        let mut seg = Segmenter::new(VadConfig::default());
        let mut out = Vec::new();
        seg.push(&noise(800, 0.005, &mut seed), &mut out);
        seg.push(&tone(1_000, 0.3), &mut out);
        assert!(out.is_empty() && seg.is_in_speech());
        seg.flush(&mut out);
        assert_eq!(out.len(), 1);
    }
}

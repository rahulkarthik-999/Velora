//! Format normalisation: interleaved device audio -> 16 kHz mono f32.

pub const TARGET_RATE: u32 = 16_000;

/// Averages interleaved channels into mono.
pub fn downmix(interleaved: &[f32], channels: usize, out: &mut Vec<f32>) {
    if channels <= 1 {
        out.extend_from_slice(interleaved);
        return;
    }
    let scale = 1.0 / channels as f32;
    out.extend(interleaved.chunks_exact(channels).map(|frame| frame.iter().sum::<f32>() * scale));
}

/// Streaming linear-interpolation resampler with a one-pole low-pass in front
/// when downsampling, so content above the new Nyquist doesn't alias into speech.
/// State carries across calls, so chunk boundaries don't click.
pub struct Resampler {
    step: f64,
    pos: f64,
    prev: f32,
    lp_alpha: f32,
    lp_state: f32,
}

impl Resampler {
    pub fn new(from_rate: u32, to_rate: u32) -> Self {
        let step = from_rate as f64 / to_rate as f64;
        // Cutoff a little under the target Nyquist.
        let lp_alpha = if from_rate > to_rate {
            let cutoff = 0.45 * to_rate as f32;
            let dt = 1.0 / from_rate as f32;
            let rc = 1.0 / (2.0 * std::f32::consts::PI * cutoff);
            dt / (rc + dt)
        } else {
            1.0
        };
        Self { step, pos: 0.0, prev: 0.0, lp_alpha, lp_state: 0.0 }
    }

    pub fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        if (self.step - 1.0).abs() < f64::EPSILON {
            out.extend_from_slice(input);
            return;
        }
        for &raw in input {
            self.lp_state += self.lp_alpha * (raw - self.lp_state);
            let cur = self.lp_state;
            // `pos` is the fractional position of the next output sample between prev (0) and cur (1).
            while self.pos < 1.0 {
                let t = self.pos as f32;
                out.push(self.prev + (cur - self.prev) * t);
                self.pos += self.step;
            }
            self.pos -= 1.0;
            self.prev = cur;
        }
    }
}

pub fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downmix_averages_channels() {
        let mut out = Vec::new();
        downmix(&[1.0, 0.0, 0.5, 0.5], 2, &mut out);
        assert_eq!(out, vec![0.5, 0.5]);
    }

    #[test]
    fn resample_48k_to_16k_produces_a_third_of_the_samples() {
        let mut r = Resampler::new(48_000, 16_000);
        let mut out = Vec::new();
        // Feed in odd-sized chunks to exercise state carried between calls.
        let input = vec![0.25f32; 48_000];
        for chunk in input.chunks(997) {
            r.process(chunk, &mut out);
        }
        assert!((out.len() as i64 - 16_000).abs() <= 1, "got {}", out.len());
    }

    #[test]
    fn resample_44100_rate_is_correct() {
        let mut r = Resampler::new(44_100, 16_000);
        let mut out = Vec::new();
        r.process(&vec![0.0f32; 44_100 * 2], &mut out);
        assert!((out.len() as i64 - 32_000).abs() <= 1);
    }

    #[test]
    fn low_frequency_tone_survives_resampling() {
        let mut r = Resampler::new(48_000, 16_000);
        let tone: Vec<f32> = (0..48_000).map(|i| (i as f32 * 2.0 * std::f32::consts::PI * 300.0 / 48_000.0).sin() * 0.5).collect();
        let mut out = Vec::new();
        r.process(&tone, &mut out);
        let level = rms(&out[1_000..]);
        assert!(level > 0.3, "speech-band tone should pass, rms={level}");
    }

    #[test]
    fn content_above_target_nyquist_is_attenuated() {
        let mut r = Resampler::new(48_000, 16_000);
        let tone: Vec<f32> = (0..48_000).map(|i| (i as f32 * 2.0 * std::f32::consts::PI * 15_000.0 / 48_000.0).sin() * 0.5).collect();
        let mut out = Vec::new();
        r.process(&tone, &mut out);
        assert!(rms(&out[1_000..]) < 0.2);
    }
}

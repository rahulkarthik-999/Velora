//! Safe wrapper over the whisper.cpp C shim (native/velora_whisper.c).

use std::{
    ffi::{c_char, c_void, CStr, CString},
    path::Path,
    ptr::NonNull,
    sync::atomic::AtomicI32,
};

use crate::error::{AppError, AppResult};

#[repr(C)]
struct VwOptions {
    threads: i32,
    beam_size: i32,
    temperature: f32,
    no_speech_threshold: f32,
    initial_prompt: *const c_char,
}

#[repr(C)]
#[derive(Default)]
struct VwSegment {
    start_ms: i64,
    end_ms: i64,
    no_speech_prob: f32,
    avg_token_prob: f32,
}

extern "C" {
    fn vw_init(path: *const u16, use_gpu: i32) -> *mut c_void;
    fn vw_free(ctx: *mut c_void);
    fn vw_transcribe(ctx: *mut c_void, samples: *const f32, n: i32, opts: *const VwOptions, abort: *const AtomicI32) -> i32;
    fn vw_segment_text(ctx: *mut c_void, i: i32) -> *const c_char;
    fn vw_segment_info(ctx: *mut c_void, i: i32, out: *mut VwSegment);
    fn vw_system_info() -> *const c_char;
}

#[derive(Debug, Clone)]
pub struct TranscribeOptions {
    pub threads: i32,
    pub beam_size: i32,
    pub temperature: f32,
    pub no_speech_threshold: f32,
    /// Vocabulary hints (job title, technologies) to bias recognition.
    pub initial_prompt: Option<String>,
}

impl Default for TranscribeOptions {
    fn default() -> Self {
        Self { threads: adaptive_threads(), beam_size: 3, temperature: 0.0, no_speech_threshold: 0.6, initial_prompt: None }
    }
}

/// Two threads on small machines, up to four on larger ones.
pub fn adaptive_threads() -> i32 {
    let logical = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2) as i32;
    (logical / 2).clamp(2, 4)
}

#[derive(Debug, Clone, PartialEq)]
pub struct TranscribedText {
    pub text: String,
    /// Relative to the start of the audio passed in.
    pub start_ms: i64,
    pub end_ms: i64,
    pub no_speech_prob: f32,
    /// Mean token probability, 0..1.
    pub confidence: f32,
}

pub fn cpu_supported() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        std::arch::is_x86_feature_detected!("avx2") && std::arch::is_x86_feature_detected!("fma")
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        false
    }
}

pub fn system_info() -> String {
    // SAFETY: returns a pointer to a static, NUL-terminated buffer.
    unsafe { CStr::from_ptr(vw_system_info()) }.to_string_lossy().trim().to_string()
}

/// One loaded model. Not shared between threads: the transcription worker owns it.
pub struct WhisperModel {
    ctx: NonNull<c_void>,
}

// SAFETY: the context is only ever used by one thread at a time (owned, &mut for calls).
unsafe impl Send for WhisperModel {}

impl WhisperModel {
    pub fn load(path: &Path) -> AppResult<Self> {
        if !cpu_supported() {
            return Err(AppError::Internal(
                "This processor doesn't support AVX2, which local transcription needs.".into(),
            ));
        }
        let wide: Vec<u16> = path.as_os_str().encode_wide_nul();
        // SAFETY: `wide` is a valid NUL-terminated UTF-16 string that outlives the call.
        let ctx = unsafe { vw_init(wide.as_ptr(), 0) };
        NonNull::new(ctx)
            .map(|ctx| Self { ctx })
            .ok_or_else(|| AppError::Internal(format!("Could not load speech model {}", path.display())))
    }

    /// Transcribes 16 kHz mono audio. Set `abort` to non-zero from another thread to cancel.
    pub fn transcribe(&mut self, samples: &[f32], opts: &TranscribeOptions, abort: &AtomicI32) -> AppResult<Vec<TranscribedText>> {
        if samples.is_empty() {
            return Ok(Vec::new());
        }
        let prompt = opts
            .initial_prompt
            .as_deref()
            .map(|p| CString::new(p.replace('\0', "")).expect("NULs removed"));
        let raw = VwOptions {
            threads: opts.threads,
            beam_size: opts.beam_size,
            temperature: opts.temperature,
            no_speech_threshold: opts.no_speech_threshold,
            initial_prompt: prompt.as_ref().map_or(std::ptr::null(), |p| p.as_ptr()),
        };
        let n = i32::try_from(samples.len()).map_err(|_| AppError::Internal("Audio segment too long".into()))?;

        // SAFETY: all pointers are valid for the duration of the call; ctx is exclusively borrowed.
        let count = unsafe { vw_transcribe(self.ctx.as_ptr(), samples.as_ptr(), n, &raw, abort) };
        if count < 0 {
            return Err(AppError::Internal(format!("Transcription failed (code {count})")));
        }

        let mut out = Vec::with_capacity(count as usize);
        for i in 0..count {
            let mut info = VwSegment::default();
            // SAFETY: i < count; results stay valid until the next vw_transcribe.
            let text = unsafe {
                vw_segment_info(self.ctx.as_ptr(), i, &mut info);
                let ptr = vw_segment_text(self.ctx.as_ptr(), i);
                if ptr.is_null() { String::new() } else { CStr::from_ptr(ptr).to_string_lossy().into_owned() }
            };
            out.push(TranscribedText {
                text: text.trim().to_string(),
                start_ms: info.start_ms,
                end_ms: info.end_ms,
                no_speech_prob: info.no_speech_prob,
                confidence: info.avg_token_prob,
            });
        }
        Ok(out)
    }
}

impl Drop for WhisperModel {
    fn drop(&mut self) {
        // SAFETY: ctx came from vw_init and is freed exactly once.
        unsafe { vw_free(self.ctx.as_ptr()) }
    }
}

trait EncodeWideNul {
    fn encode_wide_nul(&self) -> Vec<u16>;
}

impl EncodeWideNul for std::ffi::OsStr {
    #[cfg(windows)]
    fn encode_wide_nul(&self) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;
        self.encode_wide().chain(std::iter::once(0)).collect()
    }

    #[cfg(not(windows))]
    fn encode_wide_nul(&self) -> Vec<u16> {
        self.to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect()
    }
}

/// Parses a 16-bit PCM mono WAV into f32 samples.
pub fn decode_wav_pcm16_mono(bytes: &[u8]) -> Option<(u32, Vec<f32>)> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut pos = 12;
    let (mut rate, mut channels, mut bits) = (0u32, 0u16, 0u16);
    while pos + 8 <= bytes.len() {
        let id = &bytes[pos..pos + 4];
        let len = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().ok()?) as usize;
        let body = bytes.get(pos + 8..pos + 8 + len)?;
        if id == b"fmt " && body.len() >= 16 {
            channels = u16::from_le_bytes([body[2], body[3]]);
            rate = u32::from_le_bytes(body[4..8].try_into().ok()?);
            bits = u16::from_le_bytes([body[14], body[15]]);
        } else if id == b"data" {
            if channels != 1 || bits != 16 {
                return None;
            }
            let samples = body.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32768.0).collect();
            return Some((rate, samples));
        }
        pos += 8 + len + (len & 1);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adaptive_threads_stay_in_range() {
        assert!((2..=4).contains(&adaptive_threads()));
    }

    #[test]
    fn decodes_reference_sample() {
        let (rate, samples) = decode_wav_pcm16_mono(super::super::SELF_TEST_WAV).unwrap();
        assert_eq!(rate, 16_000);
        assert!(samples.len() > 16_000 * 10);
    }

    #[test]
    fn rejects_non_wav() {
        assert!(decode_wav_pcm16_mono(b"not a wav file at all").is_none());
    }

    #[test]
    fn missing_model_file_is_an_error_not_a_crash() {
        assert!(WhisperModel::load(Path::new("Z:/does/not/exist.bin")).is_err());
    }
}

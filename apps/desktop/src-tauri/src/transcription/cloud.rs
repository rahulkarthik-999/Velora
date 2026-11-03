//! Cloud transcription: sends one speech clip at a time to the Velora API,
//! which forwards it to OpenAI (gpt-4o-mini-transcribe). Clips are never
//! stored on either side.

use std::time::Duration;

use base64::Engine as _;
use serde::Deserialize;
use serde_json::json;

use crate::{
    api::{Api, ApiError},
    error::AppResult,
};

/// The model the Velora API transcribes with; shown in the UI.
pub const MODEL_LABEL: &str = "OpenAI gpt-4o-mini-transcribe";

/// Server-side cap on the prompt; hint and context share it.
const PROMPT_MAX_CHARS: usize = 800;
/// Recent words passed as context so a sentence split across clips reads on.
const CONTEXT_MAX_CHARS: usize = 300;
const RETRY_DELAY: Duration = Duration::from_millis(400);

#[derive(Debug, Clone, PartialEq)]
pub struct TranscribedText {
    pub text: String,
    /// Relative to the start of the audio passed in.
    pub start_ms: i64,
    pub end_ms: i64,
    pub no_speech_prob: f32,
    /// Mean token probability, 0-1.
    pub confidence: f32,
}

/// 16 kHz mono 16-bit PCM WAV.
pub fn encode_wav(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16).to_le_bytes());
    }
    out
}

pub struct CloudTranscriber {
    api: Api,
    token: String,
    language: String,
    prompt: Option<String>,
}

impl CloudTranscriber {
    pub fn new(base_url: &str, token: String, language: String, prompt: Option<String>) -> Self {
        Self { api: Api::new(base_url), token, language, prompt }
    }

    /// Transcribes one clip. `context` is the text just before it from the same
    /// source. A dropped connection, rate limit or server error is retried once.
    pub fn transcribe(&self, samples: &[f32], sample_rate: u32, context: &str) -> Result<Vec<TranscribedText>, ApiError> {
        #[derive(Deserialize)]
        struct Resp {
            text: String,
        }
        let audio = base64::engine::general_purpose::STANDARD.encode(encode_wav(samples, sample_rate));
        let mut body = json!({ "audio": audio });
        if !self.language.is_empty() {
            body["language"] = json!(self.language);
        }
        if let Some(p) = build_prompt(self.prompt.as_deref(), context) {
            body["prompt"] = json!(p);
        }
        let resp: Resp = match self.api.post("/api/live/transcribe", Some(&self.token), &body) {
            Err(e) if is_transient(&e) => {
                log::warn!("Cloud transcription failed ({}); retrying once", describe(&e));
                std::thread::sleep(RETRY_DELAY);
                self.api.post("/api/live/transcribe", Some(&self.token), &body)?
            }
            other => other?,
        };
        let duration_ms = (samples.len() as u64 * 1000 / sample_rate.max(1) as u64) as i64;
        let text = resp.text.trim().to_string();
        Ok(if text.is_empty() {
            Vec::new()
        } else {
            // The cloud model returns no per-line probabilities; treat it as confident
            // speech but still below the bar that keeps known hallucinations.
            vec![TranscribedText { text, start_ms: 0, end_ms: duration_ms, no_speech_prob: 0.0, confidence: 0.85 }]
        })
    }
}

/// Worth one more try: the network or the service, not the request or account.
pub fn is_transient(e: &ApiError) -> bool {
    match e {
        ApiError::Network(_) => true,
        ApiError::Status(code, _) => *code == 429 || *code >= 500,
        ApiError::Unauthorized => false,
    }
}

/// Vocabulary hint first (job title, technologies), then the end of what was
/// just said, so the model keeps names and sentences consistent across clips.
pub fn build_prompt(hint: Option<&str>, context: &str) -> Option<String> {
    let hint = hint.map(str::trim).unwrap_or("");
    let context = tail_chars(context.trim(), CONTEXT_MAX_CHARS);
    let joined = match (hint.is_empty(), context.is_empty()) {
        (true, true) => return None,
        (false, true) => hint.to_string(),
        (true, false) => context.to_string(),
        (false, false) => {
            let room = PROMPT_MAX_CHARS.saturating_sub(context.chars().count() + 1);
            format!("{} {context}", hint.chars().take(room).collect::<String>())
        }
    };
    Some(joined.chars().take(PROMPT_MAX_CHARS).collect())
}

/// The last `max` characters, starting at a word boundary.
fn tail_chars(text: &str, max: usize) -> &str {
    let count = text.chars().count();
    if count <= max {
        return text;
    }
    let start = text.char_indices().nth(count - max).map(|(i, _)| i).unwrap_or(0);
    let tail = &text[start..];
    tail.find(' ').map(|i| tail[i + 1..].trim_start()).unwrap_or(tail)
}

/// Converts an API failure into the message shown in the copilot.
pub fn describe(e: &ApiError) -> String {
    match e {
        ApiError::Unauthorized => "Cloud transcription needs your Velora account. Connect it on the Account page.".into(),
        ApiError::Status(_, msg) | ApiError::Network(msg) => msg.clone(),
    }
}

pub fn check_signed_in() -> AppResult<String> {
    crate::api::load_token()?.ok_or_else(|| {
        crate::error::AppError::InvalidSettings(
            "Cloud transcription uses your Velora account. Connect it on the Account page, or switch to on-device transcription in AI Settings.".into(),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_header_is_valid() {
        let wav = encode_wav(&[0.0, 0.5, -0.5, 1.0], 16_000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..16], b"WAVEfmt ");
        assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()), 16_000);
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 8);
        assert_eq!(wav.len(), 44 + 8);
        assert_eq!(i16::from_le_bytes(wav[50..52].try_into().unwrap()), i16::MAX);
    }

    #[test]
    fn only_network_and_server_failures_are_retried() {
        assert!(is_transient(&ApiError::Network("reset".into())));
        assert!(is_transient(&ApiError::Status(429, "slow down".into())));
        assert!(is_transient(&ApiError::Status(502, "bad gateway".into())));
        assert!(!is_transient(&ApiError::Status(402, "no credits".into())));
        assert!(!is_transient(&ApiError::Status(400, "bad audio".into())));
        assert!(!is_transient(&ApiError::Unauthorized));
    }

    #[test]
    fn prompt_combines_hint_and_recent_words_within_the_cap() {
        assert_eq!(build_prompt(None, "  "), None);
        assert_eq!(build_prompt(Some("Rust, Tokio"), "").as_deref(), Some("Rust, Tokio"));
        assert_eq!(build_prompt(None, "so tell me about").as_deref(), Some("so tell me about"));
        assert_eq!(build_prompt(Some("Rust"), "so tell me").as_deref(), Some("Rust so tell me"));

        let long = "word ".repeat(400);
        let p = build_prompt(Some(&"hint ".repeat(400)), &long).unwrap();
        assert!(p.chars().count() <= PROMPT_MAX_CHARS);
        assert!(p.ends_with("word"), "keeps the most recent words: {p:?}");
        assert!(p.starts_with("hint"));
    }

    #[test]
    fn context_tail_starts_at_a_word() {
        assert_eq!(tail_chars("alpha beta gamma", 8), "gamma");
        assert_eq!(tail_chars("short", 10), "short");
    }
}

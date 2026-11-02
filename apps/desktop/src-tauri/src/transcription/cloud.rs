//! Cloud transcription: sends one speech clip at a time to the Velora API,
//! which forwards it to OpenAI. Clips are never stored on either side.

use base64::Engine as _;
use serde::Deserialize;
use serde_json::json;

use crate::{
    api::{Api, ApiError},
    error::AppResult,
};

use super::engine::TranscribedText;

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

    pub fn transcribe(&self, samples: &[f32], sample_rate: u32) -> Result<Vec<TranscribedText>, ApiError> {
        #[derive(Deserialize)]
        struct Resp {
            text: String,
        }
        let audio = base64::engine::general_purpose::STANDARD.encode(encode_wav(samples, sample_rate));
        let mut body = json!({ "audio": audio });
        if !self.language.is_empty() {
            body["language"] = json!(self.language);
        }
        if let Some(p) = &self.prompt {
            body["prompt"] = json!(p.chars().take(800).collect::<String>());
        }
        let resp: Resp = self.api.post("/api/live/transcribe", Some(&self.token), &body)?;
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
}

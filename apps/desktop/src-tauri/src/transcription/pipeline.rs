//! Capture -> 16 kHz mono -> VAD segments -> whisper -> stored transcript.
//!
//! Threads:
//! - one capture thread per source (owns the WASAPI stream)
//! - one processing thread per source (resample, VAD, segmenting)
//! - one transcription worker owning the single model instance
//!
//! Raw audio only ever lives in these bounded in-memory queues. It is never
//! written to disk or sent over the network.

use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicI32, Ordering},
        Arc,
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};
use serde::Serialize;

use super::engine::{TranscribeOptions, WhisperModel};
use crate::{
    audio::{
        capture::{self, CaptureEvent, RunningCapture, SourceKind},
        dsp::{self, Resampler, TARGET_RATE},
        vad::{Segmenter, SpeechSegment, VadConfig},
    },
    error::{AppError, AppResult},
    storage::{Db, TranscriptSegment},
};

/// Speech segments waiting for the model. At most ~15 s each, so this caps
/// queued audio at a few minutes even if transcription falls far behind.
const JOB_QUEUE: usize = 12;
const LEVEL_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "kind")]
pub enum PipelineEvent {
    Segment { segment: TranscriptSegment },
    Level { source: SourceKind, rms: f32 },
    TranscriberLoading { model_id: String },
    TranscriberReady { model_id: String, load_ms: u64 },
    TranscriberFailed { message: String },
    SourceFailed { source: SourceKind, message: String },
    SegmentDropped { source: SourceKind },
}

pub type Emit = Arc<dyn Fn(PipelineEvent) + Send + Sync>;

#[derive(Debug, Clone)]
pub struct SourceConfig {
    pub kind: SourceKind,
    pub device_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PipelineConfig {
    pub session_id: String,
    pub sources: Vec<SourceConfig>,
    pub model_id: String,
    pub model_path: PathBuf,
    pub vad: VadConfig,
    pub transcribe: TranscribeOptions,
    /// Ignore the mic while the interviewer is speaking through the speakers.
    pub echo_guard: bool,
}

/// How a source's processor takes part in the echo guard.
#[derive(Clone)]
enum EchoRole {
    None,
    /// System audio: publishes whether speech is playing.
    Publisher(Arc<AtomicBool>),
    /// Microphone: hears silence while system audio has speech.
    Gated(Arc<AtomicBool>),
}

/// Laptop mics pick up the speakers, so the interviewer comes back garbled as
/// "your" speech. While system audio has speech, the mic signal is replaced
/// with silence (keeping its timing), so echo never reaches the VAD.
pub fn apply_echo_gate(samples: &mut [f32], system_speaking: bool) {
    if system_speaking {
        samples.fill(0.0);
    }
}

struct Job {
    source: SourceKind,
    segment: SpeechSegment,
}

struct ActiveSource {
    capture: RunningCapture,
    processor: JoinHandle<()>,
}

pub struct Pipeline {
    cfg: PipelineConfig,
    emit: Emit,
    jobs_tx: Sender<Job>,
    worker: Option<JoinHandle<()>>,
    abort: Arc<AtomicI32>,
    active: Vec<ActiveSource>,
    failed: Vec<SourceKind>,
    system_speaking: Arc<AtomicBool>,
}

impl Pipeline {
    /// Starts the worker (model loads in the background) and the requested sources.
    /// Fails only if no source could start.
    pub fn start(cfg: PipelineConfig, db: Arc<Db>, emit: Emit, base_ms: u64) -> AppResult<Self> {
        if cfg.sources.is_empty() {
            return Err(AppError::InvalidSettings(
                "Turn on the microphone or system audio in AI Settings before starting.".into(),
            ));
        }
        let (jobs_tx, jobs_rx) = bounded::<Job>(JOB_QUEUE);
        let abort = Arc::new(AtomicI32::new(0));
        let worker = spawn_worker(cfg.clone(), db, jobs_rx, abort.clone(), emit.clone())?;

        let mut pipeline =
            Pipeline {
                cfg,
                emit,
                jobs_tx,
                worker: Some(worker),
                abort,
                active: Vec::new(),
                failed: Vec::new(),
                system_speaking: Arc::new(AtomicBool::new(false)),
            };
        if let Err(e) = pipeline.start_sources(base_ms) {
            pipeline.stop(true);
            return Err(e);
        }
        Ok(pipeline)
    }

    fn start_sources(&mut self, base_ms: u64) -> AppResult<()> {
        self.failed.clear();
        let mut errors = Vec::new();
        let both = self.cfg.sources.iter().any(|s| s.kind == SourceKind::SystemAudio)
            && self.cfg.sources.iter().any(|s| s.kind == SourceKind::Microphone);
        for src in self.cfg.sources.clone() {
            let echo = match src.kind {
                _ if !(both && self.cfg.echo_guard) => EchoRole::None,
                SourceKind::SystemAudio => EchoRole::Publisher(self.system_speaking.clone()),
                SourceKind::Microphone => EchoRole::Gated(self.system_speaking.clone()),
            };
            match capture::start(src.kind, src.device_id.clone()) {
                Ok((capture, rx)) => {
                    let processor = spawn_processor(
                        src.kind,
                        capture.sample_rate,
                        rx,
                        self.jobs_tx.clone(),
                        self.cfg.vad.clone(),
                        base_ms,
                        echo,
                        self.emit.clone(),
                    )?;
                    self.active.push(ActiveSource { capture, processor });
                }
                Err(e) => {
                    log::error!("Could not start {}: {e}", src.kind.as_str());
                    (self.emit)(PipelineEvent::SourceFailed { source: src.kind, message: e.to_string() });
                    self.failed.push(src.kind);
                    errors.push(e.to_string());
                }
            }
        }
        if self.active.is_empty() {
            return Err(AppError::Internal(errors.join(" ")));
        }
        Ok(())
    }

    /// Stops capture and waits for it to release the devices. Speech already
    /// captured is still transcribed. The model stays loaded for `resume`.
    pub fn pause(&mut self) {
        for src in self.active.drain(..) {
            let dropped = src.capture.dropped_chunks.load(Ordering::Relaxed);
            if dropped > 0 {
                log::warn!("{} (\"{}\") dropped {dropped} audio chunks", src.capture.kind.as_str(), src.capture.device_name);
            }
            log::info!("Stopped capturing {} from \"{}\"", src.capture.kind.as_str(), src.capture.device_name);
            src.capture.stop();
            // The processor exits once the capture queue disconnects, after flushing.
            let _ = src.processor.join();
        }
    }

    pub fn resume(&mut self, base_ms: u64) -> AppResult<()> {
        if !self.active.is_empty() {
            return Ok(());
        }
        self.start_sources(base_ms)
    }

    /// Stops everything and frees the model. With `cancel_pending`, queued and
    /// in-progress transcription is abandoned instead of finished.
    pub fn stop(mut self, cancel_pending: bool) {
        self.pause();
        if cancel_pending {
            self.abort.store(1, Ordering::Relaxed);
        }
        let (dead_tx, _) = bounded(0);
        drop(std::mem::replace(&mut self.jobs_tx, dead_tx));
        if let Some(w) = self.worker.take() {
            let _ = w.join();
        }
    }

    pub fn is_capturing(&self, kind: SourceKind) -> bool {
        self.active.iter().any(|a| a.capture.kind == kind && !a.capture.is_failed())
    }

    pub fn has_failed(&self, kind: SourceKind) -> bool {
        self.failed.contains(&kind) || self.active.iter().any(|a| a.capture.kind == kind && a.capture.is_failed())
    }
}

fn spawn_processor(
    kind: SourceKind,
    device_rate: u32,
    rx: Receiver<CaptureEvent>,
    jobs: Sender<Job>,
    vad: VadConfig,
    base_ms: u64,
    echo: EchoRole,
    emit: Emit,
) -> AppResult<JoinHandle<()>> {
    std::thread::Builder::new()
        .name(format!("process-{}", kind.as_str()))
        .spawn(move || {
            let mut resampler = Resampler::new(device_rate, TARGET_RATE);
            let mut segmenter = Segmenter::new(vad);
            let mut resampled = Vec::with_capacity(4_096);
            let mut segments = Vec::new();
            let mut last_level = Instant::now();
            let mut peak = 0f32;

            let send = |segment: SpeechSegment, blocking: bool| {
                let job = Job {
                    source: kind,
                    segment: SpeechSegment { start_ms: segment.start_ms + base_ms, end_ms: segment.end_ms + base_ms, ..segment },
                };
                let sent = if blocking {
                    jobs.send_timeout(job, Duration::from_secs(5)).is_ok()
                } else {
                    !matches!(jobs.try_send(job), Err(TrySendError::Full(_) | TrySendError::Disconnected(_)))
                };
                if !sent {
                    log::warn!("Transcription is behind; dropped a {} segment", kind.as_str());
                    emit(PipelineEvent::SegmentDropped { source: kind });
                }
            };

            while let Ok(event) = rx.recv() {
                match event {
                    CaptureEvent::Audio(chunk) => {
                        resampled.clear();
                        resampler.process(&chunk.samples, &mut resampled);
                        peak = peak.max(dsp::rms(&resampled));
                        if let EchoRole::Gated(flag) = &echo {
                            apply_echo_gate(&mut resampled, flag.load(Ordering::Relaxed));
                        }
                        segmenter.push(&resampled, &mut segments);
                        if let EchoRole::Publisher(flag) = &echo {
                            flag.store(segmenter.is_in_speech(), Ordering::Relaxed);
                        }
                        for s in segments.drain(..) {
                            send(s, false);
                        }
                        if last_level.elapsed() >= LEVEL_INTERVAL {
                            emit(PipelineEvent::Level { source: kind, rms: peak });
                            peak = 0.0;
                            last_level = Instant::now();
                        }
                    }
                    CaptureEvent::Failed(message) => {
                        emit(PipelineEvent::SourceFailed { source: kind, message });
                        break;
                    }
                }
            }

            // Capture stopped: finish any speech in progress.
            segmenter.flush(&mut segments);
            for s in segments.drain(..) {
                send(s, true);
            }
            if let EchoRole::Publisher(flag) = &echo {
                flag.store(false, Ordering::Relaxed);
            }
            emit(PipelineEvent::Level { source: kind, rms: 0.0 });
        })
        .map_err(|e| AppError::Internal(format!("Could not start audio processing: {e}")))
}

fn spawn_worker(
    cfg: PipelineConfig,
    db: Arc<Db>,
    jobs: Receiver<Job>,
    abort: Arc<AtomicI32>,
    emit: Emit,
) -> AppResult<JoinHandle<()>> {
    std::thread::Builder::new()
        .name("transcriber".into())
        .spawn(move || {
            emit(PipelineEvent::TranscriberLoading { model_id: cfg.model_id.clone() });
            let started = Instant::now();
            let mut model = match WhisperModel::load(&cfg.model_path) {
                Ok(m) => m,
                Err(e) => {
                    log::error!("Model load failed: {e}");
                    emit(PipelineEvent::TranscriberFailed { message: e.to_string() });
                    // Keep draining so processors never block on a dead worker.
                    while jobs.recv().is_ok() {}
                    return;
                }
            };
            let load_ms = started.elapsed().as_millis() as u64;
            log::info!("Loaded {} in {load_ms} ms", cfg.model_id);
            emit(PipelineEvent::TranscriberReady { model_id: cfg.model_id.clone(), load_ms });

            while let Ok(job) = jobs.recv() {
                if abort.load(Ordering::Relaxed) != 0 {
                    continue;
                }
                let audio_ms = job.segment.end_ms - job.segment.start_ms;
                let t0 = Instant::now();
                let results = match model.transcribe(&job.segment.samples, &cfg.transcribe, &abort) {
                    Ok(r) => r,
                    Err(e) => {
                        log::error!("Transcription error: {e}");
                        continue;
                    }
                };
                log::debug!("Transcribed {audio_ms} ms in {} ms", t0.elapsed().as_millis());

                for r in results {
                    if !is_usable(&r.text, r.no_speech_prob, r.confidence) {
                        continue;
                    }
                    let start_ms = job.segment.start_ms as i64 + r.start_ms.max(0);
                    let end_ms = (job.segment.start_ms as i64 + r.end_ms).clamp(start_ms, job.segment.end_ms as i64);
                    let segment = TranscriptSegment {
                        id: uuid::Uuid::new_v4().to_string(),
                        session_id: cfg.session_id.clone(),
                        source: job.source.as_str().into(),
                        start_ms,
                        end_ms,
                        text: r.text,
                        confidence: Some(r.confidence),
                        corrected: false,
                    };
                    if let Err(e) = db.insert_segment(&segment, r.no_speech_prob, crate::now_ms() as i64) {
                        log::error!("Could not save transcript segment: {e}");
                    }
                    emit(PipelineEvent::Segment { segment });
                }
            }
            // Model drops here, releasing its memory.
        })
        .map_err(|e| AppError::Internal(format!("Could not start transcriber: {e}")))
}

/// Lines with a lower mean token probability are almost always noise.
const MIN_CONFIDENCE: f32 = 0.4;
/// Known hallucinations are dropped unless whisper is this sure of them.
const HALLUCINATION_KEEP_CONFIDENCE: f32 = 0.9;

/// Phrases whisper invents from silence or noise (learned from video subtitles).
/// Matched anywhere in the normalised line.
const HALLUCINATION_PHRASES: &[&str] = &[
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
    "like and subscribe",
    "subtitles by",
    "transcription by",
    "amara org",
    "little bit of a video",
    "see you in the next video",
    "see you next time",
];
/// Whole-line hallucinations: only dropped when they are the entire line.
const HALLUCINATION_LINES: &[&str] = &["you", "bye", "thank you", "thanks", "okay", "so"];

fn normalise(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '\'' { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn is_hallucination(text: &str) -> bool {
    let n = normalise(text);
    HALLUCINATION_LINES.contains(&n.as_str()) || HALLUCINATION_PHRASES.iter().any(|p| n.contains(p))
}

/// Filters empty output, non-speech markers, low-confidence noise and
/// whisper's well-known hallucinated phrases.
pub fn is_usable(text: &str, no_speech_prob: f32, confidence: f32) -> bool {
    let t = text.trim();
    if t.is_empty() || no_speech_prob > 0.8 || confidence < MIN_CONFIDENCE {
        return false;
    }
    if (t.starts_with('[') && t.ends_with(']')) || (t.starts_with('(') && t.ends_with(')')) {
        return false;
    }
    if is_hallucination(t) && confidence < HALLUCINATION_KEEP_CONFIDENCE {
        return false;
    }
    t.chars().any(|c| c.is_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_non_speech_output() {
        assert!(is_usable("Tell me about yourself.", 0.1, 0.9));
        assert!(!is_usable("   ", 0.0, 0.9));
        assert!(!is_usable("[BLANK_AUDIO]", 0.1, 0.9));
        assert!(!is_usable("(keyboard clicking)", 0.1, 0.9));
        assert!(!is_usable("...", 0.1, 0.9));
        assert!(!is_usable("Thank you.", 0.95, 0.9));
    }

    #[test]
    fn echo_gate_silences_mic_only_while_system_speaks() {
        let tone: Vec<f32> = (0..16_000).map(|i| (i as f32 * 0.09).sin() * 0.3).collect();
        let run = |system_speaking: bool| {
            let mut seg = Segmenter::new(VadConfig::default());
            let mut out = Vec::new();
            let quiet = vec![0.001f32; 16_000];
            seg.push(&quiet, &mut out);
            let mut mic = tone.clone();
            apply_echo_gate(&mut mic, system_speaking);
            seg.push(&mic, &mut out);
            seg.push(&quiet, &mut out);
            seg.flush(&mut out);
            out.len()
        };
        assert_eq!(run(true), 0, "echo while the interviewer talks is ignored");
        assert_eq!(run(false), 1, "the candidate speaking alone is kept");
    }

    #[test]
    fn drops_low_confidence_noise() {
        assert!(!is_usable("Mm hmm the uh", 0.2, 0.3));
    }

    #[test]
    fn drops_known_hallucinations_unless_very_confident() {
        // Seen in a real session on the laptop mic, confidence 0.79.
        assert!(!is_usable("We're going to do a little bit of a video.", 0.1, 0.79));
        assert!(!is_usable("Thanks for watching!", 0.1, 0.85));
        assert!(!is_usable("You", 0.1, 0.8));
        // A real "Thank you." the model is sure of stays.
        assert!(is_usable("Thank you.", 0.1, 0.95));
    }

    #[test]
    fn keeps_real_questions_that_contain_common_words() {
        // Also from the real session.
        assert!(is_usable("Hello. What is typescript?", 0.1, 0.99));
        assert!(is_usable("Thank you, so tell me about your last project.", 0.1, 0.8));
        assert!(is_usable("Okay, how would you design a URL shortener?", 0.1, 0.8));
    }

    /// Real hardware: plays the reference sample through the speakers with both the
    /// mic and loopback capturing. The mic hears the speakers, so without the echo
    /// guard it would produce a garbled duplicate. Plays sound out loud.
    /// VELORA_TEST_MODEL=path\to\model.bin cargo test echo_guard_end_to_end -- --ignored --nocapture
    #[test]
    #[ignore]
    fn echo_guard_end_to_end() {
        let model_path = PathBuf::from(std::env::var("VELORA_TEST_MODEL").expect("set VELORA_TEST_MODEL"));
        let db = Arc::new(Db::open_in_memory().unwrap());
        db.upsert_session("echo", "live", 0, None, 0, "active").unwrap();
        let cfg = PipelineConfig {
            session_id: "echo".into(),
            sources: vec![
                SourceConfig { kind: SourceKind::SystemAudio, device_id: None },
                SourceConfig { kind: SourceKind::Microphone, device_id: None },
            ],
            model_id: "test".into(),
            model_path,
            vad: VadConfig::default(),
            transcribe: TranscribeOptions::default(),
            echo_guard: true,
        };
        let pipeline = Pipeline::start(cfg, db.clone(), Arc::new(|_| {}), 0).unwrap();
        play_reference_sample();
        pipeline.stop(false);

        let segments = db.segments("echo").unwrap();
        for s in &segments {
            println!("{}: {}", s.source, s.text);
        }
        let system: String = segments.iter().filter(|s| s.source == "systemAudio").map(|s| s.text.as_str()).collect();
        assert!(system.to_lowercase().contains("country"), "system audio missing: {system:?}");
        let mic: Vec<_> = segments.iter().filter(|s| s.source == "microphone").collect();
        assert!(mic.is_empty(), "echo leaked through the mic: {mic:?}");
    }

    fn play_reference_sample() {
        let wav = std::env::temp_dir().join("velora-e2e.wav");
        std::fs::write(&wav, super::super::SELF_TEST_WAV).unwrap();
        std::thread::sleep(Duration::from_millis(500));
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &format!("(New-Object Media.SoundPlayer '{}').PlaySync()", wav.display())])
            .status()
            .unwrap();
        assert!(status.success());
        std::thread::sleep(Duration::from_millis(1_500));
    }

    /// Real hardware: plays the reference sample through the default speakers and
    /// transcribes it via WASAPI loopback. Plays sound out loud.
    /// VELORA_TEST_MODEL=path\to\model.bin cargo test loopback -- --ignored --nocapture
    #[test]
    #[ignore]
    fn loopback_end_to_end() {
        let model_path = PathBuf::from(std::env::var("VELORA_TEST_MODEL").expect("set VELORA_TEST_MODEL"));
        let db = Arc::new(Db::open_in_memory().unwrap());
        db.upsert_session("e2e", "live", 0, None, 0, "active").unwrap();
        let events = Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink = events.clone();
        let emit: Emit = Arc::new(move |e| sink.lock().unwrap().push(e));
        let cfg = PipelineConfig {
            session_id: "e2e".into(),
            sources: vec![SourceConfig { kind: SourceKind::SystemAudio, device_id: None }],
            model_id: "test".into(),
            model_path,
            vad: VadConfig::default(),
            transcribe: TranscribeOptions::default(),
            echo_guard: true,
        };

        let pipeline = Pipeline::start(cfg, db.clone(), emit, 0).unwrap();
        assert!(pipeline.is_capturing(SourceKind::SystemAudio));

        let wav = std::env::temp_dir().join("velora-e2e.wav");
        std::fs::write(&wav, super::super::SELF_TEST_WAV).unwrap();
        std::thread::sleep(Duration::from_millis(500));
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &format!("(New-Object Media.SoundPlayer '{}').PlaySync()", wav.display())])
            .status()
            .unwrap();
        assert!(status.success());
        std::thread::sleep(Duration::from_millis(1_500));

        let t0 = Instant::now();
        pipeline.stop(false);
        println!("stop() returned after {} ms", t0.elapsed().as_millis());

        let text = db.segments("e2e").unwrap().into_iter().map(|s| s.text).collect::<Vec<_>>().join(" ");
        println!("transcript: {text}");
        for e in events.lock().unwrap().iter() {
            if !matches!(e, PipelineEvent::Level { .. }) {
                println!("event: {e:?}");
            }
        }
        assert!(text.to_lowercase().contains("country"), "unexpected transcript: {text:?}");
    }

    #[test]
    fn start_without_sources_is_rejected() {
        let cfg = PipelineConfig {
            session_id: "s".into(),
            sources: vec![],
            model_id: "m".into(),
            model_path: PathBuf::from("missing.bin"),
            vad: VadConfig::default(),
            transcribe: TranscribeOptions::default(),
            echo_guard: true,
        };
        let db = Arc::new(Db::open_in_memory().unwrap());
        let emit: Emit = Arc::new(|_| {});
        assert!(Pipeline::start(cfg, db, emit, 0).is_err());
    }
}

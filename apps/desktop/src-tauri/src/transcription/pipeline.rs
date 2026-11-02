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
        atomic::{AtomicI32, Ordering},
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
            Pipeline { cfg, emit, jobs_tx, worker: Some(worker), abort, active: Vec::new(), failed: Vec::new() };
        if let Err(e) = pipeline.start_sources(base_ms) {
            pipeline.stop(true);
            return Err(e);
        }
        Ok(pipeline)
    }

    fn start_sources(&mut self, base_ms: u64) -> AppResult<()> {
        self.failed.clear();
        let mut errors = Vec::new();
        for src in self.cfg.sources.clone() {
            match capture::start(src.kind, src.device_id.clone()) {
                Ok((capture, rx)) => {
                    let processor = spawn_processor(
                        src.kind,
                        capture.sample_rate,
                        rx,
                        self.jobs_tx.clone(),
                        self.cfg.vad.clone(),
                        base_ms,
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
                        segmenter.push(&resampled, &mut segments);
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
                    if !is_usable(&r.text, r.no_speech_prob) {
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

/// Filters empty output and whisper's typical non-speech output.
pub fn is_usable(text: &str, no_speech_prob: f32) -> bool {
    let t = text.trim();
    if t.is_empty() || no_speech_prob > 0.8 {
        return false;
    }
    if (t.starts_with('[') && t.ends_with(']')) || (t.starts_with('(') && t.ends_with(')')) {
        return false;
    }
    t.chars().any(|c| c.is_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_non_speech_output() {
        assert!(is_usable("Tell me about yourself.", 0.1));
        assert!(!is_usable("   ", 0.0));
        assert!(!is_usable("[BLANK_AUDIO]", 0.1));
        assert!(!is_usable("(keyboard clicking)", 0.1));
        assert!(!is_usable("...", 0.1));
        assert!(!is_usable("Thank you.", 0.95));
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
        };
        let db = Arc::new(Db::open_in_memory().unwrap());
        let emit: Emit = Arc::new(|_| {});
        assert!(Pipeline::start(cfg, db, emit, 0).is_err());
    }
}

//! WASAPI capture through cpal: microphones, plus loopback of output devices.

use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    thread::JoinHandle,
    time::Duration,
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    FromSample, SampleFormat, SizedSample,
};
use crossbeam_channel::{bounded, Receiver, Sender};
use serde::{Deserialize, Serialize};

use super::dsp;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    Microphone,
    SystemAudio,
}

impl SourceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            SourceKind::Microphone => "microphone",
            SourceKind::SystemAudio => "systemAudio",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevices {
    /// Microphones and other input devices.
    pub inputs: Vec<AudioDevice>,
    /// Output devices; capturing one records what it plays (WASAPI loopback).
    pub outputs: Vec<AudioDevice>,
}

fn describe(device: &cpal::Device, default_id: Option<&str>) -> Option<AudioDevice> {
    let id = device.id().ok()?.to_string();
    let name = device.description().map(|d| d.name().to_string()).unwrap_or_else(|_| "Unknown device".into());
    Some(AudioDevice { is_default: default_id == Some(id.as_str()), id, name })
}

pub fn list_devices() -> AppResult<AudioDevices> {
    let host = cpal::default_host();
    let default_in = host.default_input_device().and_then(|d| d.id().ok()).map(|i| i.to_string());
    let default_out = host.default_output_device().and_then(|d| d.id().ok()).map(|i| i.to_string());
    let err = |e: cpal::DevicesError| AppError::Internal(format!("Could not list audio devices: {e}"));
    Ok(AudioDevices {
        inputs: host.input_devices().map_err(err)?.filter_map(|d| describe(&d, default_in.as_deref())).collect(),
        outputs: host.output_devices().map_err(err)?.filter_map(|d| describe(&d, default_out.as_deref())).collect(),
    })
}

fn find_device(kind: SourceKind, id: Option<&str>) -> AppResult<cpal::Device> {
    let host = cpal::default_host();
    let mut devices = match kind {
        SourceKind::Microphone => host.input_devices(),
        SourceKind::SystemAudio => host.output_devices(),
    }
    .map_err(|e| AppError::Internal(format!("Could not list audio devices: {e}")))?;

    if let Some(id) = id {
        if let Some(d) = devices.find(|d| d.id().map(|i| i.to_string() == id).unwrap_or(false)) {
            return Ok(d);
        }
        log::warn!("{} device {id} not found; using the default", kind.as_str());
    }
    match kind {
        SourceKind::Microphone => host.default_input_device(),
        SourceKind::SystemAudio => host.default_output_device(),
    }
    .ok_or_else(|| {
        AppError::Internal(match kind {
            SourceKind::Microphone => "No microphone found. Connect one or check Windows privacy settings.".into(),
            SourceKind::SystemAudio => "No speaker or headphone output found for system audio.".into(),
        })
    })
}

/// A chunk of mono audio at the device's native rate.
pub struct AudioChunk {
    pub samples: Vec<f32>,
}

pub enum CaptureEvent {
    Audio(AudioChunk),
    /// The device stopped delivering audio (unplugged, disabled, access revoked).
    Failed(String),
}

pub struct RunningCapture {
    pub kind: SourceKind,
    pub sample_rate: u32,
    pub device_name: String,
    pub dropped_chunks: Arc<AtomicU64>,
    failed: Arc<AtomicBool>,
    stop_tx: Sender<()>,
    thread: Option<JoinHandle<()>>,
}

impl RunningCapture {
    /// True once the device has reported an error (for example, it was unplugged).
    pub fn is_failed(&self) -> bool {
        self.failed.load(Ordering::Relaxed)
    }

    /// Stops the stream and waits until the device is released.
    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        let _ = self.stop_tx.send(());
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl Drop for RunningCapture {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// Queue between the audio callback and the processing thread.
/// 200 chunks is several seconds of audio; beyond that, chunks are dropped and counted.
const QUEUE_CHUNKS: usize = 200;

/// Starts capture on its own thread. Returns once the stream is playing, or with
/// the error that stopped it from starting.
pub fn start(kind: SourceKind, device_id: Option<String>) -> AppResult<(RunningCapture, Receiver<CaptureEvent>)> {
    let (tx, rx) = bounded::<CaptureEvent>(QUEUE_CHUNKS);
    let (stop_tx, stop_rx) = bounded::<()>(1);
    let (ready_tx, ready_rx) = bounded::<AppResult<(u32, String)>>(1);
    let dropped = Arc::new(AtomicU64::new(0));
    let dropped_cb = dropped.clone();
    let failed = Arc::new(AtomicBool::new(false));
    let failed_cb = failed.clone();

    let thread = std::thread::Builder::new()
        .name(format!("capture-{}", kind.as_str()))
        .spawn(move || {
            let built = (|| {
                let device = find_device(kind, device_id.as_deref())?;
                let name = device.description().map(|d| d.name().to_string()).unwrap_or_default();
                // For an output device, the default *output* config describes the loopback format.
                let config = match kind {
                    SourceKind::Microphone => device.default_input_config(),
                    SourceKind::SystemAudio => device.default_output_config(),
                }
                .map_err(|e| AppError::Internal(format!("Could not read the format of {name}: {e}")))?;
                let rate = config.sample_rate();
                let stream = build_stream(&device, &config, tx.clone(), dropped_cb, failed_cb)?;
                stream.play().map_err(|e| AppError::Internal(format!("Could not start {name}: {e}")))?;
                Ok((stream, rate, name))
            })();

            match built {
                Ok((stream, rate, name)) => {
                    let _ = ready_tx.send(Ok((rate, name)));
                    // Hold the stream until asked to stop; dropping it releases the device.
                    let _ = stop_rx.recv();
                    drop(stream);
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                }
            }
        })
        .map_err(|e| AppError::Internal(format!("Could not start capture thread: {e}")))?;

    let (sample_rate, device_name) = ready_rx
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| AppError::Internal("Audio device did not respond".into()))??;
    log::info!("Capturing {} from \"{device_name}\" at {sample_rate} Hz", kind.as_str());

    Ok((
        RunningCapture { kind, sample_rate, device_name, dropped_chunks: dropped, failed, stop_tx, thread: Some(thread) },
        rx,
    ))
}

fn build_stream(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    tx: Sender<CaptureEvent>,
    dropped: Arc<AtomicU64>,
    failed: Arc<AtomicBool>,
) -> AppResult<cpal::Stream> {
    let stream_config: cpal::StreamConfig = config.config();
    let channels = stream_config.channels as usize;
    let err_tx = tx.clone();
    let on_error = move |e: cpal::StreamError| {
        log::error!("Audio stream error: {e}");
        failed.store(true, Ordering::Relaxed);
        let _ = err_tx.try_send(CaptureEvent::Failed(e.to_string()));
    };

    macro_rules! build {
        ($t:ty) => {
            device.build_input_stream::<$t, _, _>(
                &stream_config,
                callback::<$t>(channels, tx, dropped),
                on_error,
                None,
            )
        };
    }

    match config.sample_format() {
        SampleFormat::F32 => build!(f32),
        SampleFormat::I16 => build!(i16),
        SampleFormat::I32 => build!(i32),
        SampleFormat::U16 => build!(u16),
        SampleFormat::U8 => build!(u8),
        other => return Err(AppError::Internal(format!("Unsupported audio format {other:?}"))),
    }
    .map_err(|e| AppError::Internal(format!("Could not open the audio device: {e}")))
}

/// The real-time callback: convert to mono f32 and hand off without blocking.
fn callback<T>(
    channels: usize,
    tx: Sender<CaptureEvent>,
    dropped: Arc<AtomicU64>,
) -> impl FnMut(&[T], &cpal::InputCallbackInfo) + Send + 'static
where
    T: SizedSample,
    f32: FromSample<T>,
{
    move |data: &[T], _| {
        let as_f32: Vec<f32> = data.iter().map(|s| s.to_sample::<f32>()).collect();
        let mut mono = Vec::with_capacity(as_f32.len() / channels.max(1));
        dsp::downmix(&as_f32, channels, &mut mono);
        if tx.try_send(CaptureEvent::Audio(AudioChunk { samples: mono })).is_err() {
            dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
}

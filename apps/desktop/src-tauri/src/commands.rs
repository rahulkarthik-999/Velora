use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    audio::capture::{self, AudioDevices, SourceKind},
    error::{AppError, AppResult},
    now_ms,
    session::{CaptureState, CaptureStatus, Session, SessionMode, SessionSnapshot},
    settings::Settings,
    shortcuts,
    storage::{SessionRecord, TranscriptSegment},
    system::{self, SystemInfo},
    transcription::{
        cloud,
        pipeline::{Emit, Pipeline, PipelineConfig, PipelineEvent, SourceConfig, TranscriberConfig},
    },
    AppState,
};

pub const SESSION_CHANGED: &str = "session-changed";
pub const SETTINGS_CHANGED: &str = "settings-changed";
pub const PIPELINE_EVENT: &str = "pipeline-event";
/// A short message for the user, shown as a toast in every window.
pub const APP_NOTICE: &str = "app-notice";

const MAX_SEGMENT_TEXT: usize = 2_000;

// ---------------------------------------------------------------------------
// Settings and system
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.get()
}

#[tauri::command]
pub fn update_settings(app: AppHandle, state: State<'_, AppState>, settings: Settings) -> AppResult<Settings> {
    settings.validate()?;
    let previous = state.settings.get();

    if settings.shortcuts != previous.shortcuts {
        if let Err(e) = shortcuts::apply(&app, &settings.shortcuts) {
            // Put the working shortcuts back before reporting the failure.
            if let Err(restore) = shortcuts::apply(&app, &previous.shortcuts) {
                log::error!("Could not restore previous shortcuts: {restore}");
            }
            return Err(e);
        }
    }

    let saved = state.settings.save(settings)?;
    crate::copilot::apply_overlay(&app);
    log::info!("Settings updated");
    let _ = app.emit(SETTINGS_CHANGED, &saved);
    Ok(saved)
}

#[tauri::command]
pub fn get_system_info(app: AppHandle) -> AppResult<SystemInfo> {
    system::collect(&app.package_info().version.to_string())
}

#[tauri::command]
pub async fn list_audio_devices() -> AppResult<AudioDevices> {
    tauri::async_runtime::spawn_blocking(capture::list_devices)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

fn capture_state(pipeline: Option<&Pipeline>) -> CaptureState {
    let status = |kind| match pipeline {
        Some(p) if p.is_capturing(kind) => CaptureStatus::Active,
        Some(p) if p.has_failed(kind) => CaptureStatus::Failed,
        _ => CaptureStatus::Off,
    };
    CaptureState {
        microphone: status(SourceKind::Microphone),
        system_audio: status(SourceKind::SystemAudio),
        ..CaptureState::default()
    }
}

fn snapshot(state: &AppState, session: &Session) -> SessionSnapshot {
    let pipeline = state.pipeline.lock().expect("pipeline lock poisoned");
    session.snapshot(now_ms(), capture_state(pipeline.as_ref()))
}

fn persist(state: &AppState, s: &SessionSnapshot) {
    let (Some(id), Some(mode)) = (&s.id, s.mode) else { return };
    let mode = match mode {
        SessionMode::Live => "live",
        SessionMode::Practice => "practice",
    };
    let status = format!("{:?}", s.status).to_lowercase();
    if let Err(e) = state.db.upsert_session(
        id,
        mode,
        s.started_at_ms.unwrap_or(0) as i64,
        s.ended_at_ms.map(|v| v as i64),
        s.active_ms as i64,
        &status,
    ) {
        log::error!("Could not save session: {e}");
    }
}

fn publish(app: &AppHandle, label: &str, s: &SessionSnapshot) {
    log::info!("Session {label}: {:?} ({})", s.status, s.id.as_deref().unwrap_or("-"));
    let _ = app.emit(SESSION_CHANGED, s);
}

fn pipeline_emitter(app: &AppHandle) -> Emit {
    let app = app.clone();
    Arc::new(move |event: PipelineEvent| {
        let device_failed = matches!(event, PipelineEvent::SourceFailed { .. });
        let _ = app.emit(PIPELINE_EVENT, &event);
        // A device dropping out mid-session changes the capture indicators.
        // try_lock: if a session command holds the lock, it publishes the state itself.
        if device_failed {
            let state = app.state::<AppState>();
            if let Ok(session) = state.session.try_lock() {
                let snap = snapshot(&state, &session);
                let _ = app.emit(SESSION_CHANGED, &snap);
            };
        }
    })
}

pub fn session_start(app: &AppHandle, mode: SessionMode) -> AppResult<SessionSnapshot> {
    let state = app.state::<AppState>();
    let mut session = state.session.lock().expect("session lock poisoned");
    let settings = state.settings.get();

    // Transcription is always OpenAI gpt-4o-mini-transcribe through the Velora API.
    let transcriber = TranscriberConfig {
        base_url: settings.api_base_url.clone(),
        token: cloud::check_signed_in()?,
        language: settings.transcription.language.clone(),
    };
    let prompt = vocabulary_hint(&state, &settings);

    // Each session type has one source: a live session transcribes the other
    // side (system audio) and never opens the mic; practice records your mic.
    let sources = vec![match mode {
        SessionMode::Live => SourceConfig { kind: SourceKind::SystemAudio, device_id: settings.audio.system_audio_device_id.clone() },
        SessionMode::Practice => SourceConfig { kind: SourceKind::Microphone, device_id: settings.audio.microphone_device_id.clone() },
    }];

    session.start(mode, now_ms())?;
    crate::copilot::reset_answered(&state);
    let session_id = session.id().expect("started session has an id").to_string();
    persist(&state, &session.snapshot(now_ms(), CaptureState::default()));

    let cfg = PipelineConfig {
        session_id,
        sources,
        transcriber,
        vad: Default::default(),
        prompt,
        // Only matters when mic and system audio run together.
        echo_guard: true,
    };
    match Pipeline::start(cfg, state.db.clone(), pipeline_emitter(app), 0) {
        Ok(p) => *state.pipeline.lock().expect("pipeline lock poisoned") = Some(p),
        Err(e) => {
            let mut failed = session.snapshot(now_ms(), CaptureState::default());
            failed.status = crate::session::SessionStatus::Ended;
            persist(&state, &failed);
            session.abort_start();
            return Err(e);
        }
    }

    let snap = snapshot(&state, &session);
    persist(&state, &snap);
    publish(app, "start", &snap);
    let _ = show_copilot(app.clone());
    Ok(snap)
}

/// Job title and top skills, so names like "Kubernetes" are spelled right.
fn vocabulary_hint(state: &AppState, settings: &Settings) -> Option<String> {
    let mut words: Vec<String> = Vec::new();
    if let Some(job) = settings.copilot.job_id.as_deref().and_then(|id| state.db.job(id).ok().flatten()) {
        words.push(job.title);
    }
    if let Ok(Some(profile)) = state.db.profile() {
        if let Some(skills) = profile["skills"].as_array() {
            words.extend(skills.iter().take(25).filter_map(|s| s.as_str().map(str::to_string)));
        }
    }
    (!words.is_empty()).then(|| format!("Interview. Topics: {}.", words.join(", ")))
}

pub fn session_pause(app: &AppHandle) -> AppResult<SessionSnapshot> {
    let state = app.state::<AppState>();
    let mut session = state.session.lock().expect("session lock poisoned");
    session.pause(now_ms())?;
    // Capture is confirmed stopped before the new state is reported.
    if let Some(p) = state.pipeline.lock().expect("pipeline lock poisoned").as_mut() {
        p.pause();
    }
    let snap = snapshot(&state, &session);
    persist(&state, &snap);
    publish(app, "pause", &snap);
    Ok(snap)
}

pub fn session_resume(app: &AppHandle) -> AppResult<SessionSnapshot> {
    let state = app.state::<AppState>();
    let mut session = state.session.lock().expect("session lock poisoned");
    let now = now_ms();
    let base = session.active_ms(now);
    session.resume(now)?;
    if let Some(p) = state.pipeline.lock().expect("pipeline lock poisoned").as_mut() {
        if let Err(e) = p.resume(base) {
            session.pause(now_ms())?;
            let snap = snapshot(&state, &session);
            publish(app, "resume failed", &snap);
            return Err(e);
        }
    }
    let snap = snapshot(&state, &session);
    persist(&state, &snap);
    publish(app, "resume", &snap);
    Ok(snap)
}

pub fn session_toggle_pause(app: &AppHandle) -> AppResult<SessionSnapshot> {
    let paused = app.state::<AppState>().session.lock().expect("session lock poisoned").status()
        == crate::session::SessionStatus::Paused;
    if paused {
        session_resume(app)
    } else {
        session_pause(app)
    }
}

/// Stops capture, finishes transcribing what was already heard, frees the model,
/// and only then reports the session as ended.
pub fn session_end(app: &AppHandle, cancel_pending: bool) -> AppResult<SessionSnapshot> {
    let state = app.state::<AppState>();
    let mut session = state.session.lock().expect("session lock poisoned");
    session.end(now_ms())?;
    let pipeline = state.pipeline.lock().expect("pipeline lock poisoned").take();
    if let Some(p) = pipeline {
        p.stop(cancel_pending);
    }
    let snap = snapshot(&state, &session);
    persist(&state, &snap);
    publish(app, "end", &snap);
    Ok(snap)
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| AppError::Internal(e.to_string()))?
}

#[tauri::command]
pub fn get_session(state: State<'_, AppState>) -> SessionSnapshot {
    let session = state.session.lock().expect("session lock poisoned");
    snapshot(&state, &session)
}

#[tauri::command]
pub async fn start_session(app: AppHandle, mode: SessionMode) -> AppResult<SessionSnapshot> {
    blocking(move || session_start(&app, mode)).await
}

#[tauri::command]
pub async fn pause_session(app: AppHandle) -> AppResult<SessionSnapshot> {
    blocking(move || session_pause(&app)).await
}

#[tauri::command]
pub async fn resume_session(app: AppHandle) -> AppResult<SessionSnapshot> {
    blocking(move || session_resume(&app)).await
}

#[tauri::command]
pub async fn end_session(app: AppHandle) -> AppResult<SessionSnapshot> {
    blocking(move || session_end(&app, false)).await
}

// ---------------------------------------------------------------------------
// Transcripts and history
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_transcript(state: State<'_, AppState>, session_id: String) -> AppResult<Vec<TranscriptSegment>> {
    state.db.segments(&session_id)
}

#[tauri::command]
pub fn update_transcript_segment(state: State<'_, AppState>, id: String, text: String) -> AppResult<TranscriptSegment> {
    let text = text.trim();
    if text.is_empty() {
        return Err(AppError::InvalidSettings("Transcript text can't be empty.".into()));
    }
    if text.chars().count() > MAX_SEGMENT_TEXT {
        return Err(AppError::InvalidSettings("Transcript text is too long.".into()));
    }
    state.db.update_segment_text(&id, text)
}

#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> AppResult<Vec<SessionRecord>> {
    state.db.sessions(200)
}

#[tauri::command]
pub fn delete_session(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let session = state.session.lock().expect("session lock poisoned");
    let in_use = session.id() == Some(id.as_str())
        && matches!(session.status(), crate::session::SessionStatus::Active | crate::session::SessionStatus::Paused);
    if in_use {
        return Err(AppError::Internal("End the session before deleting it.".into()));
    }
    state.db.delete_session(&id)
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

fn window(app: &AppHandle, label: &str) -> AppResult<tauri::WebviewWindow> {
    app.get_webview_window(label).ok_or_else(|| AppError::WindowNotFound(label.into()))
}

#[tauri::command]
pub fn show_copilot(app: AppHandle) -> AppResult<()> {
    let w = window(&app, "copilot")?;
    w.show().map_err(|e| AppError::Internal(e.to_string()))?;
    w.set_focus().map_err(|e| AppError::Internal(e.to_string()))
}

#[tauri::command]
pub fn toggle_copilot(app: AppHandle) -> AppResult<()> {
    let w = window(&app, "copilot")?;
    if w.is_visible().unwrap_or(false) {
        w.hide().map_err(|e| AppError::Internal(e.to_string()))
    } else {
        show_copilot(app)
    }
}

#[tauri::command]
pub fn show_main(app: AppHandle) -> AppResult<()> {
    let w = window(&app, "main")?;
    w.unminimize().map_err(|e| AppError::Internal(e.to_string()))?;
    w.show().map_err(|e| AppError::Internal(e.to_string()))?;
    w.set_focus().map_err(|e| AppError::Internal(e.to_string()))
}

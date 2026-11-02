use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionMode {
    Live,
    Practice,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Idle,
    Active,
    Paused,
    Ended,
}

/// State of one capture source as confirmed by the native layer.
/// The UI must only show a source as recording when this says `Active`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureStatus {
    Off,
    Active,
    /// The device stopped or could not be opened.
    Failed,
    /// The capture engine for this source is not part of this build yet.
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureState {
    pub microphone: CaptureStatus,
    pub system_audio: CaptureStatus,
    pub screen: CaptureStatus,
}

impl Default for CaptureState {
    fn default() -> Self {
        // Screen capture arrives in a later sprint.
        Self { microphone: CaptureStatus::Off, system_audio: CaptureStatus::Off, screen: CaptureStatus::Unavailable }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub id: Option<String>,
    pub mode: Option<SessionMode>,
    pub status: SessionStatus,
    pub started_at_ms: Option<u64>,
    pub ended_at_ms: Option<u64>,
    /// Time spent in the Active state, excluding pauses.
    pub active_ms: u64,
    pub capture: CaptureState,
}

/// Session lifecycle. Time is passed in so transitions are deterministic in tests.
#[derive(Debug)]
pub struct Session {
    id: Option<String>,
    mode: Option<SessionMode>,
    status: SessionStatus,
    started_at_ms: Option<u64>,
    ended_at_ms: Option<u64>,
    accumulated_active_ms: u64,
    active_since_ms: Option<u64>,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            id: None,
            mode: None,
            status: SessionStatus::Idle,
            started_at_ms: None,
            ended_at_ms: None,
            accumulated_active_ms: 0,
            active_since_ms: None,
        }
    }
}

impl Session {
    pub fn status(&self) -> SessionStatus {
        self.status
    }

    pub fn id(&self) -> Option<&str> {
        self.id.as_deref()
    }

    pub fn mode(&self) -> Option<SessionMode> {
        self.mode
    }

    pub fn active_ms(&self, now_ms: u64) -> u64 {
        self.accumulated_active_ms + self.active_since_ms.map(|s| now_ms.saturating_sub(s)).unwrap_or(0)
    }

    /// `capture` is what the audio pipeline reports; the session never guesses it.
    pub fn snapshot(&self, now_ms: u64, capture: CaptureState) -> SessionSnapshot {
        let running = self.active_since_ms.map(|since| now_ms.saturating_sub(since)).unwrap_or(0);
        SessionSnapshot {
            id: self.id.clone(),
            mode: self.mode,
            status: self.status,
            started_at_ms: self.started_at_ms,
            ended_at_ms: self.ended_at_ms,
            active_ms: self.accumulated_active_ms + running,
            capture,
        }
    }

    pub fn start(&mut self, mode: SessionMode, now_ms: u64) -> AppResult<()> {
        self.require(&[SessionStatus::Idle, SessionStatus::Ended], "start a session")?;
        *self = Session {
            id: Some(uuid::Uuid::new_v4().to_string()),
            mode: Some(mode),
            status: SessionStatus::Active,
            started_at_ms: Some(now_ms),
            active_since_ms: Some(now_ms),
            ..Session::default()
        };
        Ok(())
    }

    pub fn pause(&mut self, now_ms: u64) -> AppResult<()> {
        self.require(&[SessionStatus::Active], "pause")?;
        self.bank_active_time(now_ms);
        self.status = SessionStatus::Paused;
        Ok(())
    }

    pub fn resume(&mut self, now_ms: u64) -> AppResult<()> {
        self.require(&[SessionStatus::Paused], "resume")?;
        self.active_since_ms = Some(now_ms);
        self.status = SessionStatus::Active;
        Ok(())
    }

    pub fn toggle_pause(&mut self, now_ms: u64) -> AppResult<()> {
        match self.status {
            SessionStatus::Active => self.pause(now_ms),
            SessionStatus::Paused => self.resume(now_ms),
            _ => self.require(&[SessionStatus::Active, SessionStatus::Paused], "pause or resume"),
        }
    }

    /// Undoes a start whose capture could not begin.
    pub fn abort_start(&mut self) {
        *self = Session::default();
    }

    pub fn end(&mut self, now_ms: u64) -> AppResult<()> {
        self.require(&[SessionStatus::Active, SessionStatus::Paused], "end")?;
        self.bank_active_time(now_ms);
        self.status = SessionStatus::Ended;
        self.ended_at_ms = Some(now_ms);
        Ok(())
    }

    fn bank_active_time(&mut self, now_ms: u64) {
        if let Some(since) = self.active_since_ms.take() {
            self.accumulated_active_ms += now_ms.saturating_sub(since);
        }
    }

    fn require(&self, allowed: &[SessionStatus], action: &'static str) -> AppResult<()> {
        if allowed.contains(&self.status) {
            Ok(())
        } else {
            Err(AppError::InvalidTransition { action, status: format!("{:?}", self.status).to_lowercase() })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_lifecycle_tracks_active_time_without_pauses() {
        let mut s = Session::default();
        s.start(SessionMode::Live, 1_000).unwrap();
        s.pause(4_000).unwrap(); // 3s active
        s.resume(10_000).unwrap(); // 6s paused
        s.end(12_000).unwrap(); // 2s active
        let snap = s.snapshot(50_000, CaptureState::default());
        assert_eq!(snap.status, SessionStatus::Ended);
        assert_eq!(snap.active_ms, 5_000);
        assert_eq!(snap.started_at_ms, Some(1_000));
        assert_eq!(snap.ended_at_ms, Some(12_000));
    }

    #[test]
    fn snapshot_includes_running_time() {
        let mut s = Session::default();
        s.start(SessionMode::Practice, 0).unwrap();
        assert_eq!(s.snapshot(2_500, CaptureState::default()).active_ms, 2_500);
    }

    #[test]
    fn invalid_transitions_are_rejected() {
        let mut s = Session::default();
        assert!(s.pause(0).is_err());
        assert!(s.resume(0).is_err());
        assert!(s.end(0).is_err());
        s.start(SessionMode::Live, 0).unwrap();
        assert!(s.start(SessionMode::Live, 1).is_err());
        assert!(s.resume(1).is_err());
    }

    #[test]
    fn toggle_pause_flips_between_active_and_paused() {
        let mut s = Session::default();
        assert!(s.toggle_pause(0).is_err());
        s.start(SessionMode::Live, 0).unwrap();
        s.toggle_pause(1).unwrap();
        assert_eq!(s.status(), SessionStatus::Paused);
        s.toggle_pause(2).unwrap();
        assert_eq!(s.status(), SessionStatus::Active);
    }

    #[test]
    fn restart_after_end_gets_fresh_id_and_clock() {
        let mut s = Session::default();
        s.start(SessionMode::Live, 0).unwrap();
        let first = s.snapshot(0, CaptureState::default()).id;
        s.end(5_000).unwrap();
        s.start(SessionMode::Live, 10_000).unwrap();
        let snap = s.snapshot(11_000, CaptureState::default());
        assert_ne!(snap.id, first);
        assert_eq!(snap.active_ms, 1_000);
        assert_eq!(snap.ended_at_ms, None);
    }

    #[test]
    fn default_capture_state_records_nothing() {
        let c = CaptureState::default();
        assert_eq!(c.microphone, CaptureStatus::Off);
        assert_eq!(c.system_audio, CaptureStatus::Off);
        assert_eq!(c.screen, CaptureStatus::Unavailable);
    }

    #[test]
    fn abort_start_returns_to_idle() {
        let mut s = Session::default();
        s.start(SessionMode::Live, 0).unwrap();
        s.abort_start();
        assert_eq!(s.status(), SessionStatus::Idle);
        assert!(s.id().is_none());
    }
}

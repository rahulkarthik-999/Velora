use std::{
    fs,
    path::{Path, PathBuf},
    str::FromStr,
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::Shortcut;

use crate::error::{AppError, AppResult};

pub const SETTINGS_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    System,
    Dark,
    Light,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AnswerStyle {
    Concise,
    Detailed,
    Star,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShortcutSettings {
    pub toggle_copilot: String,
    pub pause_resume: String,
    pub end_session: String,
}

impl Default for ShortcutSettings {
    fn default() -> Self {
        Self {
            toggle_copilot: "Ctrl+Shift+V".into(),
            pause_resume: "Ctrl+Shift+Space".into(),
            end_session: "Ctrl+Shift+E".into(),
        }
    }
}

impl ShortcutSettings {
    pub fn entries(&self) -> [(&'static str, &str); 3] {
        [
            ("toggleCopilot", self.toggle_copilot.as_str()),
            ("pauseResume", self.pause_resume.as_str()),
            ("endSession", self.end_session.as_str()),
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AudioSettings {
    pub capture_microphone: bool,
    pub capture_system_audio: bool,
    /// None means the Windows default device.
    pub microphone_device_id: Option<String>,
    pub system_audio_device_id: Option<String>,
    /// Ignore the microphone while system audio has speech (for laptop speakers).
    pub echo_guard: bool,
}

impl Default for AudioSettings {
    fn default() -> Self {
        Self { capture_microphone: true, capture_system_audio: true, microphone_device_id: None, system_audio_device_id: None, echo_guard: true }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TranscriptionSettings {
    pub model_id: String,
}

impl Default for TranscriptionSettings {
    fn default() -> Self {
        Self { model_id: "small.en-q5_1".into() }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub schema_version: u32,
    pub theme: Theme,
    pub answer_style: AnswerStyle,
    pub shortcuts: ShortcutSettings,
    pub audio: AudioSettings,
    pub transcription: TranscriptionSettings,
    pub api_base_url: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            theme: Theme::System,
            answer_style: AnswerStyle::Concise,
            shortcuts: ShortcutSettings::default(),
            audio: AudioSettings::default(),
            transcription: TranscriptionSettings::default(),
            api_base_url: "https://api.veloraweb.online/api/v1".into(),
        }
    }
}

impl Settings {
    pub fn validate(&self) -> AppResult<()> {
        let mut seen: Vec<Shortcut> = Vec::new();
        for (name, value) in self.shortcuts.entries() {
            let parsed = Shortcut::from_str(value).map_err(|_| {
                AppError::InvalidSettings(format!("Shortcut '{value}' for {name} is not a valid key combination"))
            })?;
            if !parsed.mods.intersects(
                tauri_plugin_global_shortcut::Modifiers::CONTROL
                    | tauri_plugin_global_shortcut::Modifiers::ALT
                    | tauri_plugin_global_shortcut::Modifiers::SUPER,
            ) {
                return Err(AppError::InvalidSettings(format!(
                    "Shortcut '{value}' for {name} needs Ctrl, Alt or Win so it doesn't capture normal typing"
                )));
            }
            if seen.contains(&parsed) {
                return Err(AppError::InvalidSettings(format!("Shortcut '{value}' is assigned to more than one action")));
            }
            seen.push(parsed);
        }

        crate::transcription::models::find(&self.transcription.model_id)?;

        let url = self.api_base_url.trim();
        let local = url.starts_with("http://localhost") || url.starts_with("http://127.0.0.1");
        if !(url.starts_with("https://") || local) {
            return Err(AppError::InvalidSettings(
                "API URL must use https:// (http:// is only allowed for localhost)".into(),
            ));
        }
        Ok(())
    }
}

/// Persists settings as JSON in the app config directory.
/// Writes go to a temp file first and are renamed into place, so a crash
/// mid-write never leaves a truncated settings file.
pub struct SettingsStore {
    path: PathBuf,
    current: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> Self {
        let settings = match fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<Settings>(&raw) {
                Ok(s) if s.validate().is_ok() => s,
                Ok(_) | Err(_) => {
                    let backup = path.with_extension("corrupt.json");
                    log::warn!("Settings at {} are invalid; backing up to {} and using defaults", path.display(), backup.display());
                    if let Err(e) = fs::rename(&path, &backup) {
                        log::error!("Could not back up invalid settings: {e}");
                    }
                    Settings::default()
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Settings::default(),
            Err(e) => {
                log::error!("Could not read settings ({e}); using defaults");
                Settings::default()
            }
        };
        Self { path, current: Mutex::new(settings) }
    }

    pub fn get(&self) -> Settings {
        self.current.lock().expect("settings lock poisoned").clone()
    }

    pub fn save(&self, mut next: Settings) -> AppResult<Settings> {
        next.schema_version = SETTINGS_SCHEMA_VERSION;
        next.api_base_url = next.api_base_url.trim().trim_end_matches('/').to_string();
        next.validate()?;
        write_atomic(&self.path, &serde_json::to_vec_pretty(&next)?)?;
        *self.current.lock().expect("settings lock poisoned") = next.clone();
        Ok(next)
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        Settings::default().validate().unwrap();
    }

    #[test]
    fn rejects_unparseable_shortcut() {
        let mut s = Settings::default();
        s.shortcuts.end_session = "Ctrl+Shift+NotAKey".into();
        assert!(s.validate().is_err());
    }

    #[test]
    fn rejects_shortcut_without_modifier() {
        let mut s = Settings::default();
        s.shortcuts.toggle_copilot = "Shift+V".into();
        assert!(s.validate().is_err());
    }

    #[test]
    fn rejects_duplicate_shortcuts() {
        let mut s = Settings::default();
        s.shortcuts.end_session = s.shortcuts.toggle_copilot.clone();
        assert!(s.validate().is_err());
    }

    #[test]
    fn rejects_plain_http_api_url() {
        let mut s = Settings::default();
        s.api_base_url = "http://api.example.com".into();
        assert!(s.validate().is_err());
        s.api_base_url = "http://localhost:8000/api/v1".into();
        assert!(s.validate().is_ok());
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let store = SettingsStore::load(path.clone());
        let mut s = store.get();
        s.theme = Theme::Dark;
        s.answer_style = AnswerStyle::Star;
        s.api_base_url = "https://api.example.com/v1/".into();
        store.save(s).unwrap();

        let reloaded = SettingsStore::load(path).get();
        assert_eq!(reloaded.theme, Theme::Dark);
        assert_eq!(reloaded.answer_style, AnswerStyle::Star);
        assert_eq!(reloaded.api_base_url, "https://api.example.com/v1");
    }

    #[test]
    fn invalid_save_leaves_previous_settings() {
        let dir = tempfile::tempdir().unwrap();
        let store = SettingsStore::load(dir.path().join("settings.json"));
        let mut bad = store.get();
        bad.shortcuts.pause_resume = "nope".into();
        assert!(store.save(bad).is_err());
        assert_eq!(store.get(), Settings::default());
    }

    #[test]
    fn corrupt_file_is_backed_up_and_defaults_used() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{ not json").unwrap();
        let store = SettingsStore::load(path.clone());
        assert_eq!(store.get(), Settings::default());
        assert!(path.with_extension("corrupt.json").exists());
    }

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{ "theme": "light" }"#).unwrap();
        let s = SettingsStore::load(path).get();
        assert_eq!(s.theme, Theme::Light);
        assert_eq!(s.shortcuts, ShortcutSettings::default());
    }
}

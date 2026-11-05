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
/// The site's canonical host. The bare domain redirects here, and a redirected POST
/// (sign-in, sign-up, AI requests) loses its body, so the app must call this host directly.
pub const DEFAULT_API_BASE_URL: &str = "https://www.veloraweb.online";
const OLD_API_BASE_URL: &str = "https://veloraweb.online";
/// Matches the server's limit.
pub const MAX_CUSTOM_INSTRUCTIONS: usize = 1_500;

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
    pub answer_now: String,
    pub toggle_auto_answer: String,
    pub toggle_click_through: String,
}

impl Default for ShortcutSettings {
    fn default() -> Self {
        Self {
            toggle_copilot: "Ctrl+Shift+V".into(),
            pause_resume: "Ctrl+Shift+Space".into(),
            end_session: "Ctrl+Shift+E".into(),
            answer_now: "Ctrl+Shift+Enter".into(),
            toggle_auto_answer: "Ctrl+Shift+U".into(),
            toggle_click_through: "Ctrl+Shift+K".into(),
        }
    }
}

impl ShortcutSettings {
    pub fn entries(&self) -> [(&'static str, &str); 6] {
        [
            ("toggleCopilot", self.toggle_copilot.as_str()),
            ("pauseResume", self.pause_resume.as_str()),
            ("endSession", self.end_session.as_str()),
            ("answerNow", self.answer_now.as_str()),
            ("toggleAutoAnswer", self.toggle_auto_answer.as_str()),
            ("toggleClickThrough", self.toggle_click_through.as_str()),
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AudioSettings {
    /// None means the Windows default device.
    pub microphone_device_id: Option<String>,
    pub system_audio_device_id: Option<String>,
}

impl Default for AudioSettings {
    fn default() -> Self {
        Self { microphone_device_id: None, system_audio_device_id: None }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
/// Speech is transcribed by OpenAI gpt-4o-mini-transcribe through the Velora
/// API. Older settings files may still hold `engine` and `modelId`; they are
/// ignored when read.
pub struct TranscriptionSettings {
    /// Two-letter language code; empty detects it.
    pub language: String,
}

impl Default for TranscriptionSettings {
    fn default() -> Self {
        Self { language: "en".into() }
    }
}

/// The live copilot panel: answers and how the overlay looks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CopilotSettings {
    /// Answer automatically when the interviewer finishes a question.
    pub auto_answer: bool,
    /// Job whose title and description ground live answers.
    pub job_id: Option<String>,
    /// Panel opacity, 0.3 (see-through) to 1.0.
    pub opacity: f32,
    /// Text size multiplier for the panel, 0.8 to 1.5.
    pub font_scale: f32,
    pub always_on_top: bool,
    /// Mouse clicks pass through the panel to the window behind it.
    pub click_through: bool,
    pub show_transcript: bool,
    /// Also transcribe the microphone in live sessions, so answers know what you already said.
    pub transcribe_microphone: bool,
    /// Hides key points, sources and follow-ups to keep only the answer.
    pub compact: bool,
}

impl Default for CopilotSettings {
    fn default() -> Self {
        Self {
            auto_answer: true,
            job_id: None,
            opacity: 0.96,
            font_scale: 1.0,
            always_on_top: true,
            click_through: false,
            show_transcript: true,
            transcribe_microphone: false,
            compact: false,
        }
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
    pub copilot: CopilotSettings,
    /// Tailors live answers, practice questions, feedback and model answers (tone, length, focus).
    pub custom_instructions: String,
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
            copilot: CopilotSettings::default(),
            custom_instructions: String::new(),
            api_base_url: DEFAULT_API_BASE_URL.into(),
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

        let lang = &self.transcription.language;
        if !(lang.is_empty() || (lang.len() == 2 && lang.chars().all(|c| c.is_ascii_lowercase()))) {
            return Err(AppError::InvalidSettings("Language must be a two-letter code such as en, or empty to detect it.".into()));
        }
        if !(0.3..=1.0).contains(&self.copilot.opacity) {
            return Err(AppError::InvalidSettings("Panel opacity must be between 30% and 100%.".into()));
        }
        if !(0.8..=1.5).contains(&self.copilot.font_scale) {
            return Err(AppError::InvalidSettings("Text size must be between 80% and 150%.".into()));
        }
        if self.custom_instructions.chars().count() > MAX_CUSTOM_INSTRUCTIONS {
            return Err(AppError::InvalidSettings(format!(
                "Custom instructions can be up to {MAX_CUSTOM_INSTRUCTIONS} characters."
            )));
        }

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
                Ok(mut s) if s.validate().is_ok() => {
                    // Saved by versions up to 0.3, before the site moved to www.
                    if s.api_base_url.trim_end_matches('/') == OLD_API_BASE_URL {
                        s.api_base_url = DEFAULT_API_BASE_URL.into();
                    }
                    s
                }
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
    fn rejects_out_of_range_overlay_values() {
        let mut s = Settings::default();
        s.copilot.opacity = 0.1;
        assert!(s.validate().is_err());
        s.copilot.opacity = 0.8;
        s.copilot.font_scale = 3.0;
        assert!(s.validate().is_err());
        s.copilot.font_scale = 1.2;
        s.transcription.language = "English".into();
        assert!(s.validate().is_err());
        s.transcription.language = String::new();
        assert!(s.validate().is_ok());
    }

    #[test]
    fn older_settings_files_gain_new_shortcuts() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{ "shortcuts": { "toggleCopilot": "Ctrl+Alt+V" } }"#).unwrap();
        let s = SettingsStore::load(path).get();
        assert_eq!(s.shortcuts.toggle_copilot, "Ctrl+Alt+V");
        assert_eq!(s.shortcuts.answer_now, "Ctrl+Shift+Enter");
        assert!(s.copilot.auto_answer);
    }

    #[test]
    fn old_bare_domain_api_url_moves_to_www() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{ "apiBaseUrl": "https://veloraweb.online" }"#).unwrap();
        assert_eq!(SettingsStore::load(path).get().api_base_url, DEFAULT_API_BASE_URL);
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

    #[test]
    fn settings_from_the_on_device_engine_still_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{ "theme": "dark", "transcription": { "engine": "local", "modelId": "small.en-q5_1", "language": "hi" } }"#).unwrap();
        let s = SettingsStore::load(path).get();
        assert_eq!(s.theme, Theme::Dark);
        assert_eq!(s.transcription.language, "hi");
    }
}

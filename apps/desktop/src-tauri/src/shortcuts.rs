use std::str::FromStr;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::{
    commands,
    error::{AppError, AppResult},
    settings::ShortcutSettings,
    AppState,
};

/// Replaces all registered global shortcuts with the given set.
pub fn apply(app: &AppHandle, shortcuts: &ShortcutSettings) -> AppResult<()> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| AppError::Internal(e.to_string()))?;
    for (name, value) in shortcuts.entries() {
        gs.register(value).map_err(|e| {
            AppError::InvalidSettings(format!("Could not register {value} for {name}; another app may be using it ({e})"))
        })?;
    }
    Ok(())
}

pub fn handle(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }
    let configured = app.state::<AppState>().settings.get().shortcuts;
    let matches = |value: &str| Shortcut::from_str(value).map(|s| &s == shortcut).unwrap_or(false);

    if matches(&configured.toggle_copilot) {
        if let Err(e) = commands::toggle_copilot(app.clone()) {
            log::info!("Shortcut {shortcut:?} ignored: {e}");
        }
        return;
    }

    let action: fn(&AppHandle) -> AppResult<()> = if matches(&configured.pause_resume) {
        |app| commands::session_toggle_pause(app).map(|_| ())
    } else if matches(&configured.end_session) {
        |app| commands::session_end(app, false).map(|_| ())
    } else {
        return;
    };

    // Starting or stopping capture can take a moment; keep it off the UI thread.
    let app = app.clone();
    let shortcut = *shortcut;
    std::thread::spawn(move || {
        // Shortcuts fire with no UI waiting on them, so surface failures in the log.
        if let Err(e) = action(&app) {
            log::info!("Shortcut {shortcut:?} ignored: {e}");
        }
    });
}

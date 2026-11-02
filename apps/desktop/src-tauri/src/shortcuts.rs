use std::str::FromStr;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::{
    commands, copilot,
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
    if matches(&configured.answer_now) {
        copilot::answer_from_shortcut(app);
        return;
    }
    let toggle = if matches(&configured.toggle_auto_answer) {
        Some(copilot::Toggle::AutoAnswer)
    } else if matches(&configured.toggle_click_through) {
        Some(copilot::Toggle::ClickThrough)
    } else {
        None
    };
    if let Some(which) = toggle {
        if let Err(e) = copilot::toggle(app, which) {
            let _ = app.emit(commands::APP_NOTICE, e.to_string());
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
        // No UI is waiting on a shortcut, so tell the user on screen why nothing happened.
        if let Err(e) = action(&app) {
            log::info!("Shortcut {shortcut:?} ignored: {e}");
            let message = match e {
                // Pause/resume/end only fail this way when no session is running.
                AppError::InvalidTransition { .. } => {
                    "No session is running. Start one from the Live Copilot page.".to_string()
                }
                other => other.to_string(),
            };
            let _ = app.emit(commands::APP_NOTICE, message);
        }
    });
}

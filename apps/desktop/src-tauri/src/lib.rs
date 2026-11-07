mod api;
mod billing;
mod audio;
mod documents;
mod prep;
mod transcription;
mod commands;
mod copilot;
mod error;
mod session;
mod settings;
mod shortcuts;
mod storage;
mod system;
mod screen;

use std::sync::{atomic::AtomicBool, Arc, Mutex};

use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use session::Session;
use settings::SettingsStore;
use storage::Db;
use transcription::pipeline::Pipeline;

pub struct AppState {
    pub settings: SettingsStore,
    /// Lock order: `session` before `pipeline`.
    pub session: Mutex<Session>,
    pub pipeline: Mutex<Option<Pipeline>>,
    pub db: Arc<Db>,
    /// Cancel flag for a desktop sign-in that is waiting for approval.
    pub linking: Mutex<Option<Arc<AtomicBool>>>,
    /// Practice question whose answer is being recorded.
    pub recording_item: Mutex<Option<String>>,
    /// A copilot answer is being written.
    pub answering: AtomicBool,
    /// Interviewer speech up to here (session ms) has been answered.
    pub answered_until_ms: Mutex<i64>,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Startup can't continue: tell the user why instead of closing silently.
fn fatal_startup_error(message: &str) -> ! {
    log::error!("Startup failed: {message}");
    rfd::MessageDialog::new()
        .set_title("Velora can't start")
        .set_description(format!(
            "{message}\n\nIf this keeps happening, install the latest version from https://veloraweb.online/download."
        ))
        .set_level(rfd::MessageLevel::Error)
        .show();
    std::process::exit(1);
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: Some("velora".into()) }),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(5 * 1024 * 1024)
                .rotation_strategy(RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(shortcuts::handle)
                .build(),
        )
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let store = SettingsStore::load(config_dir.join("settings.json"));
            let initial_shortcuts = store.get().shortcuts;
            let db = match Db::open(&app.path().app_data_dir()?.join("velora.db")) {
                Ok(db) => db,
                Err(e) => fatal_startup_error(&e.to_string()),
            };
            app.manage(AppState {
                settings: store,
                session: Mutex::new(Session::default()),
                pipeline: Mutex::new(None),
                db: Arc::new(db),
                linking: Mutex::new(None),
                recording_item: Mutex::new(None),
                answering: AtomicBool::new(false),
                answered_until_ms: Mutex::new(-1),
            });

            // Windows are created here, not by Tauri from the config ("create": false),
            // so their pages can never call a command before AppState is managed.
            for window in app.config().app.windows.clone() {
                tauri::WebviewWindowBuilder::from_config(app.handle(), &window)?.build()?;
            }
            copilot::apply_overlay(app.handle());

            for label in ["main", "copilot"] {
                if let Some(w) = app.get_webview_window(label) {
                    protect_window(&w, label);
                }
            }

            // A shortcut taken by another app must not stop Velora from starting.
            if let Some(message) = shortcuts::apply_best_effort(app.handle(), &initial_shortcuts) {
                log::warn!("{message}");
                // Give the windows a moment to start listening before showing it.
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(4));
                    let _ = handle.emit(commands::APP_NOTICE, message);
                });
            }
            log::info!("Velora {} started", app.package_info().version);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    // The copilot panel is hidden rather than destroyed so it can be reopened.
                    "copilot" => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    // If the copilot is visible, closing the main window hides the main window
                    // so the copilot can stay active; if the copilot is hidden too, quit the app.
                    "main" => {
                        let copilot_visible = window
                            .app_handle()
                            .get_webview_window("copilot")
                            .and_then(|c| c.is_visible().ok())
                            .unwrap_or(false);
                        if copilot_visible {
                            api.prevent_close();
                            let _ = window.hide();
                            let _ = window.app_handle().emit(commands::MAIN_VISIBILITY_CHANGED, false);
                        } else {
                            window.app_handle().exit(0);
                        }
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::get_system_info,
            commands::list_audio_devices,
            commands::get_session,
            commands::start_session,
            commands::pause_session,
            commands::resume_session,
            commands::end_session,
            commands::get_transcript,
            commands::update_transcript_segment,
            commands::list_sessions,
            commands::delete_session,
            prep::account_status,
            prep::account_start_link,
            prep::account_cancel_link,
            prep::account_register,
            prep::account_login,
            billing::billing_status,
            billing::billing_checkout,
            billing::billing_portal,
            prep::account_sign_out,
            prep::import_resume,
            prep::save_resume_text,
            prep::get_resume,
            prep::read_document,
            prep::get_profile,
            prep::extract_profile,
            prep::save_fact,
            prep::delete_fact,
            prep::list_jobs,
            prep::save_job,
            prep::delete_job,
            prep::create_practice,
            prep::list_practice,
            prep::get_practice,
            prep::delete_practice,
            prep::save_practice_answer,
            prep::practice_record_start,
            prep::practice_record_stop,
            prep::practice_feedback,
            prep::get_career_store,
            prep::save_career_store,
            prep::career_api_post,
            prep::career_api_get,
            commands::show_copilot,
            commands::toggle_copilot,
            commands::show_main,
            commands::hide_main,
            commands::toggle_main,
            commands::is_main_visible,
            copilot::live_answer,
            copilot::live_screen_answer,
            copilot::get_live_answers,
            copilot::list_knowledge,
            copilot::add_knowledge_note,
            copilot::import_knowledge,
            copilot::delete_knowledge,
            commands::toggle_screen_shield,
            commands::get_screen_shield,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Velora");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            // Never leave a session running behind a closed app.
            if handle.try_state::<AppState>().is_some() && commands::session_end(handle, true).is_ok() {
                log::info!("Ended active session on exit");
            }
        }
    });
}

use std::sync::atomic::Ordering;

static SCREEN_SHIELD_ENABLED: AtomicBool = AtomicBool::new(true);

pub fn is_screen_shield_enabled() -> bool {
    SCREEN_SHIELD_ENABLED.load(Ordering::Relaxed)
}

pub fn set_screen_protection(w: &tauri::WebviewWindow, enable: bool) {
    let _ = w.set_skip_taskbar(true);
    SCREEN_SHIELD_ENABLED.store(enable, Ordering::Relaxed);

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowDisplayAffinity, SetWindowLongPtrW,
            SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST, SWP_FRAMECHANGED, SWP_NOACTIVATE,
            SWP_NOMOVE, SWP_NOSIZE, WDA_EXCLUDEFROMCAPTURE, WDA_NONE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
        };

        if let Ok(hwnd) = w.hwnd() {
            let raw_hwnd = HWND(hwnd.0 as _);
            let affinity = if enable { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
            unsafe {
                if let Err(e) = SetWindowDisplayAffinity(raw_hwnd, affinity) {
                    log::warn!("Failed to set SetWindowDisplayAffinity: {e}");
                } else {
                    log::info!("Set SetWindowDisplayAffinity({:?})", affinity.0);
                }

                let ex_style = GetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE);
                if ex_style != 0 {
                    let new_ex_style = (ex_style & !(WS_EX_APPWINDOW.0 as isize)) | (WS_EX_TOOLWINDOW.0 as isize);
                    SetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE, new_ex_style);
                    let _ = SetWindowPos(
                        raw_hwnd,
                        HWND_TOPMOST,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
                    );
                }
            }
        }
    }
}

pub fn protect_window(w: &tauri::WebviewWindow, _label: &str) {
    let enabled = is_screen_shield_enabled();
    set_screen_protection(w, enabled);
}

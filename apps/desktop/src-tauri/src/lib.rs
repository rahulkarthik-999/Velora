mod api;
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

use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use tauri::{Manager, RunEvent, WindowEvent};
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
    pub models_dir: PathBuf,
    /// Model currently downloading, with its cancel flag.
    pub installing: Mutex<Option<(String, Arc<AtomicBool>)>>,
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
            let db = Db::open(&app.path().app_data_dir()?.join("velora.db"))?;
            app.manage(AppState {
                settings: store,
                session: Mutex::new(Session::default()),
                pipeline: Mutex::new(None),
                db: Arc::new(db),
                models_dir: system::models_dir(),
                installing: Mutex::new(None),
                linking: Mutex::new(None),
                recording_item: Mutex::new(None),
                answering: AtomicBool::new(false),
                answered_until_ms: Mutex::new(-1),
            });
            copilot::apply_overlay(app.handle());

            // A shortcut taken by another app must not stop Velora from starting.
            if let Err(e) = shortcuts::apply(app.handle(), &initial_shortcuts) {
                log::error!("Could not register global shortcuts: {e}");
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
                    // Closing the main window quits the app, even if the panel is hidden.
                    "main" => window.app_handle().exit(0),
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::get_system_info,
            commands::list_audio_devices,
            commands::get_models,
            commands::install_model,
            commands::cancel_model_install,
            commands::benchmark_model,
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
            prep::account_sign_out,
            prep::import_resume,
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
            commands::show_copilot,
            commands::toggle_copilot,
            commands::show_main,
            copilot::live_answer,
            copilot::get_live_answers,
            copilot::list_knowledge,
            copilot::add_knowledge_note,
            copilot::import_knowledge,
            copilot::delete_knowledge,
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

use std::path::PathBuf;

use serde::Serialize;
use sysinfo::System;

use crate::error::{AppError, AppResult};

const MIB: u64 = 1024 * 1024;
/// 8 GB machines report a little under 8 GiB usable, so allow some slack.
const MINIMUM_RAM_MB: u64 = 7 * 1024;
const RECOMMENDED_RAM_MB: u64 = 15 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub app_version: String,
    pub os: String,
    pub cpu_brand: String,
    pub logical_cores: usize,
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
    pub meets_minimum_ram: bool,
    pub meets_recommended_ram: bool,
    pub recommended_model: String,
    pub models_dir: String,
    pub models_dir_exists: bool,
    pub installed_models: Vec<String>,
}

/// Matches `identifier` in tauri.conf.json, so models sit with the rest of the app data
/// and the uninstaller's "delete app data" option removes them too.
const APP_DATA_FOLDER: &str = "online.veloraweb.desktop";

/// %LOCALAPPDATA%\online.veloraweb.desktop\models on Windows.
pub fn models_dir() -> PathBuf {
    dirs::data_local_dir().unwrap_or_else(std::env::temp_dir).join(APP_DATA_FOLDER).join("models")
}

/// Versions before 0.3 kept models in %LOCALAPPDATA%\Velora\models, which is also the
/// per-user install folder. Moves them once so they never live inside the install directory.
pub fn migrate_models_dir() {
    let Some(local) = dirs::data_local_dir() else { return };
    let old = local.join("Velora").join("models");
    let new = models_dir();
    if !old.is_dir() || new.exists() {
        return;
    }
    if let Some(parent) = new.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match std::fs::rename(&old, &new) {
        Ok(()) => log::info!("Moved speech models to {}", new.display()),
        Err(e) => log::warn!("Could not move speech models from {}: {e}; they will be downloaded again", old.display()),
    }
}

pub fn recommended_model(total_memory_mb: u64) -> &'static str {
    if total_memory_mb >= MINIMUM_RAM_MB {
        "small.en-q5_1"
    } else {
        "base.en-q5_1"
    }
}

pub fn collect(app_version: &str) -> AppResult<SystemInfo> {
    let mut sys = System::new().map_err(|e| AppError::Internal(format!("Could not read system information: {e}")))?;
    sys.refresh_memory();
    sys.refresh_cpu_list(sysinfo::CpuRefreshKind::nothing());

    let total = sys.total_memory() / MIB;
    let dir = models_dir();
    let installed_models = std::fs::read_dir(&dir)
        .map(|entries| {
            let mut names: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|n| n.ends_with(".bin"))
                .collect();
            names.sort();
            names
        })
        .unwrap_or_default();

    Ok(SystemInfo {
        app_version: app_version.to_string(),
        os: System::long_os_version().unwrap_or_else(|_| "Unknown".into()),
        cpu_brand: sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
        logical_cores: sys.cpus().len(),
        total_memory_mb: total,
        available_memory_mb: sys.available_memory() / MIB,
        meets_minimum_ram: total >= MINIMUM_RAM_MB,
        meets_recommended_ram: total >= RECOMMENDED_RAM_MB,
        recommended_model: recommended_model(total).to_string(),
        models_dir_exists: dir.is_dir(),
        models_dir: dir.to_string_lossy().into_owned(),
        installed_models,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn low_memory_falls_back_to_base_model() {
        assert_eq!(recommended_model(4 * 1024), "base.en-q5_1");
        assert_eq!(recommended_model(7_900), "small.en-q5_1");
        assert_eq!(recommended_model(16 * 1024), "small.en-q5_1");
    }

    #[test]
    fn collect_reports_real_hardware() {
        let info = collect("0.0.0").unwrap();
        assert!(info.total_memory_mb > 0);
        assert!(info.logical_cores > 0);
        assert!(info.models_dir.ends_with("models"));
    }
}

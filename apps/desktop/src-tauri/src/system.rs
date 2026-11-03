use serde::Serialize;
use sysinfo::System;

use crate::error::{AppError, AppResult};

const MIB: u64 = 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub app_version: String,
    pub os: String,
    pub cpu_brand: String,
    pub logical_cores: usize,
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
}

pub fn collect(app_version: &str) -> AppResult<SystemInfo> {
    let mut sys = System::new().map_err(|e| AppError::Internal(format!("Could not read system information: {e}")))?;
    sys.refresh_memory();
    sys.refresh_cpu_list(sysinfo::CpuRefreshKind::nothing());

    Ok(SystemInfo {
        app_version: app_version.to_string(),
        os: System::long_os_version().unwrap_or_else(|_| "Unknown".into()),
        cpu_brand: sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
        logical_cores: sys.cpus().len(),
        total_memory_mb: sys.total_memory() / MIB,
        available_memory_mb: sys.available_memory() / MIB,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_reports_real_hardware() {
        let info = collect("0.0.0").unwrap();
        assert!(info.total_memory_mb > 0);
        assert!(info.logical_cores > 0);
    }
}

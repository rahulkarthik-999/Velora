//! Speech model manifest, download, verification and self-test.

use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, AtomicI32, Ordering},
    time::Instant,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::engine::{decode_wav_pcm16_mono, TranscribeOptions, WhisperModel};
use super::{SELF_TEST_EXPECT, SELF_TEST_WAV};
use crate::error::{AppError, AppResult};

const MANIFEST_JSON: &str = include_str!("../../resources/model-manifest.json");
/// Free space required beyond the model itself (temp file + headroom).
const DISK_HEADROOM: u64 = 200 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelSpec {
    pub id: String,
    pub language: String,
    pub quantization: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub url: String,
    pub artifact_version: String,
    pub min_app_version: String,
    pub runtime: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    manifest_version: u32,
    models: Vec<ModelSpec>,
}

pub fn manifest() -> Vec<ModelSpec> {
    let m: Manifest = serde_json::from_str(MANIFEST_JSON).expect("embedded model manifest is valid");
    debug_assert_eq!(m.manifest_version, 1);
    m.models
}

pub fn find(id: &str) -> AppResult<ModelSpec> {
    manifest()
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| AppError::InvalidSettings(format!("Unknown speech model '{id}'")))
}

/// Written next to a model once it has passed checksum and self-test.
#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct VerifiedMarker {
    sha256: String,
    self_test_transcript: String,
    self_test_rtf: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub spec: ModelSpec,
    pub installed: bool,
    /// Real-time factor measured by the self-test on this PC (lower is faster).
    pub self_test_rtf: Option<f32>,
}

fn model_path(dir: &Path, spec: &ModelSpec) -> PathBuf {
    dir.join(&spec.file_name)
}

fn marker_path(dir: &Path, spec: &ModelSpec) -> PathBuf {
    dir.join(format!("{}.verified.json", spec.file_name))
}

fn read_marker(dir: &Path, spec: &ModelSpec) -> Option<VerifiedMarker> {
    let raw = fs::read_to_string(marker_path(dir, spec)).ok()?;
    let marker: VerifiedMarker = serde_json::from_str(&raw).ok()?;
    let size_ok = fs::metadata(model_path(dir, spec)).map(|m| m.len() == spec.size_bytes).unwrap_or(false);
    (size_ok && marker.sha256 == spec.sha256).then_some(marker)
}

/// A model is usable only if it is present at the expected size with a matching verified marker.
pub fn installed_path(dir: &Path, spec: &ModelSpec) -> Option<PathBuf> {
    read_marker(dir, spec).map(|_| model_path(dir, spec))
}

pub fn statuses(dir: &Path) -> Vec<ModelStatus> {
    manifest()
        .into_iter()
        .map(|spec| {
            let marker = read_marker(dir, &spec);
            ModelStatus { installed: marker.is_some(), self_test_rtf: marker.map(|m| m.self_test_rtf), spec }
        })
        .collect()
}

/// Below this much free RAM, prefer the smaller fallback model.
pub const LOW_MEMORY_MB: u64 = 1_500;

/// Picks the model to load for a session. Returns the model and, when it
/// differs from the user's choice, a message explaining why.
pub fn select(installed: &[ModelSpec], preferred_id: &str, available_memory_mb: u64) -> AppResult<(ModelSpec, Option<String>)> {
    let fallback = installed.iter().find(|m| m.role == "fallback");
    match installed.iter().find(|m| m.id == preferred_id) {
        Some(preferred) if available_memory_mb < LOW_MEMORY_MB && preferred.role != "fallback" => match fallback {
            Some(f) => Ok((
                f.clone(),
                Some(format!("Only {available_memory_mb} MB of memory is free, so the lighter {} model is used.", f.id)),
            )),
            None => Ok((preferred.clone(), None)),
        },
        Some(preferred) => Ok((preferred.clone(), None)),
        None => installed
            .first()
            .map(|m| (m.clone(), Some(format!("{preferred_id} isn't downloaded, so {} is used.", m.id))))
            .ok_or_else(|| AppError::InvalidSettings("Download a speech model on the Overview page before starting.".into())),
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase", tag = "stage")]
pub enum InstallProgress {
    Downloading { received: u64, total: u64 },
    Verifying,
    SelfTest,
}

pub fn available_disk_bytes(dir: &Path) -> Option<u64> {
    let disks = sysinfo::Disks::new_with_refreshed_list().ok()?;
    let target = dir.ancestors().find(|p| p.exists())?.canonicalize().ok()?;
    disks
        .iter()
        .filter_map(|d| {
            let mount = d.mount_point().canonicalize().ok()?;
            target.starts_with(&mount).then(|| (mount.as_os_str().len(), d.available_space()))
        })
        .max_by_key(|(len, _)| *len)
        .map(|(_, space)| space)
}

/// Downloads, verifies and self-tests a model. The file only appears under its
/// final name after the checksum matches, so a failed or cancelled install
/// never leaves a usable-looking model behind.
pub fn install(
    dir: &Path,
    spec: &ModelSpec,
    cancel: &AtomicBool,
    mut progress: impl FnMut(InstallProgress),
) -> AppResult<ModelStatus> {
    fs::create_dir_all(dir)?;
    if let Some(free) = available_disk_bytes(dir) {
        if free < spec.size_bytes + DISK_HEADROOM {
            return Err(AppError::Internal(format!(
                "Not enough disk space: {} MB free, {} MB needed",
                free / 1_048_576,
                (spec.size_bytes + DISK_HEADROOM) / 1_048_576
            )));
        }
    }

    let part = dir.join(format!("{}.part", spec.file_name));
    let result = download_to(&part, spec, cancel, &mut progress).and_then(|()| {
        progress(InstallProgress::Verifying);
        verify_file(&part, spec)?;
        // Replace any older copy atomically.
        fs::rename(&part, model_path(dir, spec))?;
        Ok(())
    });
    if let Err(e) = result {
        let _ = fs::remove_file(&part);
        return Err(e);
    }

    progress(InstallProgress::SelfTest);
    match self_test(&model_path(dir, spec)) {
        Ok((transcript, rtf)) => {
            let marker = VerifiedMarker { sha256: spec.sha256.clone(), self_test_transcript: transcript, self_test_rtf: rtf };
            fs::write(marker_path(dir, spec), serde_json::to_vec_pretty(&marker)?)?;
            log::info!("Model {} installed; self-test RTF {rtf:.2}", spec.id);
            Ok(ModelStatus { spec: spec.clone(), installed: true, self_test_rtf: Some(rtf) })
        }
        Err(e) => {
            let _ = fs::remove_file(model_path(dir, spec));
            Err(e)
        }
    }
}

fn download_to(
    part: &Path,
    spec: &ModelSpec,
    cancel: &AtomicBool,
    progress: &mut impl FnMut(InstallProgress),
) -> AppResult<()> {
    if !spec.url.starts_with("https://") {
        return Err(AppError::Internal("Model URLs must use HTTPS".into()));
    }
    let response = ureq::get(&spec.url)
        .call()
        .map_err(|e| AppError::Internal(format!("Could not download {}: {e}", spec.id)))?;
    let mut reader = response.into_body().into_reader();
    let mut file = fs::File::create(part)?;
    let mut buf = vec![0u8; 256 * 1024];
    let mut received = 0u64;
    let mut last_report = Instant::now();

    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(AppError::Internal("Download cancelled".into()));
        }
        let n = reader.read(&mut buf).map_err(|e| AppError::Internal(format!("Download interrupted: {e}")))?;
        if n == 0 {
            break;
        }
        received += n as u64;
        if received > spec.size_bytes {
            return Err(AppError::Internal("Download is larger than expected; refusing it".into()));
        }
        file.write_all(&buf[..n])?;
        if last_report.elapsed().as_millis() >= 200 {
            progress(InstallProgress::Downloading { received, total: spec.size_bytes });
            last_report = Instant::now();
        }
    }
    file.sync_all()?;
    progress(InstallProgress::Downloading { received, total: spec.size_bytes });
    Ok(())
}

pub fn verify_file(path: &Path, spec: &ModelSpec) -> AppResult<()> {
    let len = fs::metadata(path)?.len();
    if len != spec.size_bytes {
        return Err(AppError::Internal(format!("Model file is {len} bytes, expected {}", spec.size_bytes)));
    }
    let mut hasher = Sha256::new();
    let mut file = fs::File::open(path)?;
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual = hex::encode(hasher.finalize());
    if actual != spec.sha256 {
        return Err(AppError::Internal(format!("Checksum mismatch for {}: the download is corrupt", spec.id)));
    }
    Ok(())
}

/// Loads the model and transcribes a known sample. Returns (transcript, real-time factor).
pub fn self_test(path: &Path) -> AppResult<(String, f32)> {
    let (_, samples) = decode_wav_pcm16_mono(SELF_TEST_WAV).expect("bundled self-test sample is valid");
    let mut model = WhisperModel::load(path)?;
    let start = Instant::now();
    let segments = model.transcribe(&samples, &TranscribeOptions::default(), &AtomicI32::new(0))?;
    let elapsed = start.elapsed().as_secs_f32();
    let transcript = segments.iter().map(|s| s.text.as_str()).collect::<Vec<_>>().join(" ");
    let lower = transcript.to_lowercase();
    if !SELF_TEST_EXPECT.iter().all(|w| lower.contains(w)) {
        return Err(AppError::Internal(format!("Model self-test failed; transcript was: {transcript:?}")));
    }
    let rtf = elapsed / (samples.len() as f32 / 16_000.0);
    Ok((transcript, rtf))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec_for(bytes: &[u8]) -> ModelSpec {
        ModelSpec {
            id: "test".into(),
            language: "en".into(),
            quantization: "q5_1".into(),
            file_name: "test.bin".into(),
            size_bytes: bytes.len() as u64,
            sha256: hex::encode(Sha256::digest(bytes)),
            url: "https://example.invalid/test.bin".into(),
            artifact_version: "t".into(),
            min_app_version: "0.1.0".into(),
            runtime: "cpu".into(),
            role: "default".into(),
        }
    }

    fn named(id: &str, role: &str) -> ModelSpec {
        ModelSpec { id: id.into(), role: role.into(), ..spec_for(b"x") }
    }

    #[test]
    fn select_prefers_users_choice() {
        let installed = [named("small", "default"), named("base", "fallback")];
        let (m, note) = select(&installed, "small", 8_000).unwrap();
        assert_eq!(m.id, "small");
        assert!(note.is_none());
    }

    #[test]
    fn select_falls_back_under_memory_pressure() {
        let installed = [named("small", "default"), named("base", "fallback")];
        let (m, note) = select(&installed, "small", 900).unwrap();
        assert_eq!(m.id, "base");
        assert!(note.unwrap().contains("900 MB"));
    }

    #[test]
    fn select_uses_any_installed_model_when_choice_missing() {
        let (m, note) = select(&[named("base", "fallback")], "small", 8_000).unwrap();
        assert_eq!(m.id, "base");
        assert!(note.is_some());
    }

    #[test]
    fn select_errors_when_nothing_installed() {
        assert!(select(&[], "small", 8_000).is_err());
    }

    #[test]
    fn manifest_is_pinned_and_https() {
        let models = manifest();
        assert!(models.iter().any(|m| m.role == "default"));
        assert!(models.iter().any(|m| m.role == "fallback"));
        for m in models {
            assert!(m.url.starts_with("https://"));
            assert!(!m.url.contains("/main/"), "{} uses a moving URL", m.id);
            assert_eq!(m.sha256.len(), 64);
            assert_eq!(m.language, "en");
        }
    }

    #[test]
    fn verify_accepts_matching_file_and_rejects_corruption() {
        let dir = tempfile::tempdir().unwrap();
        let data = b"model bytes";
        let spec = spec_for(data);
        let path = dir.path().join("m.bin");
        fs::write(&path, data).unwrap();
        verify_file(&path, &spec).unwrap();

        fs::write(&path, b"model bytez").unwrap();
        assert!(verify_file(&path, &spec).is_err());
        fs::write(&path, b"short").unwrap();
        assert!(verify_file(&path, &spec).is_err());
    }

    #[test]
    fn model_without_verified_marker_is_not_installed() {
        let dir = tempfile::tempdir().unwrap();
        let data = b"abc";
        let spec = spec_for(data);
        fs::write(dir.path().join(&spec.file_name), data).unwrap();
        assert!(installed_path(dir.path(), &spec).is_none());

        let marker = VerifiedMarker { sha256: spec.sha256.clone(), self_test_transcript: String::new(), self_test_rtf: 0.5 };
        fs::write(marker_path(dir.path(), &spec), serde_json::to_vec(&marker).unwrap()).unwrap();
        assert!(installed_path(dir.path(), &spec).is_some());

        // A file of the wrong size invalidates it.
        fs::write(dir.path().join(&spec.file_name), b"abcd").unwrap();
        assert!(installed_path(dir.path(), &spec).is_none());
    }

    #[test]
    fn non_https_url_is_refused_and_leaves_nothing_behind() {
        let dir = tempfile::tempdir().unwrap();
        let mut spec = spec_for(b"x");
        spec.url = "http://example.invalid/x.bin".into();
        assert!(install(dir.path(), &spec, &AtomicBool::new(false), |_| {}).is_err());
        assert!(fs::read_dir(dir.path()).unwrap().next().is_none());
    }

    /// Runs the real model end to end. Needs a downloaded model:
    /// VELORA_TEST_MODEL=path\to\ggml-base.en-q5_1.bin cargo test -- --ignored
    #[test]
    #[ignore]
    fn real_model_self_test() {
        let path = std::env::var("VELORA_TEST_MODEL").expect("set VELORA_TEST_MODEL");
        let spec = manifest().into_iter().find(|m| path.ends_with(&m.file_name)).expect("model in manifest");
        verify_file(Path::new(&path), &spec).unwrap();
        let (transcript, rtf) = self_test(Path::new(&path)).unwrap();
        println!("self-test transcript: {transcript}\nRTF: {rtf:.3}");
        assert!(rtf < 1.0, "slower than real time: {rtf}");
    }
}

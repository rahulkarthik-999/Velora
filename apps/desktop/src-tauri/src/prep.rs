//! Interview preparation: account connection, resume/profile, jobs and practice.
//! AI calls go through the Velora web API; the OpenAI key never reaches this app.

use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    api::{self, Api, ApiError},
    commands, documents,
    error::{AppError, AppResult},
    session::{SessionMode, SessionStatus},
    storage::{CandidateFact, Job, NewQuestion, PracticeItem, PracticeSessionSummary, ResumeRecord},
    AppState,
};

pub const ACCOUNT_CHANGED: &str = "account-changed";
/// Facts sent with each feedback request (the most relevant ones, not the whole resume).
const FACTS_PER_QUESTION: i64 = 4;

fn api(state: &AppState) -> Api {
    Api::new(&state.settings.get().api_base_url)
}

fn require_token() -> AppResult<String> {
    api::load_token()?.ok_or_else(|| AppError::Internal("Connect your Velora account on the Account page first.".into()))
}

/// Maps a 401 to "signed out" and clears the dead token.
fn signed_out_on_401<T>(app: &AppHandle, r: Result<T, ApiError>) -> AppResult<T> {
    if let Err(ApiError::Unauthorized) = &r {
        let _ = api::clear_token();
        let _ = app.emit(ACCOUNT_CHANGED, json!({ "status": "signedOut" }));
    }
    r.map_err(AppError::from)
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| AppError::Internal(e.to_string()))?
}

/// The API wraps AI output as { result, creditsRemaining, ... }.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiResponse<T> {
    result: T,
    credits_remaining: Option<i64>,
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn account_status(app: AppHandle) -> AppResult<Value> {
    blocking(move || {
        let Some(token) = api::load_token()? else { return Ok(json!({ "signedIn": false })) };
        let state = app.state::<AppState>();
        match api(&state).get::<Value>("/api/desktop/me", &token) {
            Ok(mut me) => {
                me["signedIn"] = json!(true);
                Ok(me)
            }
            Err(ApiError::Unauthorized) => {
                api::clear_token()?;
                Ok(json!({ "signedIn": false }))
            }
            Err(e) => Err(e.into()),
        }
    })
    .await
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkStart {
    #[serde(skip_serializing)]
    device_code: String,
    user_code: String,
    verification_url: String,
    interval: u64,
    expires_in: u64,
}

fn device_name() -> String {
    let host = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "this PC".into());
    format!("Velora on {host}")
}

/// Starts the device sign-in: opens the browser and waits for approval in the background.
#[tauri::command]
pub async fn account_start_link(app: AppHandle) -> AppResult<LinkStart> {
    let start: LinkStart = {
        let app = app.clone();
        blocking(move || {
            let state = app.state::<AppState>();
            api(&state).post("/api/desktop/auth/start", None, &json!({ "deviceName": device_name() })).map_err(AppError::from)
        })
        .await?
    };

    if !start.verification_url.starts_with("https://") && !start.verification_url.starts_with("http://localhost") {
        return Err(AppError::Internal("The server returned an unsafe sign-in link.".into()));
    }
    let cancel = Arc::new(AtomicBool::new(false));
    if let Some(previous) = app.state::<AppState>().linking.lock().expect("lock").replace(cancel.clone()) {
        previous.store(true, Ordering::Relaxed);
    }
    if let Err(e) = tauri_plugin_opener::open_url(&start.verification_url, None::<&str>) {
        log::warn!("Could not open the browser: {e}");
    }

    let poll = start.clone();
    std::thread::spawn(move || poll_link(app, poll, cancel));
    Ok(start)
}

fn poll_link(app: AppHandle, start: LinkStart, cancel: Arc<AtomicBool>) {
    #[derive(Deserialize)]
    struct Poll {
        status: String,
        token: Option<String>,
    }
    let deadline = Instant::now() + Duration::from_secs(start.expires_in);
    let interval = Duration::from_secs(start.interval.clamp(2, 10));
    let finish = |status: &str| {
        let _ = app.emit(ACCOUNT_CHANGED, json!({ "status": status }));
    };

    while Instant::now() < deadline {
        std::thread::sleep(interval);
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        let state = app.state::<AppState>();
        match api(&state).post::<_, Poll>("/api/desktop/auth/poll", None, &json!({ "deviceCode": start.device_code })) {
            Ok(Poll { status, token: Some(token) }) if status == "approved" => {
                match api::save_token(&token) {
                    Ok(()) => finish("signedIn"),
                    Err(e) => {
                        log::error!("{e}");
                        finish("failed");
                    }
                }
                return;
            }
            Ok(Poll { status, .. }) if status == "denied" => return finish("denied"),
            Ok(_) => {}
            Err(ApiError::Status(410, _)) => return finish("expired"),
            // Network blips: keep polling until the code expires.
            Err(e) => log::warn!("Sign-in poll failed: {e:?}"),
        }
    }
    finish("expired");
}

#[tauri::command]
pub fn account_cancel_link(state: State<'_, AppState>) {
    if let Some(c) = state.linking.lock().expect("lock").take() {
        c.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub async fn account_sign_out(app: AppHandle) -> AppResult<()> {
    blocking(move || {
        if let Some(token) = api::load_token()? {
            let state = app.state::<AppState>();
            // Revoke on the server too; sign out locally even if that fails.
            if let Err(e) = api(&state).post::<_, Value>("/api/desktop/auth/logout", Some(&token), &json!({})) {
                log::warn!("Server sign-out failed: {e:?}");
            }
        }
        api::clear_token()?;
        let _ = app.emit(ACCOUNT_CHANGED, json!({ "status": "signedOut" }));
        Ok(())
    })
    .await
}

// ---------------------------------------------------------------------------
// Resume and profile
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeInfo {
    #[serde(flatten)]
    record: ResumeRecord,
    preview: String,
}

#[tauri::command]
pub async fn import_resume(app: AppHandle, path: String) -> AppResult<ResumeInfo> {
    blocking(move || {
        let path = PathBuf::from(path);
        let text = documents::extract_text(&path)?;
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "resume".into());
        let record = app.state::<AppState>().db.insert_resume(&name, &text)?;
        log::info!("Imported resume {name} ({} chars)", record.chars);
        Ok(ResumeInfo { record, preview: text.chars().take(800).collect() })
    })
    .await
}

#[tauri::command]
pub fn get_resume(state: State<'_, AppState>) -> AppResult<Option<ResumeInfo>> {
    Ok(state.db.latest_resume()?.map(|(record, text)| ResumeInfo { record, preview: text.chars().take(800).collect() }))
}

/// Reads a job description from a file, for pasting into a job.
#[tauri::command]
pub async fn read_document(path: String) -> AppResult<String> {
    blocking(move || documents::extract_text(&PathBuf::from(path))).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    profile: Option<Value>,
    facts: Vec<CandidateFact>,
}

#[tauri::command]
pub fn get_profile(state: State<'_, AppState>) -> AppResult<ProfileView> {
    Ok(ProfileView { profile: state.db.profile()?, facts: state.db.facts()? })
}

/// One retrievable fact per experience highlight, project, skill group and qualification.
pub fn facts_from_profile(p: &Value) -> Vec<(String, String)> {
    let s = |v: &Value| v.as_str().unwrap_or("").trim().to_string();
    let arr = |v: &Value| v.as_array().cloned().unwrap_or_default();
    let mut facts = Vec::new();

    for e in arr(&p["experiences"]) {
        let mut role = s(&e["title"]);
        if !s(&e["company"]).is_empty() {
            role = format!("{role} at {}", s(&e["company"]));
        }
        if !s(&e["period"]).is_empty() {
            role = format!("{role} ({})", s(&e["period"]));
        }
        let highlights = arr(&e["highlights"]);
        if highlights.is_empty() {
            facts.push(("experience".into(), role.clone()));
        }
        for h in highlights {
            facts.push(("experience".into(), format!("{role}: {}", s(&h))));
        }
    }
    for pr in arr(&p["projects"]) {
        let tech: Vec<String> = arr(&pr["technologies"]).iter().map(s).filter(|t| !t.is_empty()).collect();
        let tech = if tech.is_empty() { String::new() } else { format!(" ({})", tech.join(", ")) };
        facts.push(("project".into(), format!("Project {}{tech}: {}", s(&pr["name"]), s(&pr["description"]))));
    }
    let skills: Vec<String> = arr(&p["skills"]).iter().map(s).filter(|t| !t.is_empty()).collect();
    for chunk in skills.chunks(10) {
        facts.push(("skill".into(), format!("Skills: {}", chunk.join(", "))));
    }
    for ed in arr(&p["education"]) {
        let period = if s(&ed["period"]).is_empty() { String::new() } else { format!(" ({})", s(&ed["period"])) };
        facts.push(("education".into(), format!("{}, {}{period}", s(&ed["qualification"]), s(&ed["institution"]))));
    }
    facts.retain(|(_, t)| t.chars().filter(|c| c.is_alphanumeric()).count() >= 3);
    for (_, t) in facts.iter_mut() {
        *t = t.chars().take(600).collect();
    }
    facts
}

/// Sends the latest resume to the AI to build a structured profile, stored locally.
#[tauri::command]
pub async fn extract_profile(app: AppHandle) -> AppResult<ProfileView> {
    blocking(move || {
        let state = app.state::<AppState>();
        let (resume, text) = state.db.latest_resume()?.ok_or_else(|| AppError::Internal("Import your resume first.".into()))?;
        let token = require_token()?;
        let resp: AiResponse<Value> =
            signed_out_on_401(&app, api(&state).post("/api/practice/profile", Some(&token), &json!({ "resumeText": text })))?;
        let facts = facts_from_profile(&resp.result);
        state.db.save_profile(Some(&resume.id), &resp.result, &facts)?;
        log::info!("Profile extracted: {} facts", facts.len());
        Ok(ProfileView { profile: Some(resp.result), facts: state.db.facts()? })
    })
    .await
}

#[tauri::command]
pub fn save_fact(state: State<'_, AppState>, id: Option<String>, kind: String, text: String) -> AppResult<CandidateFact> {
    state.db.save_fact(id.as_deref(), &kind, &text)
}

#[tauri::command]
pub fn delete_fact(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_fact(&id)
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_jobs(state: State<'_, AppState>) -> AppResult<Vec<Job>> {
    state.db.jobs()
}

#[tauri::command]
pub fn save_job(
    state: State<'_, AppState>,
    id: Option<String>,
    title: String,
    company: String,
    description: String,
) -> AppResult<Job> {
    state.db.save_job(id.as_deref(), &title, &company, &description)
}

#[tauri::command]
pub fn delete_job(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_job(&id)
}

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

/// A short summary of the candidate's background for question generation.
fn candidate_summary(profile: &Option<Value>) -> Option<String> {
    let p = profile.as_ref()?;
    let s = |v: &Value| v.as_str().unwrap_or("").to_string();
    let mut parts = vec![s(&p["headline"])];
    let roles: Vec<String> = p["experiences"]
        .as_array()
        .map(|a| a.iter().map(|e| format!("{} at {}", s(&e["title"]), s(&e["company"]))).collect())
        .unwrap_or_default();
    if !roles.is_empty() {
        parts.push(format!("Roles: {}", roles.join("; ")));
    }
    let skills: Vec<String> = p["skills"].as_array().map(|a| a.iter().take(20).map(s).collect()).unwrap_or_default();
    if !skills.is_empty() {
        parts.push(format!("Skills: {}", skills.join(", ")));
    }
    let text = parts.into_iter().filter(|x| !x.trim().is_empty()).collect::<Vec<_>>().join("\n");
    (!text.is_empty()).then(|| text.chars().take(4_000).collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeView {
    session_id: String,
    items: Vec<PracticeItem>,
    credits_remaining: Option<i64>,
}

#[tauri::command]
pub async fn create_practice(
    app: AppHandle,
    job_id: String,
    focus: String,
    difficulty: String,
    count: u8,
) -> AppResult<PracticeView> {
    blocking(move || {
        let state = app.state::<AppState>();
        let job = state.db.job(&job_id)?.ok_or_else(|| AppError::Internal("Choose a job to practise for.".into()))?;
        let settings = state.settings.get();
        let token = require_token()?;

        #[derive(Deserialize)]
        struct Q {
            text: String,
            category: String,
            focus: String,
        }
        #[derive(Deserialize)]
        struct Questions {
            questions: Vec<Q>,
        }
        let body = json!({
            "jobTitle": job.title,
            "company": (!job.company.is_empty()).then_some(&job.company),
            "jobDescription": (!job.description.is_empty()).then_some(&job.description),
            "candidateSummary": candidate_summary(&state.db.profile()?),
            "focus": focus,
            "difficulty": difficulty,
            "count": count.clamp(1, 10),
            "customInstructions": (!settings.custom_instructions.trim().is_empty()).then_some(&settings.custom_instructions),
        });
        let resp: AiResponse<Questions> = signed_out_on_401(&app, api(&state).post("/api/practice/questions", Some(&token), &body))?;

        let questions: Vec<NewQuestion> = resp
            .result
            .questions
            .into_iter()
            .map(|q| NewQuestion { text: q.text, category: q.category, focus: q.focus })
            .collect();
        let title = if job.company.is_empty() { job.title.clone() } else { format!("{} at {}", job.title, job.company) };
        let session_id = state.db.create_practice(Some(&job.id), &title, &focus, &difficulty, &questions)?;
        Ok(PracticeView { items: state.db.practice_items(&session_id)?, session_id, credits_remaining: resp.credits_remaining })
    })
    .await
}

#[tauri::command]
pub fn list_practice(state: State<'_, AppState>) -> AppResult<Vec<PracticeSessionSummary>> {
    state.db.practice_sessions()
}

#[tauri::command]
pub fn get_practice(state: State<'_, AppState>, session_id: String) -> AppResult<Vec<PracticeItem>> {
    state.db.practice_items(&session_id)
}

#[tauri::command]
pub fn delete_practice(state: State<'_, AppState>, session_id: String) -> AppResult<()> {
    state.db.delete_practice(&session_id)
}

#[tauri::command]
pub fn save_practice_answer(state: State<'_, AppState>, item_id: String, answer: String) -> AppResult<PracticeItem> {
    state.db.set_practice_answer(&item_id, &answer, None)
}

/// Starts recording an answer from the microphone.
#[tauri::command]
pub async fn practice_record_start(app: AppHandle, item_id: String) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<AppState>();
        state.db.practice_item(&item_id)?;
        {
            let session = state.session.lock().expect("session lock poisoned");
            if matches!(session.status(), SessionStatus::Active | SessionStatus::Paused) {
                return Err(AppError::Internal("End the current session before recording an answer.".into()));
            }
        }
        *state.recording_item.lock().expect("lock") = Some(item_id);
        if let Err(e) = commands::session_start(&app, SessionMode::Practice) {
            *state.recording_item.lock().expect("lock") = None;
            return Err(e);
        }
        Ok(())
    })
    .await
}

/// Stops recording and saves what was transcribed as the answer.
#[tauri::command]
pub async fn practice_record_stop(app: AppHandle) -> AppResult<PracticeItem> {
    blocking(move || {
        let state = app.state::<AppState>();
        let item_id = state
            .recording_item
            .lock()
            .expect("lock")
            .take()
            .ok_or_else(|| AppError::Internal("Not recording an answer.".into()))?;
        // Ends capture and waits for the last words to be transcribed.
        let snapshot = commands::session_end(&app, false)?;
        let recording_id = snapshot.id.unwrap_or_default();
        let text = state
            .db
            .segments(&recording_id)?
            .into_iter()
            .filter(|s| s.source == "microphone")
            .map(|s| s.text)
            .collect::<Vec<_>>()
            .join(" ");
        state.db.set_practice_answer(&item_id, &text, Some(&recording_id))
    })
    .await
}

#[tauri::command]
pub async fn practice_feedback(app: AppHandle, item_id: String) -> AppResult<PracticeItem> {
    blocking(move || {
        let state = app.state::<AppState>();
        let item = state.db.practice_item(&item_id)?;
        let answer = item.answer.clone().filter(|a| !a.trim().is_empty()).ok_or_else(|| {
            AppError::InvalidSettings("Record or type an answer first.".into())
        })?;
        let settings = state.settings.get();
        let token = require_token()?;
        let facts: Vec<String> =
            state.db.search_facts(&item.question, FACTS_PER_QUESTION)?.into_iter().map(|f| f.text).collect();
        let job_title = state
            .db
            .practice_sessions()?
            .into_iter()
            .find(|s| s.id == item.session_id)
            .map(|s| s.title);
        let style = match settings.answer_style {
            crate::settings::AnswerStyle::Concise => "concise",
            crate::settings::AnswerStyle::Detailed => "detailed",
            crate::settings::AnswerStyle::Star => "star",
        };
        let body = json!({
            "question": item.question,
            "category": item.category,
            "answer": answer,
            "jobTitle": job_title,
            "candidateFacts": facts,
            "answerStyle": style,
            "customInstructions": (!settings.custom_instructions.trim().is_empty()).then_some(&settings.custom_instructions),
        });
        let resp: AiResponse<Value> = signed_out_on_401(&app, api(&state).post("/api/practice/feedback", Some(&token), &body))?;
        let score = resp.result["score"].as_f64().unwrap_or(0.0);
        state.db.set_practice_feedback(&item_id, &resp.result, score)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_becomes_granular_facts() {
        let p = json!({
            "headline": "Backend engineer",
            "skills": ["Rust", "Go", "Postgres"],
            "experiences": [
                {"title": "Backend Engineer", "company": "Acme", "period": "2021-2024",
                 "highlights": ["Migrated billing to Postgres", "Mentored 3 juniors"]},
                {"title": "Intern", "company": "Beta", "period": "", "highlights": []}
            ],
            "projects": [{"name": "Velora", "description": "Interview prep app", "technologies": ["Rust", "React"]}],
            "education": [{"qualification": "B.Tech CSE", "institution": "VIT", "period": "2017-2021"}]
        });
        let facts = facts_from_profile(&p);
        let texts: Vec<&str> = facts.iter().map(|(_, t)| t.as_str()).collect();
        assert!(texts.contains(&"Backend Engineer at Acme (2021-2024): Migrated billing to Postgres"));
        assert!(texts.contains(&"Backend Engineer at Acme (2021-2024): Mentored 3 juniors"));
        assert!(texts.contains(&"Intern at Beta"));
        assert!(texts.contains(&"Project Velora (Rust, React): Interview prep app"));
        assert!(texts.contains(&"Skills: Rust, Go, Postgres"));
        assert!(texts.contains(&"B.Tech CSE, VIT (2017-2021)"));
    }

    #[test]
    fn empty_or_malformed_profile_yields_no_facts() {
        assert!(facts_from_profile(&json!({})).is_empty());
        assert!(facts_from_profile(&json!({"skills": "not a list"})).is_empty());
    }

    #[test]
    fn summary_includes_headline_roles_and_skills() {
        let p = Some(json!({"headline": "Engineer", "skills": ["Rust"], "experiences": [{"title": "Dev", "company": "Acme"}]}));
        assert_eq!(candidate_summary(&p).unwrap(), "Engineer\nRoles: Dev at Acme\nSkills: Rust");
        assert!(candidate_summary(&None).is_none());
    }
}

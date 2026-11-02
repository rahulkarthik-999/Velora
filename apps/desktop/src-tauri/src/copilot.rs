//! Live interview copilot: answers grounded in the knowledge base, the
//! knowledge base itself, and the overlay window's behaviour.

use std::{collections::HashSet, path::PathBuf, sync::atomic::Ordering};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    api::{self, Api, ApiError},
    commands::{self, APP_NOTICE, SETTINGS_CHANGED},
    documents,
    error::{AppError, AppResult},
    session::{SessionMode, SessionStatus},
    settings::AnswerStyle,
    storage::{KnowledgeDoc, SavedAnswer, TranscriptSegment},
    AppState,
};

pub const COPILOT_ANSWER: &str = "copilot-answer";
const FACTS_PER_ANSWER: i64 = 4;
const CHUNKS_PER_ANSWER: i64 = 5;
const MAX_QUESTION_CHARS: usize = 1_500;
const MAX_CONVERSATION_CHARS: usize = 4_000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "status")]
pub enum AnswerEvent {
    Pending { request_id: String, question: String },
    Done { request_id: String, answer: SavedAnswer, credits_remaining: Option<i64> },
    Failed { request_id: String, message: String },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiResponse {
    result: Value,
    credits_remaining: Option<i64>,
}

fn speaker(s: &TranscriptSegment) -> &'static str {
    if s.source == "systemAudio" {
        "Interviewer"
    } else {
        "Candidate"
    }
}

/// Keeps the end of `text` within `max` characters, cutting at a word.
fn tail(text: &str, max: usize) -> String {
    let n = text.chars().count();
    if n <= max {
        return text.to_string();
    }
    let cut: String = text.chars().skip(n - max).collect();
    cut.split_once(' ').map(|(_, rest)| rest.to_string()).unwrap_or(cut)
}

/// The interviewer's words since the last answer, and the conversation before them.
pub fn question_from_transcript(segments: &[TranscriptSegment], answered_until_ms: i64) -> Option<(String, String, i64)> {
    let fresh: Vec<&TranscriptSegment> =
        segments.iter().filter(|s| s.source == "systemAudio" && s.end_ms > answered_until_ms).collect();
    let fresh = if fresh.is_empty() {
        // Nothing new: answer the interviewer's last words again (e.g. "regenerate").
        segments.iter().rev().filter(|s| s.source == "systemAudio").take(2).collect::<Vec<_>>().into_iter().rev().collect()
    } else {
        fresh
    };
    let first = fresh.first()?;
    let until = fresh.iter().map(|s| s.end_ms).max().unwrap_or(answered_until_ms);
    let question = tail(&fresh.iter().map(|s| s.text.trim()).collect::<Vec<_>>().join(" "), MAX_QUESTION_CHARS);
    let before: Vec<String> = segments
        .iter()
        .filter(|s| s.start_ms < first.start_ms)
        .map(|s| format!("{}: {}", speaker(s), s.text.trim()))
        .collect();
    Some((question, tail(&before.join("\n"), MAX_CONVERSATION_CHARS), until))
}

/// Resume facts plus knowledge base passages relevant to the question, without duplicates.
fn knowledge_for(state: &AppState, question: &str) -> AppResult<Vec<String>> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let facts = state.db.search_facts(question, FACTS_PER_ANSWER)?.into_iter().map(|f| f.text);
    let chunks = state.db.search_knowledge(question, CHUNKS_PER_ANSWER)?;
    for k in facts.chain(chunks) {
        let k: String = k.chars().take(1_200).collect();
        if seen.insert(k.clone()) {
            out.push(k);
        }
    }
    out.truncate(10);
    Ok(out)
}

fn live_session(state: &AppState) -> Option<String> {
    // An ended session still counts, so its last question can be answered or regenerated.
    let session = state.session.lock().expect("session lock poisoned");
    if session.mode() != Some(SessionMode::Live) || session.status() == SessionStatus::Idle {
        return None;
    }
    session.id().map(str::to_string)
}

/// Generates an answer. With no question, uses what the interviewer said since the last answer.
pub fn answer(app: &AppHandle, question: Option<String>) -> AppResult<SavedAnswer> {
    let state = app.state::<AppState>();
    if state.answering.swap(true, Ordering::AcqRel) {
        return Err(AppError::Internal("Already writing an answer.".into()));
    }
    let result = answer_inner(app, &state, question);
    state.answering.store(false, Ordering::Release);
    result
}

fn answer_inner(app: &AppHandle, state: &AppState, question: Option<String>) -> AppResult<SavedAnswer> {
    let settings = state.settings.get();
    let session_id = live_session(state);
    let segments = match &session_id {
        Some(id) => state.db.segments(id)?,
        None => Vec::new(),
    };

    let (question, conversation, heard_until) = match question.map(|q| q.trim().to_string()).filter(|q| !q.is_empty()) {
        Some(q) => {
            let convo = segments.iter().map(|s| format!("{}: {}", speaker(s), s.text.trim())).collect::<Vec<_>>().join("\n");
            (q.chars().take(MAX_QUESTION_CHARS).collect(), tail(&convo, MAX_CONVERSATION_CHARS), None)
        }
        None => {
            let answered = *state.answered_until_ms.lock().expect("lock");
            let (q, c, until) = question_from_transcript(&segments, answered).ok_or_else(|| {
                AppError::InvalidSettings("No question heard yet. Wait for the interviewer, or type a question.".into())
            })?;
            (q, c, Some(until))
        }
    };

    let token = api::load_token()?
        .ok_or_else(|| AppError::InvalidSettings("Connect your Velora account on the Account page to get answers.".into()))?;
    let request_id = uuid::Uuid::new_v4().to_string();
    let _ = app.emit(COPILOT_ANSWER, AnswerEvent::Pending { request_id: request_id.clone(), question: question.clone() });

    let job = settings.copilot.job_id.as_deref().map(|id| state.db.job(id)).transpose()?.flatten();
    let style = match settings.answer_style {
        AnswerStyle::Concise => "concise",
        AnswerStyle::Detailed => "detailed",
        AnswerStyle::Star => "star",
    };
    let body = json!({
        "question": question,
        "conversation": (!conversation.is_empty()).then_some(&conversation),
        "jobTitle": job.as_ref().map(|j| &j.title),
        "company": job.as_ref().map(|j| &j.company).filter(|c| !c.is_empty()),
        "jobDescription": job.as_ref().map(|j| j.description.chars().take(6_000).collect::<String>()).filter(|d| !d.is_empty()),
        "knowledge": knowledge_for(state, &question)?,
        "answerStyle": style,
        "customInstructions": (!settings.custom_instructions.trim().is_empty()).then_some(&settings.custom_instructions),
    });

    let api = Api::new(&settings.api_base_url);
    let resp: Result<AiResponse, ApiError> = api.post("/api/live/answer", Some(&token), &body);
    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            if let ApiError::Unauthorized = e {
                let _ = api::clear_token();
                let _ = app.emit(crate::prep::ACCOUNT_CHANGED, json!({ "status": "signedOut" }));
            }
            let err = AppError::from(e);
            let _ = app.emit(COPILOT_ANSWER, AnswerEvent::Failed { request_id, message: err.to_string() });
            return Err(err);
        }
    };

    if let Some(until) = heard_until {
        let mut answered = state.answered_until_ms.lock().expect("lock");
        *answered = (*answered).max(until);
    }
    let saved = state.db.save_live_answer(session_id.as_deref(), &question, &resp.result)?;
    let _ = app.emit(
        COPILOT_ANSWER,
        AnswerEvent::Done { request_id, answer: saved.clone(), credits_remaining: resp.credits_remaining },
    );
    Ok(saved)
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| AppError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn live_answer(app: AppHandle, question: Option<String>) -> AppResult<SavedAnswer> {
    blocking(move || answer(&app, question)).await
}

#[tauri::command]
pub fn get_live_answers(state: State<'_, AppState>, session_id: String) -> AppResult<Vec<SavedAnswer>> {
    state.db.live_answers(&session_id)
}

/// Forgets which questions were answered, e.g. when a new session starts.
pub fn reset_answered(state: &AppState) {
    *state.answered_until_ms.lock().expect("lock") = -1;
}

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_knowledge(state: State<'_, AppState>) -> AppResult<Vec<KnowledgeDoc>> {
    state.db.knowledge_docs()
}

#[tauri::command]
pub fn add_knowledge_note(state: State<'_, AppState>, title: String, text: String) -> AppResult<KnowledgeDoc> {
    state.db.add_knowledge(&title, "note", &text)
}

#[tauri::command]
pub async fn import_knowledge(app: AppHandle, path: String) -> AppResult<KnowledgeDoc> {
    blocking(move || {
        let path = PathBuf::from(path);
        let text = documents::extract_text(&path)?;
        let title = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Document".into());
        let doc = app.state::<AppState>().db.add_knowledge(&title, "file", &text)?;
        log::info!("Added {title} to the knowledge base ({} chunks)", doc.chunks);
        Ok(doc)
    })
    .await
}

#[tauri::command]
pub fn delete_knowledge(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_knowledge(&id)
}

// ---------------------------------------------------------------------------
// Overlay window
// ---------------------------------------------------------------------------

/// Applies the copilot window settings that live in the native window.
pub fn apply_overlay(app: &AppHandle) {
    let settings = app.state::<AppState>().settings.get().copilot;
    if let Some(w) = app.get_webview_window("copilot") {
        if let Err(e) = w.set_always_on_top(settings.always_on_top) {
            log::warn!("Could not set always-on-top: {e}");
        }
        if let Err(e) = w.set_ignore_cursor_events(settings.click_through) {
            log::warn!("Could not set click-through: {e}");
        }
    }
}

/// Flips one copilot switch from a shortcut, saves it and tells the user.
pub fn toggle(app: &AppHandle, which: Toggle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let mut s = state.settings.get();
    let (on, label) = match which {
        Toggle::AutoAnswer => {
            s.copilot.auto_answer = !s.copilot.auto_answer;
            (s.copilot.auto_answer, "Auto-answer")
        }
        Toggle::ClickThrough => {
            s.copilot.click_through = !s.copilot.click_through;
            (s.copilot.click_through, "Click-through")
        }
    };
    let saved = state.settings.save(s)?;
    apply_overlay(app);
    let _ = app.emit(SETTINGS_CHANGED, &saved);
    let _ = app.emit(APP_NOTICE, format!("{label} {}", if on { "on" } else { "off" }));
    Ok(())
}

#[derive(Clone, Copy)]
pub enum Toggle {
    AutoAnswer,
    ClickThrough,
}

/// Shows the copilot (if hidden) and answers; errors appear as a notice.
pub fn answer_from_shortcut(app: &AppHandle) {
    let _ = commands::show_copilot(app.clone());
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = answer(&app, None) {
            let _ = app.emit(APP_NOTICE, e.to_string());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(source: &str, start: i64, end: i64, text: &str) -> TranscriptSegment {
        TranscriptSegment {
            id: format!("{start}"),
            session_id: "s".into(),
            source: source.into(),
            start_ms: start,
            end_ms: end,
            text: text.into(),
            confidence: None,
            corrected: false,
        }
    }

    #[test]
    fn takes_interviewer_words_since_last_answer() {
        let segs = vec![
            seg("systemAudio", 0, 1_000, "Hi, thanks for joining."),
            seg("microphone", 1_200, 2_000, "Happy to be here."),
            seg("systemAudio", 3_000, 4_000, "So tell me about a project"),
            seg("systemAudio", 4_100, 5_000, "you're proud of."),
        ];
        let (q, convo, until) = question_from_transcript(&segs, 1_000).unwrap();
        assert_eq!(q, "So tell me about a project you're proud of.");
        assert_eq!(convo, "Interviewer: Hi, thanks for joining.\nCandidate: Happy to be here.");
        assert_eq!(until, 5_000);
    }

    #[test]
    fn repeats_last_question_when_nothing_new() {
        let segs = vec![seg("systemAudio", 0, 1_000, "What is Rust?")];
        let (q, _, _) = question_from_transcript(&segs, 5_000).unwrap();
        assert_eq!(q, "What is Rust?");
        assert!(question_from_transcript(&[], -1).is_none());
    }

    #[test]
    fn tail_keeps_the_end_at_a_word_boundary() {
        assert_eq!(tail("one two three four", 9), "four");
        assert_eq!(tail("short", 10), "short");
    }
}

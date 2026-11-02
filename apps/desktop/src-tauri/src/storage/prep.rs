//! Interview-preparation data: resumes, candidate facts, jobs, practice.

use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::{db_err, Db};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResumeRecord {
    pub id: String,
    pub file_name: String,
    pub chars: i64,
    pub imported_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidateFact {
    pub id: String,
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub title: String,
    pub company: String,
    pub description: String,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PracticeSessionSummary {
    pub id: String,
    pub job_id: Option<String>,
    pub title: String,
    pub focus: String,
    pub difficulty: String,
    pub created_at_ms: i64,
    pub item_count: i64,
    pub answered_count: i64,
    pub average_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PracticeItem {
    pub id: String,
    pub session_id: String,
    pub position: i64,
    pub question: String,
    pub category: String,
    pub focus: String,
    pub answer: Option<String>,
    pub feedback: Option<serde_json::Value>,
    pub score: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct NewQuestion {
    pub text: String,
    pub category: String,
    pub focus: String,
}

pub const FACT_KINDS: &[&str] = &["skill", "experience", "project", "education", "other"];

const STOPWORDS: &[&str] = &[
    "the", "and", "for", "you", "your", "with", "that", "this", "what", "how", "why", "when", "where", "who", "tell",
    "about", "describe", "explain", "have", "has", "had", "are", "was", "were", "can", "could", "would", "should",
    "did", "does", "time", "give", "example", "from", "into", "they", "them", "their", "there", "which", "will",
];

/// Turns free text into a safe FTS5 OR-query of its meaningful words.
pub fn fts_query(text: &str) -> Option<String> {
    let mut words: Vec<String> = Vec::new();
    for w in text.to_lowercase().split(|c: char| !c.is_alphanumeric() && c != '+' && c != '#') {
        // Keep trailing + and # so "C++" and "C#" survive.
        let w = w.trim_start_matches(|c: char| !c.is_alphanumeric()).trim_end_matches(|c: char| !c.is_alphanumeric() && c != '+' && c != '#');
        if w.len() < 3 || STOPWORDS.contains(&w) || words.iter().any(|x| x == w) {
            continue;
        }
        words.push(w.to_string());
        if words.len() == 16 {
            break;
        }
    }
    (!words.is_empty()).then(|| words.iter().map(|w| format!("\"{w}\"")).collect::<Vec<_>>().join(" OR "))
}

fn now() -> i64 {
    crate::now_ms() as i64
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn row_to_item(r: &Row) -> rusqlite::Result<PracticeItem> {
    let feedback: Option<String> = r.get(7)?;
    Ok(PracticeItem {
        id: r.get(0)?,
        session_id: r.get(1)?,
        position: r.get(2)?,
        question: r.get(3)?,
        category: r.get(4)?,
        focus: r.get(5)?,
        answer: r.get(6)?,
        feedback: feedback.and_then(|f| serde_json::from_str(&f).ok()),
        score: r.get(8)?,
    })
}

const ITEM_SELECT: &str =
    "SELECT id, session_id, position, question, category, focus, answer, feedback_json, score FROM practice_items";

impl Db {
    // --- Resumes and profile -------------------------------------------------

    pub fn insert_resume(&self, file_name: &str, text: &str) -> AppResult<ResumeRecord> {
        let rec = ResumeRecord { id: new_id(), file_name: file_name.into(), chars: text.chars().count() as i64, imported_at_ms: now() };
        self.conn()
            .execute(
                "INSERT INTO resumes (id, file_name, text, imported_at_ms) VALUES (?1, ?2, ?3, ?4)",
                params![rec.id, rec.file_name, text, rec.imported_at_ms],
            )
            .map_err(db_err)?;
        Ok(rec)
    }

    pub fn latest_resume(&self) -> AppResult<Option<(ResumeRecord, String)>> {
        self.conn()
            .query_row(
                "SELECT id, file_name, text, imported_at_ms FROM resumes ORDER BY imported_at_ms DESC LIMIT 1",
                [],
                |r| {
                    let text: String = r.get(2)?;
                    Ok((
                        ResumeRecord { id: r.get(0)?, file_name: r.get(1)?, chars: text.chars().count() as i64, imported_at_ms: r.get(3)? },
                        text,
                    ))
                },
            )
            .optional()
            .map_err(db_err)
    }

    /// Saves the extracted profile and replaces the candidate facts derived from it.
    pub fn save_profile(&self, resume_id: Option<&str>, profile: &serde_json::Value, facts: &[(String, String)]) -> AppResult<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(db_err)?;
        tx.execute(
            "INSERT INTO candidate_profile (id, resume_id, json, updated_at_ms) VALUES (1, ?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET resume_id = excluded.resume_id, json = excluded.json, updated_at_ms = excluded.updated_at_ms",
            params![resume_id, profile.to_string(), now()],
        )
        .map_err(db_err)?;
        // Facts the user added by hand ('other') are kept.
        tx.execute("DELETE FROM candidate_facts WHERE kind <> 'other'", []).map_err(db_err)?;
        for (kind, text) in facts {
            tx.execute(
                "INSERT INTO candidate_facts (id, kind, text, created_at_ms) VALUES (?1, ?2, ?3, ?4)",
                params![new_id(), kind, text, now()],
            )
            .map_err(db_err)?;
        }
        tx.commit().map_err(db_err)
    }

    pub fn profile(&self) -> AppResult<Option<serde_json::Value>> {
        let json: Option<String> = self
            .conn()
            .query_row("SELECT json FROM candidate_profile WHERE id = 1", [], |r| r.get(0))
            .optional()
            .map_err(db_err)?;
        Ok(json.and_then(|j| serde_json::from_str(&j).ok()))
    }

    pub fn facts(&self) -> AppResult<Vec<CandidateFact>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare("SELECT id, kind, text FROM candidate_facts ORDER BY CASE kind WHEN 'experience' THEN 0 WHEN 'project' THEN 1 WHEN 'skill' THEN 2 WHEN 'education' THEN 3 ELSE 4 END, created_at_ms")
            .map_err(db_err)?;
        let rows = stmt.query_map([], |r| Ok(CandidateFact { id: r.get(0)?, kind: r.get(1)?, text: r.get(2)? })).map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }

    /// Adds a fact (no id) or edits one.
    pub fn save_fact(&self, id: Option<&str>, kind: &str, text: &str) -> AppResult<CandidateFact> {
        if !FACT_KINDS.contains(&kind) {
            return Err(AppError::InvalidSettings(format!("Unknown fact type '{kind}'")));
        }
        let text = text.trim();
        if text.is_empty() || text.chars().count() > 600 {
            return Err(AppError::InvalidSettings("A fact must be between 1 and 600 characters.".into()));
        }
        let conn = self.conn();
        let id = match id {
            Some(id) => {
                let n = conn
                    .execute("UPDATE candidate_facts SET kind = ?2, text = ?3 WHERE id = ?1", params![id, kind, text])
                    .map_err(db_err)?;
                if n == 0 {
                    return Err(AppError::Internal("Fact not found".into()));
                }
                id.to_string()
            }
            None => {
                let id = new_id();
                conn.execute(
                    "INSERT INTO candidate_facts (id, kind, text, created_at_ms) VALUES (?1, ?2, ?3, ?4)",
                    params![id, kind, text, now()],
                )
                .map_err(db_err)?;
                id
            }
        };
        Ok(CandidateFact { id, kind: kind.into(), text: text.into() })
    }

    pub fn delete_fact(&self, id: &str) -> AppResult<()> {
        self.conn().execute("DELETE FROM candidate_facts WHERE id = ?1", [id]).map_err(db_err)?;
        Ok(())
    }

    /// The candidate facts most relevant to a question (BM25 over FTS5).
    pub fn search_facts(&self, text: &str, limit: i64) -> AppResult<Vec<CandidateFact>> {
        let Some(query) = fts_query(text) else { return Ok(Vec::new()) };
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT f.id, f.kind, f.text FROM candidate_facts_fts s JOIN candidate_facts f ON f.rowid = s.rowid
                 WHERE candidate_facts_fts MATCH ?1 ORDER BY bm25(candidate_facts_fts) LIMIT ?2",
            )
            .map_err(db_err)?;
        let rows = stmt
            .query_map(params![query, limit], |r| Ok(CandidateFact { id: r.get(0)?, kind: r.get(1)?, text: r.get(2)? }))
            .map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }

    // --- Jobs ------------------------------------------------------------------

    pub fn jobs(&self) -> AppResult<Vec<Job>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare("SELECT id, title, company, description, updated_at_ms FROM jobs ORDER BY updated_at_ms DESC")
            .map_err(db_err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Job { id: r.get(0)?, title: r.get(1)?, company: r.get(2)?, description: r.get(3)?, updated_at_ms: r.get(4)? })
            })
            .map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }

    pub fn job(&self, id: &str) -> AppResult<Option<Job>> {
        self.conn()
            .query_row("SELECT id, title, company, description, updated_at_ms FROM jobs WHERE id = ?1", [id], |r| {
                Ok(Job { id: r.get(0)?, title: r.get(1)?, company: r.get(2)?, description: r.get(3)?, updated_at_ms: r.get(4)? })
            })
            .optional()
            .map_err(db_err)
    }

    pub fn save_job(&self, id: Option<&str>, title: &str, company: &str, description: &str) -> AppResult<Job> {
        let title = title.trim();
        if title.is_empty() || title.chars().count() > 200 {
            return Err(AppError::InvalidSettings("Give the job a title (up to 200 characters).".into()));
        }
        if description.chars().count() > 15_000 {
            return Err(AppError::InvalidSettings("The job description is longer than 15,000 characters.".into()));
        }
        let job = Job {
            id: id.map(str::to_string).unwrap_or_else(new_id),
            title: title.into(),
            company: company.trim().into(),
            description: description.trim().into(),
            updated_at_ms: now(),
        };
        self.conn()
            .execute(
                "INSERT INTO jobs (id, title, company, description, updated_at_ms) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET title = excluded.title, company = excluded.company,
                     description = excluded.description, updated_at_ms = excluded.updated_at_ms",
                params![job.id, job.title, job.company, job.description, job.updated_at_ms],
            )
            .map_err(db_err)?;
        Ok(job)
    }

    pub fn delete_job(&self, id: &str) -> AppResult<()> {
        self.conn().execute("DELETE FROM jobs WHERE id = ?1", [id]).map_err(db_err)?;
        Ok(())
    }

    // --- Practice ------------------------------------------------------------------

    pub fn create_practice(
        &self,
        job_id: Option<&str>,
        title: &str,
        focus: &str,
        difficulty: &str,
        questions: &[NewQuestion],
    ) -> AppResult<String> {
        let id = new_id();
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(db_err)?;
        tx.execute(
            "INSERT INTO practice_sessions (id, job_id, title, focus, difficulty, created_at_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, job_id, title, focus, difficulty, now()],
        )
        .map_err(db_err)?;
        for (i, q) in questions.iter().enumerate() {
            tx.execute(
                "INSERT INTO practice_items (id, session_id, position, question, category, focus, updated_at_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![new_id(), id, i as i64, q.text, q.category, q.focus, now()],
            )
            .map_err(db_err)?;
        }
        tx.commit().map_err(db_err)?;
        Ok(id)
    }

    pub fn practice_sessions(&self) -> AppResult<Vec<PracticeSessionSummary>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.job_id, s.title, s.focus, s.difficulty, s.created_at_ms,
                        COUNT(i.id), COUNT(i.answer), AVG(i.score)
                 FROM practice_sessions s LEFT JOIN practice_items i ON i.session_id = s.id
                 GROUP BY s.id ORDER BY s.created_at_ms DESC",
            )
            .map_err(db_err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(PracticeSessionSummary {
                    id: r.get(0)?,
                    job_id: r.get(1)?,
                    title: r.get(2)?,
                    focus: r.get(3)?,
                    difficulty: r.get(4)?,
                    created_at_ms: r.get(5)?,
                    item_count: r.get(6)?,
                    answered_count: r.get(7)?,
                    average_score: r.get(8)?,
                })
            })
            .map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }

    pub fn practice_items(&self, session_id: &str) -> AppResult<Vec<PracticeItem>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(&format!("{ITEM_SELECT} WHERE session_id = ?1 ORDER BY position")).map_err(db_err)?;
        let rows = stmt.query_map([session_id], row_to_item).map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }

    pub fn practice_item(&self, id: &str) -> AppResult<PracticeItem> {
        self.conn()
            .query_row(&format!("{ITEM_SELECT} WHERE id = ?1"), [id], row_to_item)
            .optional()
            .map_err(db_err)?
            .ok_or_else(|| AppError::Internal("Practice question not found".into()))
    }

    /// Saves an answer. A new answer clears old feedback, which no longer applies.
    pub fn set_practice_answer(&self, id: &str, answer: &str, recording_session_id: Option<&str>) -> AppResult<PracticeItem> {
        let answer = answer.trim();
        if answer.chars().count() > 8_000 {
            return Err(AppError::InvalidSettings("The answer is longer than 8,000 characters.".into()));
        }
        let n = self
            .conn()
            .execute(
                "UPDATE practice_items SET answer = NULLIF(?2, ''), recording_session_id = COALESCE(?3, recording_session_id),
                     feedback_json = NULL, score = NULL, updated_at_ms = ?4 WHERE id = ?1",
                params![id, answer, recording_session_id, now()],
            )
            .map_err(db_err)?;
        if n == 0 {
            return Err(AppError::Internal("Practice question not found".into()));
        }
        self.practice_item(id)
    }

    pub fn set_practice_feedback(&self, id: &str, feedback: &serde_json::Value, score: f64) -> AppResult<PracticeItem> {
        self.conn()
            .execute(
                "UPDATE practice_items SET feedback_json = ?2, score = ?3, updated_at_ms = ?4 WHERE id = ?1",
                params![id, feedback.to_string(), score, now()],
            )
            .map_err(db_err)?;
        self.practice_item(id)
    }

    pub fn delete_practice(&self, id: &str) -> AppResult<()> {
        self.conn().execute("DELETE FROM practice_sessions WHERE id = ?1", [id]).map_err(db_err)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Db {
        Db::open_in_memory().unwrap()
    }

    #[test]
    fn fts_query_keeps_meaningful_words_only() {
        assert_eq!(fts_query("Tell me about a time you used Kubernetes and C++").unwrap(), r#""used" OR "kubernetes" OR "c++""#);
        assert!(fts_query("what is it").is_none());
        // Quotes in input can't break out of the FTS5 string.
        assert!(!fts_query(r#"rust" OR NEAR("#).unwrap().contains(r#"""""#));
    }

    #[test]
    fn retrieves_the_most_relevant_facts() {
        let db = db();
        let facts = vec![
            ("experience".to_string(), "Backend Engineer at Acme (2021-2024): migrated billing to Postgres, cut costs 30%".to_string()),
            ("project".to_string(), "Velora: Rust desktop app with local Whisper transcription".to_string()),
            ("skill".to_string(), "Skills: Rust, Go, Postgres, Kubernetes".to_string()),
            ("education".to_string(), "B.Tech Computer Science, VIT (2017-2021)".to_string()),
        ];
        db.save_profile(None, &serde_json::json!({}), &facts).unwrap();
        let hits = db.search_facts("Tell me about a database migration you did with Postgres", 2).unwrap();
        assert_eq!(hits.len(), 2);
        assert!(hits[0].text.contains("migrated billing to Postgres"), "{hits:?}");
        assert!(db.search_facts("Describe your experience with Haskell", 4).unwrap().is_empty());
    }

    #[test]
    fn re_extraction_keeps_hand_written_facts() {
        let db = db();
        db.save_profile(None, &serde_json::json!({}), &[("skill".into(), "Skills: Go".into())]).unwrap();
        db.save_fact(None, "other", "Mentored 3 junior developers").unwrap();
        db.save_profile(None, &serde_json::json!({}), &[("skill".into(), "Skills: Rust".into())]).unwrap();
        let texts: Vec<_> = db.facts().unwrap().into_iter().map(|f| f.text).collect();
        assert!(texts.contains(&"Skills: Rust".to_string()));
        assert!(texts.contains(&"Mentored 3 junior developers".to_string()));
        assert!(!texts.contains(&"Skills: Go".to_string()));
    }

    #[test]
    fn fact_validation_and_edit() {
        let db = db();
        assert!(db.save_fact(None, "hobby", "x").is_err());
        assert!(db.save_fact(None, "other", "  ").is_err());
        let f = db.save_fact(None, "other", "Speaks Tamil and English").unwrap();
        db.save_fact(Some(&f.id), "other", "Speaks Tamil, Hindi and English").unwrap();
        assert_eq!(db.search_facts("Which languages: Hindi?", 4).unwrap().len(), 1);
        db.delete_fact(&f.id).unwrap();
        assert!(db.facts().unwrap().is_empty());
    }

    #[test]
    fn practice_session_lifecycle() {
        let db = db();
        let job = db.save_job(None, "Backend Engineer", "Acme", "Rust and Postgres").unwrap();
        let qs = [
            NewQuestion { text: "Tell me about yourself.".into(), category: "general".into(), focus: "".into() },
            NewQuestion { text: "Explain database indexing.".into(), category: "technical".into(), focus: "".into() },
        ];
        let sid = db.create_practice(Some(&job.id), "Backend Engineer at Acme", "mixed", "medium", &qs).unwrap();
        let items = db.practice_items(&sid).unwrap();
        assert_eq!(items.iter().map(|i| i.position).collect::<Vec<_>>(), [0, 1]);

        db.set_practice_answer(&items[0].id, "I build backends.", Some("rec-1")).unwrap();
        db.set_practice_feedback(&items[0].id, &serde_json::json!({"score": 6}), 6.0).unwrap();
        let s = &db.practice_sessions().unwrap()[0];
        assert_eq!((s.item_count, s.answered_count, s.average_score), (2, 1, Some(6.0)));

        // Re-answering clears stale feedback.
        let item = db.set_practice_answer(&items[0].id, "New answer", None).unwrap();
        assert!(item.feedback.is_none() && item.score.is_none());

        // Deleting the job keeps the practice history.
        db.delete_job(&job.id).unwrap();
        assert_eq!(db.practice_sessions().unwrap().len(), 1);
        db.delete_practice(&sid).unwrap();
        assert!(db.practice_items(&sid).unwrap().is_empty());
    }

    #[test]
    fn job_validation() {
        let db = db();
        assert!(db.save_job(None, "  ", "", "").is_err());
        assert!(db.save_job(None, "Dev", "", &"x".repeat(15_001)).is_err());
        let j = db.save_job(None, "Dev", " Acme ", " desc ").unwrap();
        assert_eq!((j.company.as_str(), j.description.as_str()), ("Acme", "desc"));
        assert_eq!(db.job(&j.id).unwrap().unwrap().title, "Dev");
    }
}

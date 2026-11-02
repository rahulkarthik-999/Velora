//! Local SQLite database. Interview data stays on this PC.

use std::{path::Path, sync::Mutex};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::error::{AppError, AppResult};

/// Each entry upgrades the schema by one version (tracked in PRAGMA user_version).
const MIGRATIONS: &[&str] = &[
    // v1: sessions and transcript segments
    r#"
    CREATE TABLE interview_sessions (
        id            TEXT PRIMARY KEY,
        mode          TEXT NOT NULL CHECK (mode IN ('live', 'practice')),
        started_at_ms INTEGER NOT NULL,
        ended_at_ms   INTEGER,
        active_ms     INTEGER NOT NULL DEFAULT 0,
        status        TEXT NOT NULL
    );

    CREATE TABLE transcript_segments (
        id             TEXT PRIMARY KEY,
        session_id     TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
        source         TEXT NOT NULL CHECK (source IN ('microphone', 'systemAudio')),
        start_ms       INTEGER NOT NULL,
        end_ms         INTEGER NOT NULL,
        text           TEXT NOT NULL,
        status         TEXT NOT NULL DEFAULT 'final',
        confidence     REAL,
        no_speech_prob REAL,
        corrected      INTEGER NOT NULL DEFAULT 0,
        created_at_ms  INTEGER NOT NULL
    );
    CREATE INDEX idx_segments_session ON transcript_segments(session_id, start_ms);

    CREATE VIRTUAL TABLE transcript_fts USING fts5(
        text, content='transcript_segments', content_rowid='rowid'
    );
    CREATE TRIGGER transcript_ai AFTER INSERT ON transcript_segments BEGIN
        INSERT INTO transcript_fts(rowid, text) VALUES (new.rowid, new.text);
    END;
    CREATE TRIGGER transcript_ad AFTER DELETE ON transcript_segments BEGIN
        INSERT INTO transcript_fts(transcript_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
    END;
    CREATE TRIGGER transcript_au AFTER UPDATE OF text ON transcript_segments BEGIN
        INSERT INTO transcript_fts(transcript_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
        INSERT INTO transcript_fts(rowid, text) VALUES (new.rowid, new.text);
    END;
    "#,
    // v2: interview preparation (resume, profile facts, jobs, practice)
    r#"
    CREATE TABLE resumes (
        id             TEXT PRIMARY KEY,
        file_name      TEXT NOT NULL,
        text           TEXT NOT NULL,
        imported_at_ms INTEGER NOT NULL
    );

    CREATE TABLE candidate_profile (
        id            INTEGER PRIMARY KEY CHECK (id = 1),
        resume_id     TEXT REFERENCES resumes(id) ON DELETE SET NULL,
        json          TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE candidate_facts (
        id            TEXT PRIMARY KEY,
        kind          TEXT NOT NULL CHECK (kind IN ('skill', 'experience', 'project', 'education', 'other')),
        text          TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
    );
    -- Porter stemming so "migration" matches "migrated", "leading" matches "led"-style variants.
    CREATE VIRTUAL TABLE candidate_facts_fts USING fts5(
        text, content='candidate_facts', content_rowid='rowid', tokenize='porter unicode61'
    );
    CREATE TRIGGER facts_ai AFTER INSERT ON candidate_facts BEGIN
        INSERT INTO candidate_facts_fts(rowid, text) VALUES (new.rowid, new.text);
    END;
    CREATE TRIGGER facts_ad AFTER DELETE ON candidate_facts BEGIN
        INSERT INTO candidate_facts_fts(candidate_facts_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
    END;
    CREATE TRIGGER facts_au AFTER UPDATE OF text ON candidate_facts BEGIN
        INSERT INTO candidate_facts_fts(candidate_facts_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
        INSERT INTO candidate_facts_fts(rowid, text) VALUES (new.rowid, new.text);
    END;

    CREATE TABLE jobs (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        company       TEXT NOT NULL DEFAULT '',
        description   TEXT NOT NULL DEFAULT '',
        updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE practice_sessions (
        id            TEXT PRIMARY KEY,
        job_id        TEXT REFERENCES jobs(id) ON DELETE SET NULL,
        title         TEXT NOT NULL,
        focus         TEXT NOT NULL,
        difficulty    TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE practice_items (
        id                   TEXT PRIMARY KEY,
        session_id           TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
        position             INTEGER NOT NULL,
        question             TEXT NOT NULL,
        category             TEXT NOT NULL,
        focus                TEXT NOT NULL DEFAULT '',
        answer               TEXT,
        recording_session_id TEXT,
        feedback_json        TEXT,
        score                REAL,
        updated_at_ms        INTEGER NOT NULL
    );
    CREATE INDEX idx_practice_items_session ON practice_items(session_id, position);
    "#,
];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub id: String,
    pub session_id: String,
    pub source: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
    pub confidence: Option<f32>,
    pub corrected: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub mode: String,
    pub started_at_ms: i64,
    pub ended_at_ms: Option<i64>,
    pub active_ms: i64,
    pub status: String,
    pub segment_count: i64,
}

pub struct Db {
    conn: Mutex<Connection>,
}

fn db_err(e: rusqlite::Error) -> AppError {
    AppError::Internal(format!("Database error: {e}"))
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        Self::init(Connection::open(path).map_err(db_err)?)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> AppResult<Self> {
        Self::init(Connection::open_in_memory().map_err(db_err)?)
    }

    fn init(conn: Connection) -> AppResult<Self> {
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")
            .map_err(db_err)?;
        let check: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0)).map_err(db_err)?;
        if check != "ok" {
            return Err(AppError::Internal(format!("Local database is damaged: {check}")));
        }
        migrate(&conn)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("db lock poisoned")
    }

    pub fn upsert_session(&self, id: &str, mode: &str, started: i64, ended: Option<i64>, active_ms: i64, status: &str) -> AppResult<()> {
        self.conn()
            .execute(
                "INSERT INTO interview_sessions (id, mode, started_at_ms, ended_at_ms, active_ms, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET ended_at_ms = excluded.ended_at_ms,
                     active_ms = excluded.active_ms, status = excluded.status",
                params![id, mode, started, ended, active_ms, status],
            )
            .map_err(db_err)?;
        Ok(())
    }

    pub fn insert_segment(&self, s: &TranscriptSegment, no_speech_prob: f32, now_ms: i64) -> AppResult<()> {
        self.conn()
            .execute(
                "INSERT INTO transcript_segments
                   (id, session_id, source, start_ms, end_ms, text, confidence, no_speech_prob, corrected, created_at_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9)",
                params![s.id, s.session_id, s.source, s.start_ms, s.end_ms, s.text, s.confidence, no_speech_prob, now_ms],
            )
            .map_err(db_err)?;
        Ok(())
    }

    pub fn update_segment_text(&self, id: &str, text: &str) -> AppResult<TranscriptSegment> {
        let conn = self.conn();
        let n = conn
            .execute("UPDATE transcript_segments SET text = ?2, corrected = 1 WHERE id = ?1", params![id, text])
            .map_err(db_err)?;
        if n == 0 {
            return Err(AppError::Internal("Transcript segment not found".into()));
        }
        conn.query_row(&format!("{SEGMENT_SELECT} WHERE id = ?1"), [id], row_to_segment).map_err(db_err)
    }

    pub fn segments(&self, session_id: &str) -> AppResult<Vec<TranscriptSegment>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(&format!("{SEGMENT_SELECT} WHERE session_id = ?1 ORDER BY start_ms, created_at_ms"))
            .map_err(db_err)?;
        let rows = stmt.query_map([session_id], row_to_segment).map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }

    pub fn sessions(&self, limit: i64) -> AppResult<Vec<SessionRecord>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.mode, s.started_at_ms, s.ended_at_ms, s.active_ms, s.status,
                        (SELECT COUNT(*) FROM transcript_segments t WHERE t.session_id = s.id)
                 FROM interview_sessions s ORDER BY s.started_at_ms DESC LIMIT ?1",
            )
            .map_err(db_err)?;
        let rows = stmt
            .query_map([limit], |r| {
                Ok(SessionRecord {
                    id: r.get(0)?,
                    mode: r.get(1)?,
                    started_at_ms: r.get(2)?,
                    ended_at_ms: r.get(3)?,
                    active_ms: r.get(4)?,
                    status: r.get(5)?,
                    segment_count: r.get(6)?,
                })
            })
            .map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }

    pub fn delete_session(&self, id: &str) -> AppResult<()> {
        self.conn().execute("DELETE FROM interview_sessions WHERE id = ?1", [id]).map_err(db_err)?;
        Ok(())
    }

    /// Full-text search over transcripts, most relevant first.
    pub fn search_segments(&self, query: &str, limit: i64) -> AppResult<Vec<TranscriptSegment>> {
        // Quote each term so user input can't use FTS5 query syntax.
        let fts_query = query
            .split_whitespace()
            .map(|w| format!("\"{}\"", w.replace('"', "")))
            .collect::<Vec<_>>()
            .join(" ");
        if fts_query.is_empty() {
            return Ok(Vec::new());
        }
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.session_id, t.source, t.start_ms, t.end_ms, t.text, t.confidence, t.corrected
                 FROM transcript_fts f JOIN transcript_segments t ON t.rowid = f.rowid
                 WHERE transcript_fts MATCH ?1 ORDER BY rank LIMIT ?2",
            )
            .map_err(db_err)?;
        let rows = stmt.query_map(params![fts_query, limit], row_to_segment).map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }

    pub fn session_status(&self, id: &str) -> AppResult<Option<String>> {
        self.conn()
            .query_row("SELECT status FROM interview_sessions WHERE id = ?1", [id], |r| r.get(0))
            .optional()
            .map_err(db_err)
    }
}

mod prep;
#[allow(unused_imports)]
pub use prep::*;

const SEGMENT_SELECT: &str =
    "SELECT id, session_id, source, start_ms, end_ms, text, confidence, corrected FROM transcript_segments";

fn row_to_segment(r: &rusqlite::Row) -> rusqlite::Result<TranscriptSegment> {
    Ok(TranscriptSegment {
        id: r.get(0)?,
        session_id: r.get(1)?,
        source: r.get(2)?,
        start_ms: r.get(3)?,
        end_ms: r.get(4)?,
        text: r.get(5)?,
        confidence: r.get(6)?,
        corrected: r.get::<_, i64>(7)? != 0,
    })
}

fn migrate(conn: &Connection) -> AppResult<()> {
    let current: usize = conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0)).map_err(db_err)? as usize;
    if current > MIGRATIONS.len() {
        return Err(AppError::Internal(
            "This database was created by a newer version of Velora. Update the app to open it.".into(),
        ));
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let version = i + 1;
        conn.execute_batch(&format!("BEGIN; {sql} PRAGMA user_version = {version}; COMMIT;"))
            .map_err(|e| {
                let _ = conn.execute_batch("ROLLBACK;");
                AppError::Internal(format!("Database migration {version} failed: {e}"))
            })?;
        log::info!("Database migrated to version {version}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(id: &str, session: &str, start: i64, text: &str) -> TranscriptSegment {
        TranscriptSegment {
            id: id.into(),
            session_id: session.into(),
            source: "systemAudio".into(),
            start_ms: start,
            end_ms: start + 1_000,
            text: text.into(),
            confidence: Some(0.9),
            corrected: false,
        }
    }

    #[test]
    fn stores_and_orders_segments() {
        let db = Db::open_in_memory().unwrap();
        db.upsert_session("s1", "live", 0, None, 0, "active").unwrap();
        db.insert_segment(&seg("b", "s1", 5_000, "second"), 0.1, 2).unwrap();
        db.insert_segment(&seg("a", "s1", 1_000, "first"), 0.1, 1).unwrap();
        let texts: Vec<_> = db.segments("s1").unwrap().into_iter().map(|s| s.text).collect();
        assert_eq!(texts, ["first", "second"]);
    }

    #[test]
    fn segment_requires_existing_session() {
        let db = Db::open_in_memory().unwrap();
        assert!(db.insert_segment(&seg("a", "missing", 0, "x"), 0.0, 0).is_err());
    }

    #[test]
    fn correction_marks_segment_and_updates_search() {
        let db = Db::open_in_memory().unwrap();
        db.upsert_session("s1", "live", 0, None, 0, "active").unwrap();
        db.insert_segment(&seg("a", "s1", 0, "tell me about cubanetes"), 0.0, 0).unwrap();
        let updated = db.update_segment_text("a", "tell me about kubernetes").unwrap();
        assert!(updated.corrected);
        assert_eq!(db.search_segments("kubernetes", 5).unwrap().len(), 1);
        assert!(db.search_segments("cubanetes", 5).unwrap().is_empty());
    }

    #[test]
    fn search_treats_input_as_plain_words() {
        let db = Db::open_in_memory().unwrap();
        db.upsert_session("s1", "live", 0, None, 0, "active").unwrap();
        db.insert_segment(&seg("a", "s1", 0, "explain REST APIs"), 0.0, 0).unwrap();
        assert_eq!(db.search_segments("rest", 5).unwrap().len(), 1);
        // FTS5 operators in user input must not error.
        assert!(db.search_segments("rest\" OR NEAR(", 5).is_ok());
        assert!(db.search_segments("   ", 5).unwrap().is_empty());
    }

    #[test]
    fn deleting_session_removes_its_transcript() {
        let db = Db::open_in_memory().unwrap();
        db.upsert_session("s1", "live", 0, None, 0, "active").unwrap();
        db.insert_segment(&seg("a", "s1", 0, "hello"), 0.0, 0).unwrap();
        db.delete_session("s1").unwrap();
        assert!(db.segments("s1").unwrap().is_empty());
        assert!(db.search_segments("hello", 5).unwrap().is_empty());
    }

    #[test]
    fn session_upsert_updates_end_state() {
        let db = Db::open_in_memory().unwrap();
        db.upsert_session("s1", "live", 10, None, 0, "active").unwrap();
        db.upsert_session("s1", "live", 10, Some(99), 80, "ended").unwrap();
        let s = &db.sessions(10).unwrap()[0];
        assert_eq!((s.ended_at_ms, s.active_ms, s.status.as_str()), (Some(99), 80, "ended"));
    }

    #[test]
    fn reopening_file_does_not_rerun_migrations() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("v.db");
        Db::open(&path).unwrap().upsert_session("s1", "live", 0, None, 0, "active").unwrap();
        let db = Db::open(&path).unwrap();
        assert_eq!(db.sessions(10).unwrap().len(), 1);
    }
}

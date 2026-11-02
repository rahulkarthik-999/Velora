//! Knowledge base (notes and documents, chunked for retrieval) and saved copilot answers.

use rusqlite::params;
use serde::Serialize;

use super::{db_err, prep::fts_query, Db};
use crate::error::{AppError, AppResult};

/// Target chunk size: small enough that a handful fit in one prompt.
const CHUNK_CHARS: usize = 700;
pub const MAX_KNOWLEDGE_CHARS: usize = 200_000;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDoc {
    pub id: String,
    pub title: String,
    pub source: String,
    pub chars: i64,
    pub chunks: i64,
    pub preview: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedAnswer {
    pub id: String,
    pub session_id: Option<String>,
    pub question: String,
    pub answer: serde_json::Value,
    pub created_at_ms: i64,
}

/// Splits text into retrieval chunks on paragraph, then sentence, then word boundaries.
pub fn chunk_text(text: &str) -> Vec<String> {
    let mut pieces: Vec<String> = Vec::new();
    for para in text.split("\n\n").map(|p| p.split_whitespace().collect::<Vec<_>>().join(" ")) {
        if para.is_empty() {
            continue;
        }
        if para.chars().count() <= CHUNK_CHARS {
            pieces.push(para);
            continue;
        }
        // Long paragraph: break after sentences, or between words as a last resort.
        let mut current = String::new();
        for word in para.split(' ') {
            if !current.is_empty() && current.chars().count() + word.chars().count() + 1 > CHUNK_CHARS {
                pieces.push(std::mem::take(&mut current));
            }
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(word);
            let sentence_end = current.ends_with(['.', '?', '!']);
            if sentence_end && current.chars().count() > CHUNK_CHARS * 2 / 3 {
                pieces.push(std::mem::take(&mut current));
            }
        }
        if !current.is_empty() {
            pieces.push(current);
        }
    }

    // Merge short neighbours so headings and one-liners carry context.
    let mut chunks: Vec<String> = Vec::new();
    for p in pieces {
        match chunks.last_mut() {
            Some(last) if last.chars().count() + p.chars().count() < CHUNK_CHARS => {
                last.push('\n');
                last.push_str(&p);
            }
            _ => chunks.push(p),
        }
    }
    chunks.retain(|c| c.chars().filter(|ch| ch.is_alphanumeric()).count() >= 3);
    chunks
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

impl Db {
    pub fn add_knowledge(&self, title: &str, source: &str, text: &str) -> AppResult<KnowledgeDoc> {
        let title = title.trim();
        let text = text.trim();
        if title.is_empty() || title.chars().count() > 200 {
            return Err(AppError::InvalidSettings("Give it a title of up to 200 characters.".into()));
        }
        if text.is_empty() {
            return Err(AppError::InvalidSettings("There's no text to add.".into()));
        }
        if text.chars().count() > MAX_KNOWLEDGE_CHARS {
            return Err(AppError::InvalidSettings(format!(
                "That's too long for the knowledge base (limit {MAX_KNOWLEDGE_CHARS} characters). Split it into smaller documents."
            )));
        }
        let chunks = chunk_text(text);
        if chunks.is_empty() {
            return Err(AppError::InvalidSettings("There's no readable text to add.".into()));
        }
        let id = new_id();
        let now = crate::now_ms() as i64;
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(db_err)?;
        tx.execute(
            "INSERT INTO knowledge_docs (id, title, source, text, created_at_ms) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, title, source, text, now],
        )
        .map_err(db_err)?;
        for (i, c) in chunks.iter().enumerate() {
            tx.execute(
                "INSERT INTO knowledge_chunks (id, doc_id, position, text) VALUES (?1, ?2, ?3, ?4)",
                params![new_id(), id, i as i64, c],
            )
            .map_err(db_err)?;
        }
        tx.commit().map_err(db_err)?;
        drop(conn);
        self.knowledge_docs()?
            .into_iter()
            .find(|d| d.id == id)
            .ok_or_else(|| AppError::Internal("Saved document not found".into()))
    }

    pub fn knowledge_docs(&self) -> AppResult<Vec<KnowledgeDoc>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT d.id, d.title, d.source, length(d.text), substr(d.text, 1, 300), d.created_at_ms,
                        (SELECT COUNT(*) FROM knowledge_chunks c WHERE c.doc_id = d.id)
                 FROM knowledge_docs d ORDER BY d.created_at_ms DESC",
            )
            .map_err(db_err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(KnowledgeDoc {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    source: r.get(2)?,
                    chars: r.get(3)?,
                    preview: r.get(4)?,
                    created_at_ms: r.get(5)?,
                    chunks: r.get(6)?,
                })
            })
            .map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }

    pub fn delete_knowledge(&self, id: &str) -> AppResult<()> {
        self.conn().execute("DELETE FROM knowledge_docs WHERE id = ?1", [id]).map_err(db_err)?;
        Ok(())
    }

    /// The knowledge chunks most relevant to a question (BM25 over FTS5).
    pub fn search_knowledge(&self, text: &str, limit: i64) -> AppResult<Vec<String>> {
        let Some(query) = fts_query(text) else { return Ok(Vec::new()) };
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT c.text FROM knowledge_chunks_fts s JOIN knowledge_chunks c ON c.rowid = s.rowid
                 WHERE knowledge_chunks_fts MATCH ?1 ORDER BY bm25(knowledge_chunks_fts) LIMIT ?2",
            )
            .map_err(db_err)?;
        let rows = stmt.query_map(params![query, limit], |r| r.get(0)).map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }

    pub fn save_live_answer(&self, session_id: Option<&str>, question: &str, answer: &serde_json::Value) -> AppResult<SavedAnswer> {
        let saved = SavedAnswer {
            id: new_id(),
            session_id: session_id.map(str::to_string),
            question: question.to_string(),
            answer: answer.clone(),
            created_at_ms: crate::now_ms() as i64,
        };
        self.conn()
            .execute(
                "INSERT INTO live_answers (id, session_id, question, answer_json, created_at_ms) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![saved.id, saved.session_id, saved.question, answer.to_string(), saved.created_at_ms],
            )
            .map_err(db_err)?;
        Ok(saved)
    }

    pub fn live_answers(&self, session_id: &str) -> AppResult<Vec<SavedAnswer>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, question, answer_json, created_at_ms FROM live_answers
                 WHERE session_id = ?1 ORDER BY created_at_ms",
            )
            .map_err(db_err)?;
        let rows = stmt
            .query_map([session_id], |r| {
                let json: String = r.get(3)?;
                Ok(SavedAnswer {
                    id: r.get(0)?,
                    session_id: r.get(1)?,
                    question: r.get(2)?,
                    answer: serde_json::from_str(&json).unwrap_or(serde_json::Value::Null),
                    created_at_ms: r.get(4)?,
                })
            })
            .map_err(db_err)?;
        rows.collect::<Result<_, _>>().map_err(db_err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_respect_size_and_merge_short_paragraphs() {
        let long = "This sentence is about Kafka consumers. ".repeat(60);
        let text = format!("Heading\n\nShort line.\n\n{long}");
        let chunks = chunk_text(&text);
        assert!(chunks.len() >= 3);
        assert!(chunks[0].starts_with("Heading\nShort line."));
        assert!(chunks.iter().all(|c| c.chars().count() <= CHUNK_CHARS + 60));
    }

    #[test]
    fn knowledge_round_trip_and_search() {
        let db = Db::open_in_memory().unwrap();
        let doc = db
            .add_knowledge("System design notes", "note", "Use consistent hashing to shard the cache.\n\nKafka gives ordered partitions.")
            .unwrap();
        assert_eq!(doc.chunks, 1);
        let hits = db.search_knowledge("How would you shard a cache?", 3).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].contains("consistent hashing"));

        db.delete_knowledge(&doc.id).unwrap();
        assert!(db.search_knowledge("shard cache", 3).unwrap().is_empty());
        assert!(db.knowledge_docs().unwrap().is_empty());
    }

    #[test]
    fn rejects_empty_or_untitled_knowledge() {
        let db = Db::open_in_memory().unwrap();
        assert!(db.add_knowledge("", "note", "text").is_err());
        assert!(db.add_knowledge("Title", "note", "   ").is_err());
    }

    #[test]
    fn answers_are_saved_per_session() {
        let db = Db::open_in_memory().unwrap();
        db.upsert_session("s1", "live", 0, None, 0, "active").unwrap();
        db.save_live_answer(Some("s1"), "What is Rust?", &serde_json::json!({"answer": "A language"})).unwrap();
        let saved = db.live_answers("s1").unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].answer["answer"], "A language");
        db.delete_session("s1").unwrap();
        assert!(db.live_answers("s1").unwrap().is_empty());
    }
}

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    InvalidSettings(String),
    #[error("Cannot {action} while the session is {status}")]
    InvalidTransition { action: &'static str, status: String },
    #[error("Window '{0}' was not found")]
    WindowNotFound(String),
    #[error("File error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Settings file is not valid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Internal(String),
}

// Commands return errors to the UI as plain messages.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

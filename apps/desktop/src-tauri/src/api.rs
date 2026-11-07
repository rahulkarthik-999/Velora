//! Client for the Velora web API (veloraweb.online). The OpenAI key lives on
//! the server; the desktop app only holds its own revocable device token.

use std::{sync::OnceLock, time::Duration};

use serde::{de::DeserializeOwned, Serialize};

use crate::error::{AppError, AppResult};

const SERVICE: &str = "Velora";
const TOKEN_USER: &str = "device-token";

pub struct Api {
    base: String,
    agent: ureq::Agent,
}

/// Outcome of a call, keeping 401 separate so callers can sign the app out.
#[derive(Debug)]
pub enum ApiError {
    Unauthorized,
    Status(u16, String),
    Network(String),
}

impl From<ApiError> for AppError {
    fn from(e: ApiError) -> Self {
        match e {
            ApiError::Unauthorized => AppError::Internal("Your session has ended. Connect your account again on the Account page.".into()),
            // Sign-in failures carry their own explanation (wrong password, Google account...).
            ApiError::Status(_, msg) => AppError::Internal(msg),
            ApiError::Network(msg) => AppError::Internal(msg),
        }
    }
}

impl Api {
    pub fn new(base_url: &str) -> Self {
        Self { base: base_url.trim_end_matches('/').to_string(), agent: shared_agent() }
    }

    pub fn post<B: Serialize, R: DeserializeOwned>(&self, path: &str, token: Option<&str>, body: &B) -> Result<R, ApiError> {
        let json = serde_json::to_string(&without_nulls(body).map_err(|e| ApiError::Network(e.to_string()))?)
            .map_err(|e| ApiError::Network(e.to_string()))?;
        let mut req = self.agent.post(format!("{}{path}", self.base)).header("Content-Type", "application/json");
        if let Some(t) = token {
            req = req.header("Authorization", format!("Bearer {t}"));
        }
        self.finish(req.send(json))
    }

    pub fn get<R: DeserializeOwned>(&self, path: &str, token: &str) -> Result<R, ApiError> {
        let req = self.agent.get(format!("{}{path}", self.base)).header("Authorization", format!("Bearer {token}"));
        self.finish(req.call())
    }

    fn finish<R: DeserializeOwned>(&self, result: Result<ureq::http::Response<ureq::Body>, ureq::Error>) -> Result<R, ApiError> {
        let mut resp = result.map_err(|e| {
            log::warn!("API request failed: {e}");
            ApiError::Network(format!("Can't reach Velora at {}. Check your internet connection.", self.base))
        })?;
        let status = resp.status().as_u16();
        let body = resp.body_mut().read_to_string().unwrap_or_default();
        match status {
            200..=299 => serde_json::from_str(&body)
                .map_err(|e| ApiError::Status(status, format!("Unexpected response from Velora ({e})"))),
            // A 401 with a message is a failed sign-in, not an expired session.
            401 if serde_json::from_str::<serde_json::Value>(&body).ok().and_then(|v| v["error"].as_str().map(|e| e != "Unauthorized")).unwrap_or(false) => {
                Err(ApiError::Status(status, error_message(status, &body)))
            }
            401 => Err(ApiError::Unauthorized),
            // A redirect means the server address is out of date; following it would drop the request body.
            300..=399 => Err(ApiError::Status(
                status,
                format!("The Velora server address has changed. Set it to {} in AI Settings.", crate::settings::DEFAULT_API_BASE_URL),
            )),
            _ => Err(ApiError::Status(status, error_message(status, &body))),
        }
    }
}

/// One agent for the whole app. Clones share its connection pool, so the TLS connection
/// to Velora stays open between requests instead of being set up again (DNS, TCP and TLS
/// handshake, often 300 ms or more) for every live answer and transcription clip.
pub(crate) fn shared_agent() -> ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT
        .get_or_init(|| {
            ureq::Agent::config_builder()
                // Keep error bodies: the server explains what went wrong.
                .http_status_as_error(false)
                // Report redirects instead of following them: a followed POST would lose its body.
                .max_redirects(0)
                .timeout_global(Some(Duration::from_secs(60)))
                .max_idle_connections_per_host(4)
                .max_idle_age(Duration::from_secs(90))
                .build()
                .into()
        })
        .clone()
}

/// Opens the connection to Velora and wakes the answer function ahead of time (when a live
/// session starts), so the first answer pays for neither the handshake nor a cold start.
/// Failures are ignored: it's only a warm-up.
pub fn warm_up(base_url: &str) {
    let url = format!("{}/api/live/answer", base_url.trim_end_matches('/'));
    std::thread::spawn(move || {
        if let Ok(mut resp) = shared_agent().get(&url).call() {
            // Reading the (empty) body returns the connection to the pool.
            let _ = resp.body_mut().read_to_string();
        }
    });
}

/// Optional fields are sent by leaving them out, never as null: the server's schemas
/// accept a missing optional field but reject null.
pub fn without_nulls<B: Serialize>(body: &B) -> Result<serde_json::Value, serde_json::Error> {
    let mut value = serde_json::to_value(body)?;
    if let serde_json::Value::Object(map) = &mut value {
        map.retain(|_, v| !v.is_null());
    }
    Ok(value)
}

/// Uses the server's `{"error": "..."}` message when there is one.
pub fn error_message(status: u16, body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string))
        .unwrap_or_else(|| match status {
            404 => "This feature isn't available on the Velora server yet.".into(),
            429 => "Too many requests. Wait a moment and try again.".into(),
            _ => format!("Velora returned an error ({status})."),
        })
}

// --- Device token in Windows Credential Manager -------------------------------

fn entry() -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, TOKEN_USER).map_err(|e| AppError::Internal(format!("Credential store unavailable: {e}")))
}

pub fn load_token() -> AppResult<Option<String>> {
    match entry()?.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Internal(format!("Could not read the saved sign-in: {e}"))),
    }
}

pub fn save_token(token: &str) -> AppResult<()> {
    entry()?.set_password(token).map_err(|e| AppError::Internal(format!("Could not save the sign-in: {e}")))
}

pub fn clear_token() -> AppResult<()> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Internal(format!("Could not remove the saved sign-in: {e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn null_fields_are_left_out_of_requests() {
        let body = serde_json::json!({ "jobTitle": "Dev", "company": null, "count": 5, "nested": { "keep": null } });
        let out = without_nulls(&body).unwrap();
        assert_eq!(out, serde_json::json!({ "jobTitle": "Dev", "count": 5, "nested": { "keep": null } }));
    }

    #[test]
    fn surfaces_server_error_messages() {
        assert_eq!(error_message(402, r#"{"error":"You've used all 50 AI credits"}"#), "You've used all 50 AI credits");
        assert_eq!(error_message(429, "not json"), "Too many requests. Wait a moment and try again.");
        assert_eq!(error_message(500, ""), "Velora returned an error (500).");
    }

    #[test]
    fn unreachable_server_is_a_friendly_network_error() {
        // Port 9 on localhost: nothing listens there.
        let api = Api::new("http://127.0.0.1:9");
        let r: Result<serde_json::Value, _> = api.post("/api/x", None, &serde_json::json!({}));
        match r {
            Err(ApiError::Network(msg)) => assert!(msg.contains("Can't reach Velora")),
            other => panic!("expected a network error, got {other:?}"),
        }
    }
}

//! Plans and billing. The Velora web API is the only source of truth: it knows the
//! plan, allowances and usage, and creates Dodo checkouts. This app never handles
//! payment details; checkout and the billing portal open in the browser.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    api::{self, Api, ApiError},
    error::{AppError, AppResult},
    prep::ACCOUNT_CHANGED,
    AppState,
};

const PLANS: &[&str] = &["STARTER", "PRO_MONTHLY", "PRO_QUARTERLY", "PRO_ANNUAL", "LIFETIME"];

fn api(app: &AppHandle) -> Api {
    Api::new(&app.state::<AppState>().settings.get().api_base_url)
}

fn token() -> AppResult<String> {
    api::load_token()?.ok_or_else(|| AppError::InvalidSettings("Sign in to your Velora account first.".into()))
}

fn signed_out_on_401<T>(app: &AppHandle, r: Result<T, ApiError>) -> AppResult<T> {
    if let Err(ApiError::Unauthorized) = &r {
        let _ = api::clear_token();
        let _ = app.emit(ACCOUNT_CHANGED, json!({ "status": "signedOut" }));
    }
    r.map_err(AppError::from)
}

/// Only open web links on the Velora site or Dodo's checkout, never an arbitrary URL from a response.
fn open_trusted(url: &str, app: &AppHandle) -> AppResult<()> {
    let base = app.state::<AppState>().settings.get().api_base_url;
    let ok = url.starts_with("https://checkout.dodopayments.com/")
        || url.starts_with("https://test.checkout.dodopayments.com/")
        || url.starts_with("https://customer.dodopayments.com/")
        || url.starts_with("https://test.customer.dodopayments.com/")
        || (url.starts_with("https://") && url.contains(".dodopayments.com/"))
        || url.starts_with(&format!("{base}/"));
    if !ok {
        return Err(AppError::Internal("The server returned an unexpected payment link.".into()));
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| AppError::Internal(format!("Could not open the browser: {e}")))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| AppError::Internal(e.to_string()))?
}

/// Plan, allowances, usage this month, payment history and the plans on offer.
#[tauri::command]
pub async fn billing_status(app: AppHandle) -> AppResult<Value> {
    blocking(move || {
        let token = token()?;
        signed_out_on_401(&app, api(&app).get("/api/billing/status", &token))
    })
    .await
}

/// Starts a Dodo checkout for a plan and opens it in the browser. The plan is
/// switched on by Dodo's verified webhook, never by this app.
#[tauri::command]
pub async fn billing_checkout(app: AppHandle, plan: String) -> AppResult<()> {
    if !PLANS.contains(&plan.as_str()) {
        return Err(AppError::InvalidSettings("Choose a valid plan.".into()));
    }
    blocking(move || {
        let token = token()?;
        let out: Value = signed_out_on_401(&app, api(&app).post("/api/billing/checkout", Some(&token), &json!({ "plan": plan })))?;
        let url = out["checkoutUrl"].as_str().ok_or_else(|| AppError::Internal("No checkout link was returned.".into()))?;
        open_trusted(url, &app)
    })
    .await
}

/// Opens Dodo's customer portal: payment method, invoices, plan changes and cancellation.
#[tauri::command]
pub async fn billing_portal(app: AppHandle) -> AppResult<()> {
    blocking(move || {
        let token = token()?;
        let out: Value = signed_out_on_401(&app, api(&app).post("/api/billing/portal", Some(&token), &json!({})))?;
        let url = out["url"].as_str().ok_or_else(|| AppError::Internal("No billing link was returned.".into()))?;
        open_trusted(url, &app)
    })
    .await
}

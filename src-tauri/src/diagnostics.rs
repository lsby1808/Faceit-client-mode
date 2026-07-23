use crate::debug_log::{self, DebugEvent};
use serde::Serialize;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime};

#[derive(Serialize)]
struct SecuritySummary {
    remote_capabilities: u8,
    tauri_global_exposed: bool,
    downloads_enabled: bool,
    telemetry_enabled: bool,
    token_collection_enabled: bool,
}

#[derive(Serialize)]
struct DiagnosticReport<'a> {
    schema_version: u8,
    product: &'a str,
    version: String,
    generated_at_unix_ms: u128,
    os: &'a str,
    arch: &'a str,
    webview_version: Option<String>,
    extension_manifest_present: bool,
    updater_configured: bool,
    security: SecuritySummary,
    debug_events: Vec<DebugEvent>,
    note: &'a str,
}

pub fn export<R: Runtime>(
    app: &AppHandle<R>,
    extension_manifest_present: bool,
    updater_configured: bool,
) -> io::Result<PathBuf> {
    let app_data = app.path().app_local_data_dir().map_err(io::Error::other)?;
    let diagnostics_dir = app_data.join("diagnostics");
    fs::create_dir_all(&diagnostics_dir)?;

    let generated_at_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let path = diagnostics_dir.join(format!("eloscope-diagnostics-{generated_at_unix_ms}.json"));

    let report = DiagnosticReport {
        schema_version: 2,
        product: "EloScope",
        version: app.package_info().version.to_string(),
        generated_at_unix_ms,
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        webview_version: tauri::webview_version().ok(),
        extension_manifest_present,
        updater_configured,
        security: SecuritySummary {
            remote_capabilities: 0,
            tauri_global_exposed: false,
            downloads_enabled: false,
            telemetry_enabled: false,
            token_collection_enabled: false,
        },
        debug_events: debug_log::snapshot(),
        note: "This deliberately redacted report contains only bounded enum-based native events and never includes URLs, cookies, session tokens, page content, usernames, match identifiers, parameters, or error strings.",
    };

    let bytes = serde_json::to_vec_pretty(&report).map_err(io::Error::other)?;
    fs::write(&path, bytes)?;
    Ok(path)
}

use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

const MAX_EVENTS: usize = 512;

/// A deliberately data-free description of a native client action.
///
/// Keep these variants free of fields. The diagnostics export must never gain
/// URLs, identifiers, parameters, page content, error strings, or credentials.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DebugEventKind {
    ApplicationStarting,
    SetupStarted,
    ExtensionManifestValidated,
    WebviewProfileReady,
    ShellSettingsLoaded,
    ShellSettingsLoadFailed,
    ShellSettingsApplyRequested,
    ShellSettingsApplySucceeded,
    ShellSettingsApplyFailed,
    MainWindowCreated,
    SetupCompleted,
    ExtensionInstallRequested,
    ExtensionInstallSucceeded,
    ExtensionInstallFailed,
    InitialNavigationSucceeded,
    InitialNavigationFailed,
    MenuAboutSelected,
    MenuUpdateCheckSelected,
    MenuDiagnosticsExportSelected,
    TrayWindowHidden,
    TrayWindowRestored,
    TrayUpdateCheckSelected,
    TrayExitSelected,
    SingleInstanceRestored,
    DiagnosticsExportSucceeded,
    DiagnosticsExportFailed,
    NavigationAllowedInWebview,
    NavigationExternalRequested,
    NavigationExternalOpenSucceeded,
    NavigationExternalOpenFailed,
    NavigationSteamRequested,
    NavigationSteamOpenSucceeded,
    NavigationSteamOpenFailed,
    NavigationAntiCheatRequested,
    NavigationDenied,
    PopupAllowedInWebview,
    PopupCreated,
    PopupCreateFailed,
    PopupNotCreated,
    DownloadAllowed,
    DownloadDenied,
    DownloadFinishedSucceeded,
    DownloadFinishedFailed,
    DownloadEventIgnored,
    AntiCheatPromptOpened,
    AntiCheatPromptSuppressed,
    AntiCheatLaunchConfirmed,
    AntiCheatLaunchCancelled,
    AntiCheatLaunchSucceeded,
    AntiCheatLaunchFailed,
    UpdaterPeriodicChecksScheduled,
    UpdaterConfigurationMissing,
    UpdaterManualCheckStarted,
    UpdaterPeriodicCheckStarted,
    UpdaterUpdateAvailable,
    UpdaterNoUpdate,
    UpdaterCheckFailed,
    UpdaterInstallConfirmed,
    UpdaterInstallDeferred,
    UpdaterInstallStarted,
    UpdaterInstallSucceeded,
    UpdaterInstallFailed,
    UpdaterRestartRequested,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct DebugEvent {
    sequence: u64,
    elapsed_ms: u64,
    kind: DebugEventKind,
}

struct DebugLog {
    started_at: Instant,
    next_sequence: u64,
    events: VecDeque<DebugEvent>,
}

impl DebugLog {
    fn new() -> Self {
        Self {
            started_at: Instant::now(),
            next_sequence: 1,
            events: VecDeque::with_capacity(MAX_EVENTS),
        }
    }

    fn record(&mut self, kind: DebugEventKind) {
        if self.events.len() == MAX_EVENTS {
            self.events.pop_front();
        }

        let elapsed_ms = self.started_at.elapsed().as_millis().min(u64::MAX as u128) as u64;
        self.events.push_back(DebugEvent {
            sequence: self.next_sequence,
            elapsed_ms,
            kind,
        });
        self.next_sequence = self.next_sequence.saturating_add(1);
    }

    fn snapshot(&self) -> Vec<DebugEvent> {
        self.events.iter().cloned().collect()
    }
}

fn global_log() -> &'static Mutex<DebugLog> {
    static LOG: OnceLock<Mutex<DebugLog>> = OnceLock::new();
    LOG.get_or_init(|| Mutex::new(DebugLog::new()))
}

pub(crate) fn record(kind: DebugEventKind) {
    global_log()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .record(kind);
}

pub(crate) fn snapshot() -> Vec<DebugEvent> {
    global_log()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .snapshot()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_buffer_retains_only_the_newest_bounded_events() {
        let mut log = DebugLog::new();
        for _ in 0..(MAX_EVENTS + 7) {
            log.record(DebugEventKind::NavigationAllowedInWebview);
        }

        let events = log.snapshot();
        assert_eq!(events.len(), MAX_EVENTS);
        assert_eq!(events.first().map(|event| event.sequence), Some(8));
        assert_eq!(
            events.last().map(|event| event.sequence),
            Some((MAX_EVENTS + 7) as u64)
        );
    }

    #[test]
    fn serialized_events_contain_only_timing_sequence_and_enum_kind() {
        let event = DebugEvent {
            sequence: 3,
            elapsed_ms: 42,
            kind: DebugEventKind::NavigationDenied,
        };
        let value = serde_json::to_value(event).expect("serialize debug event");

        assert_eq!(
            value,
            serde_json::json!({
                "sequence": 3,
                "elapsed_ms": 42,
                "kind": "navigation_denied"
            })
        );
    }

    #[test]
    fn every_event_variant_serializes_as_a_fieldless_string() {
        let variants = [
            DebugEventKind::ApplicationStarting,
            DebugEventKind::ExtensionInstallFailed,
            DebugEventKind::NavigationExternalRequested,
            DebugEventKind::PopupCreateFailed,
            DebugEventKind::DownloadDenied,
            DebugEventKind::AntiCheatLaunchFailed,
            DebugEventKind::UpdaterInstallFailed,
        ];

        for variant in variants {
            assert!(serde_json::to_value(variant)
                .expect("serialize event kind")
                .is_string());
        }
    }
}

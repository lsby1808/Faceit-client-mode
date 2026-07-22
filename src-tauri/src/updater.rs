use std::time::Duration;
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

const CONFIG: &str = include_str!("../tauri.conf.json");
const CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
const INITIAL_DELAY: Duration = Duration::from_secs(30);

pub fn is_configured() -> bool {
    !CONFIG.contains("github.com/OWNER/")
        && !CONFIG.contains("REPLACE_WITH_TAURI_SIGNER_PUBLIC_KEY")
}

pub fn start_periodic_checks<R: Runtime>(app: AppHandle<R>) {
    if !is_configured() {
        return;
    }

    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(INITIAL_DELAY).await;
        loop {
            check(app.clone(), false).await;
            tokio::time::sleep(CHECK_INTERVAL).await;
        }
    });
}

pub fn check_manually<R: Runtime>(app: AppHandle<R>) {
    if !is_configured() {
        app.dialog()
            .message(
                "The updater configuration is incomplete in this build. Install a release from the official EloScope GitHub repository.",
            )
            .title("EloScope updates")
            .kind(MessageDialogKind::Info)
            .show(|_| {});
        return;
    }

    tauri::async_runtime::spawn(check(app, true));
}

async fn check<R: Runtime>(app: AppHandle<R>, interactive: bool) {
    let result = async {
        let updater = app.updater()?;
        updater.check().await
    }
    .await;

    match result {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let app_for_install = app.clone();
            app.dialog()
                .message(format!(
                    "EloScope {version} is available. Download, verify its Tauri signature, and install it now?"
                ))
                .title("Signed update available")
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "Install".to_owned(),
                    "Later".to_owned(),
                ))
                .kind(MessageDialogKind::Info)
                .show(move |install| {
                    if !install {
                        return;
                    }
                    tauri::async_runtime::spawn(async move {
                        let install_result = update.download_and_install(|_, _| {}, || {}).await;
                        match install_result {
                            Ok(()) => app_for_install.restart(),
                            Err(_) => {
                                app_for_install
                                    .dialog()
                                    .message("The update was not installed. Its download or cryptographic signature verification failed.")
                                    .title("Update rejected")
                                    .kind(MessageDialogKind::Error)
                                    .show(|_| {});
                            }
                        }
                    });
                });
        }
        Ok(None) if interactive => {
            app.dialog()
                .message("You already have the latest EloScope version.")
                .title("EloScope updates")
                .kind(MessageDialogKind::Info)
                .show(|_| {});
        }
        Err(_) if interactive => {
            app.dialog()
                .message("The update check failed. No package was downloaded or installed.")
                .title("Update check failed")
                .kind(MessageDialogKind::Warning)
                .show(|_| {});
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_source_has_signed_updater_configured() {
        assert!(is_configured());
        assert!(CONFIG.contains(
            "github.com/lsby1808/Faceit-client-mode/releases/latest/download/latest.json"
        ));
    }
}

mod debug_log;
mod diagnostics;
mod policy;
mod updater;

use debug_log::DebugEventKind;
use getrandom::fill as fill_random;
use policy::{is_safe_download_url, NavigationDecision, RequestContext, SessionPolicy};
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::menu::MenuBuilder;
use tauri::webview::{DownloadEvent, NewWindowFeatures, NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const FACEIT_HOME: &str = "https://www.faceit.com/";
const EXTENSION_BOOTSTRAP_URL: &str = "about:blank";
const ABOUT_TEXT: &str = "EloScope is an independent enhancement client. It is not affiliated with, sponsored by, or endorsed by FACEIT Ltd. FACEIT and Counter-Strike are trademarks of their respective owners. EloScope can hand Windows the exact official FACEIT Anti-Cheat launch URI after confirmation, but never inspects, injects into, monitors, or modifies Anti-Cheat, CS2 memory, or game processes. No telemetry or remote crash reporting is enabled.";
static POPUP_COUNTER: AtomicU64 = AtomicU64::new(1);
static FACEIT_ANTI_CHEAT_PROMPT_OPEN: AtomicBool = AtomicBool::new(false);

pub fn run() {
    debug_log::record(DebugEventKind::ApplicationStarting);
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .menu(|app| {
            MenuBuilder::new(app)
                .text("about", "About EloScope")
                .text("check-updates", "Check for updates")
                .text("export-diagnostics", "Export redacted diagnostics")
                .separator()
                .quit()
                .build()
        })
        .setup(setup);

    builder
        .run(tauri::generate_context!())
        .expect("EloScope failed to start");
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn Error>> {
    debug_log::record(DebugEventKind::SetupStarted);
    let extension_path = resolve_extension_path(app.handle())?;
    validate_extension(&extension_path)?;
    debug_log::record(DebugEventKind::ExtensionManifestValidated);

    let profile_path = app.path().app_local_data_dir()?.join("webview-profile");
    fs::create_dir_all(&profile_path)?;
    debug_log::record(DebugEventKind::WebviewProfileReady);

    let session_policy = SessionPolicy::new(generate_click_nonce()?);
    let init_script = trusted_click_script(session_policy.click_nonce());

    let navigation_policy = session_policy.clone();
    let navigation_app = app.handle().clone();
    let popup_policy = session_policy.clone();
    let popup_app = app.handle().clone();
    let popup_init_script = init_script.clone();

    // WebView2 installs browser extensions asynchronously. Starting at FACEIT
    // here would race the extension installation and leave the initial SPA
    // document without content scripts. Stay on about:blank until the native
    // completion callback confirms that the extension is running.
    let bootstrap_url = EXTENSION_BOOTSTRAP_URL.parse()?;
    let main_window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(bootstrap_url))
        .title("EloScope")
        .inner_size(1440.0, 900.0)
        .min_inner_size(1024.0, 700.0)
        .resizable(true)
        .data_directory(profile_path)
        .browser_extensions_enabled(true)
        .initialization_script(init_script)
        .devtools(cfg!(debug_assertions))
        .zoom_hotkeys_enabled(true)
        .on_navigation(move |url| {
            handle_navigation(
                &navigation_app,
                navigation_policy.classify(url, RequestContext::MainFrame),
                url.as_str(),
            )
        })
        .on_new_window(move |url, features| {
            handle_popup_request(&popup_app, &popup_policy, &popup_init_script, url, features)
        })
        .on_download(|_, event| handle_download_event(event))
        .build()?;
    debug_log::record(DebugEventKind::MainWindowCreated);

    install_extension_then_navigate(
        &main_window,
        app.handle().clone(),
        extension_path.clone(),
        FACEIT_HOME,
    )?;

    let extension_manifest_present = extension_path.join("manifest.json").is_file();
    let app_handle = app.handle().clone();
    app.on_menu_event(move |_app, event| match event.id().as_ref() {
        "about" => {
            debug_log::record(DebugEventKind::MenuAboutSelected);
            app_handle
                .dialog()
                .message(ABOUT_TEXT)
                .title("About EloScope")
                .kind(MessageDialogKind::Info)
                .show(|_| {});
        }
        "check-updates" => {
            debug_log::record(DebugEventKind::MenuUpdateCheckSelected);
            updater::check_manually(app_handle.clone());
        }
        "export-diagnostics" => {
            debug_log::record(DebugEventKind::MenuDiagnosticsExportSelected);
            match diagnostics::export(
                &app_handle,
                extension_manifest_present,
                updater::is_configured(),
            ) {
                Ok(path) => {
                    debug_log::record(DebugEventKind::DiagnosticsExportSucceeded);
                    let parent = path.parent().map(Path::to_path_buf);
                    app_handle
                        .dialog()
                        .message(format!(
                            "A redacted diagnostic report was written to:\n{}",
                            path.display()
                        ))
                        .title("Diagnostics exported")
                        .kind(MessageDialogKind::Info)
                        .show(move |_| {
                            if let Some(parent) = parent {
                                let _ = open::that_detached(parent);
                            }
                        });
                }
                Err(_) => {
                    debug_log::record(DebugEventKind::DiagnosticsExportFailed);
                    app_handle
                        .dialog()
                        .message("The local diagnostic report could not be written.")
                        .title("Diagnostics export failed")
                        .kind(MessageDialogKind::Error)
                        .show(|_| {});
                }
            }
        }
        _ => {}
    });

    updater::start_periodic_checks(app.handle().clone());
    debug_log::record(DebugEventKind::SetupCompleted);
    Ok(())
}

#[cfg(windows)]
fn install_extension_then_navigate(
    window: &WebviewWindow<Wry>,
    app: AppHandle<Wry>,
    extension_root: PathBuf,
    target_url: &str,
) -> tauri::Result<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Profile7, ICoreWebView2_13};
    use webview2_com::ProfileAddBrowserExtensionCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let target_url = target_url.to_owned();
    debug_log::record(DebugEventKind::ExtensionInstallRequested);
    let attach_result = window.with_webview(move |platform_webview| {
        let install = (|| -> windows::core::Result<()> {
            let controller = platform_webview.controller();
            let webview = unsafe { controller.CoreWebView2()? };
            let webview_13 = webview.cast::<ICoreWebView2_13>()?;
            let profile = unsafe { webview_13.Profile()? }.cast::<ICoreWebView2Profile7>()?;

            let callback_webview = webview.clone();
            let callback_app = app.clone();
            let callback_target = target_url.clone();
            let handler = ProfileAddBrowserExtensionCompletedHandler::create(Box::new(
                move |result, extension| {
                    if result.is_ok() && extension.is_some() {
                        debug_log::record(DebugEventKind::ExtensionInstallSucceeded);
                        match unsafe {
                            callback_webview.Navigate(&HSTRING::from(callback_target.as_str()))
                        } {
                            Ok(()) => {
                                debug_log::record(DebugEventKind::InitialNavigationSucceeded);
                            }
                            Err(error) => {
                                debug_log::record(DebugEventKind::InitialNavigationFailed);
                                show_extension_load_error(
                                    &callback_app,
                                    format!(
                                        "The extension was installed, but FACEIT navigation failed ({error})."
                                    ),
                                );
                            }
                        }
                    } else {
                        debug_log::record(DebugEventKind::ExtensionInstallFailed);
                        show_extension_load_error(
                            &callback_app,
                            format!("WebView2 rejected the bundled extension ({result:?})."),
                        );
                    }
                    Ok(())
                },
            ));

            // AddBrowserExtension expects the exact top-level unpacked
            // extension folder containing manifest.json (not its parent).
            unsafe {
                profile.AddBrowserExtension(&HSTRING::from(extension_root.as_path()), &handler)?;
            }
            Ok(())
        })();

        if let Err(error) = install {
            debug_log::record(DebugEventKind::ExtensionInstallFailed);
            show_extension_load_error(
                &app,
                format!("The WebView2 extension API is unavailable ({error})."),
            );
        }
    });
    if attach_result.is_err() {
        debug_log::record(DebugEventKind::ExtensionInstallFailed);
    }
    attach_result
}

#[cfg(not(windows))]
fn install_extension_then_navigate(
    window: &WebviewWindow<Wry>,
    _app: AppHandle<Wry>,
    _extension_root: PathBuf,
    target_url: &str,
) -> tauri::Result<()> {
    debug_log::record(DebugEventKind::ExtensionInstallRequested);
    let result = window.navigate(target_url.parse().map_err(tauri::Error::InvalidUrl)?);
    match result {
        Ok(()) => {
            debug_log::record(DebugEventKind::ExtensionInstallSucceeded);
            debug_log::record(DebugEventKind::InitialNavigationSucceeded);
        }
        Err(_) => {
            debug_log::record(DebugEventKind::ExtensionInstallFailed);
            debug_log::record(DebugEventKind::InitialNavigationFailed);
        }
    }
    result
}

fn show_extension_load_error(app: &AppHandle<Wry>, detail: String) {
    app.dialog()
        .message(format!(
            "EloScope could not load its FACEIT enhancements. FACEIT was not opened to avoid running an unmodified client.\n\n{detail}\n\nInstall the latest Microsoft Edge WebView2 Runtime and restart EloScope."
        ))
        .title("EloScope extension failed to load")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

fn handle_navigation(
    app: &AppHandle<Wry>,
    decision: NavigationDecision,
    original_url: &str,
) -> bool {
    match decision {
        NavigationDecision::AllowInWebView => {
            debug_log::record(DebugEventKind::NavigationAllowedInWebview);
            true
        }
        NavigationDecision::OpenExternal => {
            debug_log::record(DebugEventKind::NavigationExternalRequested);
            match open::that_detached(original_url) {
                Ok(()) => {
                    debug_log::record(DebugEventKind::NavigationExternalOpenSucceeded);
                }
                Err(_) => {
                    debug_log::record(DebugEventKind::NavigationExternalOpenFailed);
                }
            }
            false
        }
        NavigationDecision::OpenSteam { sanitized_url } => {
            debug_log::record(DebugEventKind::NavigationSteamRequested);
            match open::that_detached(sanitized_url) {
                Ok(()) => {
                    debug_log::record(DebugEventKind::NavigationSteamOpenSucceeded);
                }
                Err(_) => {
                    debug_log::record(DebugEventKind::NavigationSteamOpenFailed);
                }
            }
            false
        }
        NavigationDecision::OpenFaceitAntiCheat { sanitized_url } => {
            debug_log::record(DebugEventKind::NavigationAntiCheatRequested);
            confirm_faceit_anti_cheat_launch(app, sanitized_url);
            false
        }
        NavigationDecision::Deny => {
            debug_log::record(DebugEventKind::NavigationDenied);
            false
        }
    }
}

fn confirm_faceit_anti_cheat_launch(app: &AppHandle<Wry>, sanitized_url: String) {
    if FACEIT_ANTI_CHEAT_PROMPT_OPEN
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        debug_log::record(DebugEventKind::AntiCheatPromptSuppressed);
        return;
    }

    debug_log::record(DebugEventKind::AntiCheatPromptOpened);
    let callback_app = app.clone();
    app.dialog()
        .message("Launch the installed FACEIT Anti-Cheat application?")
        .title("Launch FACEIT Anti-Cheat")
        .buttons(MessageDialogButtons::YesNo)
        .kind(MessageDialogKind::Info)
        .show(move |confirmed| {
            FACEIT_ANTI_CHEAT_PROMPT_OPEN.store(false, Ordering::Release);
            if confirmed {
                debug_log::record(DebugEventKind::AntiCheatLaunchConfirmed);
                if open::that_detached(&sanitized_url).is_err() {
                    debug_log::record(DebugEventKind::AntiCheatLaunchFailed);
                    callback_app
                        .dialog()
                        .message(
                            "Windows could not open FACEIT Anti-Cheat. Install or repair FACEIT AC and try again.",
                        )
                        .title("FACEIT Anti-Cheat failed to launch")
                        .kind(MessageDialogKind::Error)
                        .show(|_| {});
                } else {
                    debug_log::record(DebugEventKind::AntiCheatLaunchSucceeded);
                }
            } else {
                debug_log::record(DebugEventKind::AntiCheatLaunchCancelled);
            }
        });
}

fn handle_popup_request(
    app: &AppHandle<Wry>,
    policy: &SessionPolicy,
    init_script: &str,
    url: url::Url,
    features: NewWindowFeatures,
) -> NewWindowResponse<Wry> {
    match policy.classify(&url, RequestContext::Popup) {
        NavigationDecision::AllowInWebView => {
            debug_log::record(DebugEventKind::PopupAllowedInWebview);
            let label = format!(
                "faceit-popup-{}",
                POPUP_COUNTER.fetch_add(1, Ordering::Relaxed)
            );
            let navigation_policy = policy.clone();
            let navigation_app = app.clone();
            let nested_policy = policy.clone();
            let nested_app = app.clone();
            let nested_init_script = init_script.to_owned();

            let about_blank = "about:blank".parse().expect("about:blank is a valid URL");
            let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::External(about_blank))
                .title("EloScope sign-in")
                // `window_features` also reuses the opener WebView2 environment on
                // Windows. That is the supported way to share cookies and profile
                // state for a NewWindowResponse::Create popup.
                .window_features(features)
                .initialization_script(init_script)
                .devtools(cfg!(debug_assertions))
                .on_navigation(move |popup_url| {
                    handle_navigation(
                        &navigation_app,
                        navigation_policy.classify(popup_url, RequestContext::Popup),
                        popup_url.as_str(),
                    )
                })
                .on_new_window(move |nested_url, nested_features| {
                    handle_popup_request(
                        &nested_app,
                        &nested_policy,
                        &nested_init_script,
                        nested_url,
                        nested_features,
                    )
                })
                .on_download(|_, event| handle_download_event(event))
                .on_document_title_changed(|window, title| {
                    let _ = window.set_title(&title);
                });

            match builder.build() {
                Ok(window) => {
                    debug_log::record(DebugEventKind::PopupCreated);
                    NewWindowResponse::Create { window }
                }
                Err(_) => {
                    debug_log::record(DebugEventKind::PopupCreateFailed);
                    NewWindowResponse::Deny
                }
            }
        }
        decision => {
            debug_log::record(DebugEventKind::PopupNotCreated);
            let _ = handle_navigation(app, decision, url.as_str());
            NewWindowResponse::Deny
        }
    }
}

fn handle_download_event(event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { url, .. } => {
            let allowed = is_safe_download_url(&url);
            debug_log::record(if allowed {
                DebugEventKind::DownloadAllowed
            } else {
                DebugEventKind::DownloadDenied
            });
            allowed
        }
        DownloadEvent::Finished { success, .. } => {
            debug_log::record(if success {
                DebugEventKind::DownloadFinishedSucceeded
            } else {
                DebugEventKind::DownloadFinishedFailed
            });
            true
        }
        _ => {
            debug_log::record(DebugEventKind::DownloadEventIgnored);
            false
        }
    }
}

fn resolve_extension_path(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn Error>> {
    if let Some(path) = std::env::var_os("ELOSCOPE_EXTENSION_PATH") {
        return Ok(PathBuf::from(path));
    }

    if cfg!(debug_assertions) {
        return Ok(Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("extension")
            .join("build"));
    }

    Ok(app.path().resource_dir()?.join("extension"))
}

fn validate_extension(path: &Path) -> Result<(), Box<dyn Error>> {
    let manifest = path.join("manifest.json");
    if !manifest.is_file() {
        return Err(format!(
            "EloScope extension is missing at {}. Build extension/ before starting the client.",
            manifest.display()
        )
        .into());
    }
    Ok(())
}

fn generate_click_nonce() -> std::io::Result<String> {
    let mut bytes = [0_u8; 24];
    fill_random(&mut bytes).map_err(|error| {
        std::io::Error::other(format!("secure random generation failed: {error:?}"))
    })?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn trusted_click_script(nonce: &str) -> String {
    format!(
        r#"
(() => {{
  'use strict';
  const host = location.hostname.toLowerCase().replace(/\.$/, '');
  if (host !== 'faceit.com' && !host.endsWith('.faceit.com')) return;

  document.addEventListener('click', (event) => {{
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[href^="steam://connect/"]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const armedAutoConnect = !event.isTrusted && link.dataset.eloscopeAutoConnect === 'armed';
    if (!event.isTrusted && !armedAutoConnect) return;
    if (armedAutoConnect) delete link.dataset.eloscopeAutoConnect;

    const style = getComputedStyle(link);
    if (link.hidden || link.getClientRects().length === 0 ||
        style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {{
      return;
    }}
    try {{
      const url = new URL(link.href);
      if (url.protocol !== 'steam:' || url.hostname.toLowerCase() !== 'connect') return;
      url.hash = 'eloscope-gesture={nonce}';
      link.href = url.href;
    }} catch {{
      // Malformed protocol links remain untouched and the native policy rejects them.
    }}
  }}, true);
}})();
"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn click_script_is_origin_guarded_and_contains_nonce() {
        let script = trusted_click_script("known-nonce");
        assert!(script.contains("known-nonce"));
        assert!(script.contains("faceit.com"));
        assert!(script.contains("event.isTrusted"));
        assert!(script.contains("eloscopeAutoConnect"));
        assert!(script.contains("steam://connect/"));
    }

    #[test]
    fn extension_bootstrap_does_not_navigate_to_faceit_early() {
        assert_eq!(EXTENSION_BOOTSTRAP_URL, "about:blank");
        assert_ne!(EXTENSION_BOOTSTRAP_URL, FACEIT_HOME);
    }

    #[test]
    fn extension_validation_requires_manifest() {
        let temp = std::env::temp_dir().join(format!(
            "eloscope-extension-validation-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(&temp).expect("create test directory");
        assert!(validate_extension(&temp).is_err());
        fs::write(temp.join("manifest.json"), "{}").expect("write manifest");
        assert!(validate_extension(&temp).is_ok());
        let _ = fs::remove_dir_all(temp);
    }
}

mod debug_log;
mod diagnostics;
mod policy;
mod shell_settings;
mod updater;

use debug_log::DebugEventKind;
use getrandom::fill as fill_random;
use policy::{
    is_safe_download_url, NavigationDecision, RequestContext, SessionPolicy, ShellSettingsRequest,
};
use serde::Deserialize;
use shell_settings::ShellSettings;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::webview::{DownloadEvent, NewWindowFeatures, NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WindowEvent, Wry};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const FACEIT_HOME: &str = "https://www.faceit.com/";
const EXTENSION_BOOTSTRAP_URL: &str = "about:blank";
const EXTENSION_NAME: &str = "EloScope";
const ABOUT_TEXT: &str = "EloScope is an independent enhancement client. It is not affiliated with, sponsored by, or endorsed by FACEIT Ltd. FACEIT and Counter-Strike are trademarks of their respective owners. EloScope can hand Windows the exact official FACEIT Anti-Cheat launch URI after confirmation, but never inspects, injects into, monitors, or modifies Anti-Cheat, CS2 memory, or game processes. No telemetry or remote crash reporting is enabled.";
static POPUP_COUNTER: AtomicU64 = AtomicU64::new(1);
static FACEIT_ANTI_CHEAT_PROMPT_OPEN: AtomicBool = AtomicBool::new(false);

const AUTOSTART_ARGUMENT: &str = "--autostart";
const TRAY_ID: &str = "eloscope-tray";

#[derive(Default)]
struct ShellRuntimeState {
    settings: Mutex<ShellSettings>,
    tray: Mutex<Option<TrayIcon<Wry>>>,
    exiting: AtomicBool,
}

pub fn run() {
    debug_log::record(DebugEventKind::ApplicationStarting);
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !is_autostart_launch(&args) {
                debug_log::record(DebugEventKind::SingleInstanceRestored);
                restore_main_window(app);
            }
        }))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name(EXTENSION_NAME)
                .arg(AUTOSTART_ARGUMENT)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ShellRuntimeState::default())
        .on_window_event(handle_window_event)
        .setup(setup);

    builder
        .run(tauri::generate_context!())
        .expect("EloScope failed to start");
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn Error>> {
    debug_log::record(DebugEventKind::SetupStarted);
    let extension_path = resolve_extension_path(app.handle())?;
    validate_extension(
        &extension_path,
        &app.package_info().version.to_string(),
        env!("CARGO_PKG_VERSION"),
    )?;
    debug_log::record(DebugEventKind::ExtensionManifestValidated);

    let mut runtime_settings = load_shell_settings(app.handle());
    if set_autostart_enabled(app.handle(), runtime_settings.autostart).is_err() {
        debug_log::record(DebugEventKind::ShellSettingsApplyFailed);
    }
    if runtime_settings.minimize_to_tray && set_tray_enabled(app.handle(), true).is_err() {
        debug_log::record(DebugEventKind::ShellSettingsApplyFailed);
        runtime_settings.minimize_to_tray = false;
    }
    set_current_shell_settings(app.handle(), runtime_settings);
    let launch_args = std::env::args().collect::<Vec<_>>();
    let start_hidden = runtime_settings.minimize_to_tray && is_autostart_launch(&launch_args);

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
        .visible(!start_hidden)
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

    updater::start_periodic_checks(app.handle().clone());
    debug_log::record(DebugEventKind::SetupCompleted);
    Ok(())
}

fn load_shell_settings(app: &AppHandle<Wry>) -> ShellSettings {
    let path = match shell_settings_path(app) {
        Ok(path) => path,
        Err(_) => {
            debug_log::record(DebugEventKind::ShellSettingsLoadFailed);
            return ShellSettings::default();
        }
    };

    match shell_settings::load(&path) {
        Ok(settings) => {
            debug_log::record(DebugEventKind::ShellSettingsLoaded);
            settings
        }
        Err(_) => {
            debug_log::record(DebugEventKind::ShellSettingsLoadFailed);
            ShellSettings::default()
        }
    }
}

fn shell_settings_path(app: &AppHandle<Wry>) -> tauri::Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("shell-settings.json"))
}

fn lock_state<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn current_shell_settings(app: &AppHandle<Wry>) -> ShellSettings {
    *lock_state(&app.state::<ShellRuntimeState>().settings)
}

fn set_current_shell_settings(app: &AppHandle<Wry>, settings: ShellSettings) {
    *lock_state(&app.state::<ShellRuntimeState>().settings) = settings;
}

fn is_autostart_launch(args: &[String]) -> bool {
    args.iter().any(|argument| argument == AUTOSTART_ARGUMENT)
}

fn set_autostart_enabled(app: &AppHandle<Wry>, enabled: bool) -> Result<(), Box<dyn Error>> {
    let manager = app.autolaunch();
    if manager.is_enabled()? == enabled {
        return Ok(());
    }
    if enabled {
        manager.enable()?;
    } else {
        manager.disable()?;
    }
    Ok(())
}

fn set_tray_enabled(app: &AppHandle<Wry>, enabled: bool) -> Result<(), Box<dyn Error>> {
    let state = app.state::<ShellRuntimeState>();
    let mut tray_slot = lock_state(&state.tray);
    if let Some(tray) = tray_slot.as_ref() {
        tray.set_visible(enabled)?;
        return Ok(());
    }
    if !enabled {
        return Ok(());
    }

    let menu = MenuBuilder::new(app)
        .text("tray-open", "Open EloScope")
        .text("tray-about", "About EloScope")
        .text("tray-check-updates", "Check for updates")
        .text("tray-export-diagnostics", "Export redacted diagnostics")
        .separator()
        .text("tray-exit", "Exit")
        .build()?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(EXTENSION_NAME)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-open" => restore_main_window(app),
            "tray-about" => show_about_dialog(app),
            "tray-check-updates" => {
                debug_log::record(DebugEventKind::MenuUpdateCheckSelected);
                debug_log::record(DebugEventKind::TrayUpdateCheckSelected);
                updater::check_manually(app.clone());
            }
            "tray-export-diagnostics" => export_diagnostics_report(app),
            "tray-exit" => {
                debug_log::record(DebugEventKind::TrayExitSelected);
                app.state::<ShellRuntimeState>()
                    .exiting
                    .store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                restore_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    *tray_slot = Some(builder.build(app)?);
    Ok(())
}

fn restore_main_window(app: &AppHandle<Wry>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    debug_log::record(DebugEventKind::TrayWindowRestored);
}

fn show_about_dialog(app: &AppHandle<Wry>) {
    debug_log::record(DebugEventKind::MenuAboutSelected);
    app.dialog()
        .message(ABOUT_TEXT)
        .title("About EloScope")
        .kind(MessageDialogKind::Info)
        .show(|_| {});
}

fn export_diagnostics_report(app: &AppHandle<Wry>) {
    debug_log::record(DebugEventKind::MenuDiagnosticsExportSelected);
    let extension_manifest_present = resolve_extension_path(app)
        .map(|path| path.join("manifest.json").is_file())
        .unwrap_or(false);
    match diagnostics::export(app, extension_manifest_present, updater::is_configured()) {
        Ok(path) => {
            debug_log::record(DebugEventKind::DiagnosticsExportSucceeded);
            let parent = path.parent().map(Path::to_path_buf);
            app.dialog()
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
            app.dialog()
                .message("The local diagnostic report could not be written.")
                .title("Diagnostics export failed")
                .kind(MessageDialogKind::Error)
                .show(|_| {});
        }
    }
}

fn handle_window_event(window: &tauri::Window<Wry>, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    let app = window.app_handle();
    let state = app.state::<ShellRuntimeState>();
    if state.exiting.load(Ordering::SeqCst) || !current_shell_settings(app).minimize_to_tray {
        return;
    }

    match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            if window.hide().is_ok() {
                debug_log::record(DebugEventKind::TrayWindowHidden);
            }
        }
        WindowEvent::Resized(_)
            if window.is_minimized().unwrap_or(false) && window.hide().is_ok() =>
        {
            debug_log::record(DebugEventKind::TrayWindowHidden);
        }
        _ => {}
    }
}

fn apply_shell_settings(app: &AppHandle<Wry>, request: ShellSettingsRequest) {
    debug_log::record(DebugEventKind::ShellSettingsApplyRequested);
    let desired = ShellSettings {
        autostart: request.autostart,
        minimize_to_tray: request.minimize_to_tray,
    };

    if try_apply_shell_settings(app, desired).is_ok() {
        debug_log::record(DebugEventKind::ShellSettingsApplySucceeded);
        return;
    }

    debug_log::record(DebugEventKind::ShellSettingsApplyFailed);
    app.dialog()
        .message(
            "EloScope could not apply Windows startup or tray settings. The previous settings are still active.",
        )
        .title("EloScope settings")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

fn try_apply_shell_settings(
    app: &AppHandle<Wry>,
    desired: ShellSettings,
) -> Result<(), Box<dyn Error>> {
    let path = shell_settings_path(app)?;
    let previous = current_shell_settings(app);
    let previous_autostart = app.autolaunch().is_enabled()?;

    set_autostart_enabled(app, desired.autostart)?;
    if let Err(error) = set_tray_enabled(app, desired.minimize_to_tray) {
        let _ = set_autostart_enabled(app, previous_autostart);
        return Err(error);
    }
    if let Err(error) = shell_settings::save(&path, desired) {
        let _ = set_tray_enabled(app, previous.minimize_to_tray);
        let _ = set_autostart_enabled(app, previous_autostart);
        return Err(Box::new(error));
    }

    set_current_shell_settings(app, desired);
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
        NavigationDecision::ApplyShellSettings { settings } => {
            apply_shell_settings(app, settings);
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

#[derive(Deserialize)]
struct BundledExtensionManifest {
    manifest_version: u8,
    name: String,
    version: String,
}

fn expected_extension_version(app_version: &str) -> Result<String, Box<dyn Error>> {
    let (core, beta) = match app_version.split_once("-beta.") {
        Some((core, beta)) => (core, Some(beta)),
        None if !app_version.contains('-') => (app_version, None),
        None => {
            return Err(format!(
                "unsupported EloScope application version for extension mapping: {app_version}"
            )
            .into())
        }
    };
    let components = core
        .split('.')
        .map(str::parse::<u64>)
        .collect::<Result<Vec<_>, _>>()?;
    if components.len() != 3 {
        return Err(format!("invalid EloScope application version: {app_version}").into());
    }

    let extension_patch = match beta {
        Some(beta) => beta.parse::<u64>()?,
        None => components[2],
    };
    Ok(format!(
        "{}.{}.{}",
        components[0], components[1], extension_patch
    ))
}

fn validate_extension(
    path: &Path,
    app_version: &str,
    cargo_version: &str,
) -> Result<(), Box<dyn Error>> {
    let manifest_path = path.join("manifest.json");
    if !manifest_path.is_file() {
        return Err(format!(
            "EloScope extension is missing at {}. Build extension/ before starting the client.",
            manifest_path.display()
        )
        .into());
    }

    if app_version != cargo_version {
        return Err(format!(
            "EloScope application version mismatch: bundle is {app_version}, native package is {cargo_version}."
        )
        .into());
    }

    let manifest: BundledExtensionManifest = serde_json::from_slice(&fs::read(&manifest_path)?)
        .map_err(|error| {
            format!(
                "EloScope extension manifest is invalid at {} ({error}).",
                manifest_path.display()
            )
        })?;
    let expected_version = expected_extension_version(app_version)?;
    if manifest.manifest_version != 3
        || manifest.name != EXTENSION_NAME
        || manifest.version != expected_version
    {
        return Err(format!(
            "EloScope extension bundle mismatch: expected {EXTENSION_NAME} MV3 version {expected_version}, found {} MV{} version {}.",
            manifest.name, manifest.manifest_version, manifest.version
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
  const markNativeShell = () => {{
    if (document.documentElement) {{
      document.documentElement.dataset.eloscopeNativeShell = '1';
    }}
  }};
  markNativeShell();
  document.addEventListener('DOMContentLoaded', markNativeShell, {{ once: true }});

  const armSettingsSave = (button) => {{
    if (button instanceof HTMLButtonElement &&
        button.dataset.eloscopeSettingsSave === 'true') {{
      button.dataset.eloscopeSettingsGesture = '{nonce}';
    }}
  }};

  document.addEventListener('keydown', (event) => {{
    if (!event.isTrusted || event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) return;
    if (!(target instanceof Element)) return;
    if (!target.closest('#eloscope-settings-root')) return;
    const save = document
      .getElementById('eloscope-settings-root')
      ?.shadowRoot
      ?.querySelector('button[data-eloscope-settings-save="true"]');
    armSettingsSave(save);
  }}, true);

  document.addEventListener('click', (event) => {{
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (event.isTrusted) {{
      for (const item of event.composedPath()) {{
        armSettingsSave(item);
      }}
    }}
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
        assert!(validate_extension(&temp, "0.1.0-beta.27", "0.1.0-beta.27").is_err());
        fs::write(
            temp.join("manifest.json"),
            r#"{"manifest_version":3,"name":"EloScope","version":"0.1.27"}"#,
        )
        .expect("write manifest");
        assert!(validate_extension(&temp, "0.1.0-beta.27", "0.1.0-beta.27").is_ok());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn extension_validation_rejects_stale_or_misaligned_bundles() {
        let temp = std::env::temp_dir().join(format!(
            "eloscope-extension-version-validation-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(&temp).expect("create test directory");
        fs::write(
            temp.join("manifest.json"),
            r#"{"manifest_version":3,"name":"EloScope","version":"0.1.18"}"#,
        )
        .expect("write manifest");

        assert!(validate_extension(&temp, "0.1.0-beta.27", "0.1.0-beta.27").is_err());
        assert!(validate_extension(&temp, "0.1.0-beta.18", "0.1.0-beta.17").is_err());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn application_versions_map_to_valid_manifest_versions() {
        assert_eq!(
            expected_extension_version("0.1.0-beta.28").expect("beta mapping"),
            "0.1.28"
        );
        assert_eq!(
            expected_extension_version("1.2.3").expect("stable mapping"),
            "1.2.3"
        );
        assert!(expected_extension_version("0.1.0-alpha.1").is_err());
    }
}

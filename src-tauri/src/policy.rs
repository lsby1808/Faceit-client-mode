use std::sync::Arc;
use url::Url;

const FACEIT_ROOT: &str = "faceit.com";
const FACEIT_ANTI_CHEAT_LAUNCH_URI: &str = "faceitac://launch";
const TRUSTED_AUTH_HOSTS: &[&str] = &[
    "accounts.google.com",
    "appleid.apple.com",
    "discord.com",
    "www.facebook.com",
    "login.live.com",
    "login.microsoftonline.com",
    "login.steampowered.com",
    "steamcommunity.com",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RequestContext {
    MainFrame,
    Popup,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ShellSettingsRequest {
    pub autostart: bool,
    pub minimize_to_tray: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NavigationDecision {
    AllowInWebView,
    OpenExternal,
    OpenSteam { sanitized_url: String },
    OpenFaceitAntiCheat { sanitized_url: String },
    ApplyShellSettings { settings: ShellSettingsRequest },
    Deny,
}

#[derive(Clone)]
pub struct SessionPolicy {
    click_nonce: Arc<str>,
}

impl SessionPolicy {
    pub fn new(click_nonce: String) -> Self {
        Self {
            click_nonce: Arc::from(click_nonce),
        }
    }

    pub fn click_nonce(&self) -> &str {
        &self.click_nonce
    }

    pub fn classify(&self, url: &Url, context: RequestContext) -> NavigationDecision {
        match url.scheme() {
            "https" => {
                let Some(host) = url.host_str() else {
                    return NavigationDecision::Deny;
                };

                if is_faceit_host(host)
                    || (context == RequestContext::Popup && is_trusted_auth_host(host))
                {
                    NavigationDecision::AllowInWebView
                } else {
                    NavigationDecision::OpenExternal
                }
            }
            "http" => NavigationDecision::OpenExternal,
            "about" if context == RequestContext::Popup && url.as_str() == "about:blank" => {
                NavigationDecision::AllowInWebView
            }
            "steam" => self.classify_steam(url),
            "faceitac" if context == RequestContext::MainFrame => classify_faceit_anti_cheat(url),
            "eloscope" if context == RequestContext::MainFrame => self.classify_shell_settings(url),
            _ => NavigationDecision::Deny,
        }
    }

    fn classify_steam(&self, url: &Url) -> NavigationDecision {
        if !is_safe_steam_connect(url) {
            return NavigationDecision::Deny;
        }

        if !self.has_trusted_gesture(url) {
            return NavigationDecision::Deny;
        }

        let mut sanitized = url.clone();
        sanitized.set_fragment(None);
        NavigationDecision::OpenSteam {
            sanitized_url: sanitized.into(),
        }
    }

    fn classify_shell_settings(&self, url: &Url) -> NavigationDecision {
        if !url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("settings"))
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
            || url.path() != "/apply"
            || !self.has_trusted_gesture(url)
        {
            return NavigationDecision::Deny;
        }

        let mut autostart = None;
        let mut minimize_to_tray = None;
        let mut count = 0_u8;
        for (key, value) in url.query_pairs() {
            count = count.saturating_add(1);
            let parsed = match value.as_ref() {
                "0" => false,
                "1" => true,
                _ => return NavigationDecision::Deny,
            };
            match key.as_ref() {
                "autostart" if autostart.is_none() => autostart = Some(parsed),
                "minimize_to_tray" if minimize_to_tray.is_none() => minimize_to_tray = Some(parsed),
                _ => return NavigationDecision::Deny,
            }
        }
        if count != 2 {
            return NavigationDecision::Deny;
        }

        match (autostart, minimize_to_tray) {
            (Some(autostart), Some(minimize_to_tray)) => NavigationDecision::ApplyShellSettings {
                settings: ShellSettingsRequest {
                    autostart,
                    minimize_to_tray,
                },
            },
            _ => NavigationDecision::Deny,
        }
    }

    fn has_trusted_gesture(&self, url: &Url) -> bool {
        url.fragment().is_some_and(|fragment| {
            fragment
                .strip_prefix("eloscope-gesture=")
                .is_some_and(|value| {
                    constant_time_eq(value.as_bytes(), self.click_nonce.as_bytes())
                })
        })
    }
}

fn classify_faceit_anti_cheat(url: &Url) -> NavigationDecision {
    // FACEIT's current web client launches the installed AC with this exact,
    // payload-free URI. Never forward the original value to Windows: the
    // registered protocol handler receives the full string as an argument.
    let exact_launch = url.scheme() == "faceitac"
        && url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("launch"))
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.path().is_empty()
        && url.query().is_none()
        && url.fragment().is_none();

    if exact_launch {
        NavigationDecision::OpenFaceitAntiCheat {
            sanitized_url: FACEIT_ANTI_CHEAT_LAUNCH_URI.to_owned(),
        }
    } else {
        NavigationDecision::Deny
    }
}

pub fn is_faceit_host(host: &str) -> bool {
    let host = host.trim_end_matches('.');
    host.eq_ignore_ascii_case(FACEIT_ROOT)
        || host
            .to_ascii_lowercase()
            .strip_suffix(FACEIT_ROOT)
            .is_some_and(|prefix| prefix.ends_with('.'))
}

/// Preserve native FACEIT downloads while rejecting local, custom-protocol and
/// insecure payloads. WebView2 still requires the page's normal download flow.
pub fn is_safe_download_url(url: &Url) -> bool {
    url.scheme() == "https" && url.host_str().is_some()
}

fn is_trusted_auth_host(host: &str) -> bool {
    let host = host.trim_end_matches('.');
    TRUSTED_AUTH_HOSTS
        .iter()
        .any(|trusted| host.eq_ignore_ascii_case(trusted))
}

fn is_safe_steam_connect(url: &Url) -> bool {
    if url.scheme() != "steam"
        || !url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("connect"))
        || url.username() != ""
        || url.password().is_some()
        || url.query().is_some()
    {
        return false;
    }

    let path = url.path().trim_start_matches('/');
    let mut segments = path.split('/');
    let Some(server) = segments.next() else {
        return false;
    };
    let password = segments.next();
    if segments.next().is_some() || server.is_empty() {
        return false;
    }

    let Some((host, port)) = split_server(server) else {
        return false;
    };
    if !is_safe_server_host(host) || !is_valid_port(port) {
        return false;
    }

    password.is_none_or(|value| {
        !value.is_empty()
            && value.len() <= 128
            && value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
    })
}

fn split_server(server: &str) -> Option<(&str, &str)> {
    if let Some(bracket_end) = server.find("]:") {
        if !server.starts_with('[') {
            return None;
        }
        return Some((&server[..=bracket_end], &server[bracket_end + 2..]));
    }
    server.rsplit_once(':')
}

fn is_safe_server_host(host: &str) -> bool {
    if host.starts_with('[') && host.ends_with(']') {
        return host[1..host.len() - 1]
            .parse::<std::net::Ipv6Addr>()
            .is_ok();
    }

    !host.is_empty()
        && host.len() <= 253
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
        && !host.starts_with('.')
        && !host.ends_with('.')
        && !host.contains("..")
}

fn is_valid_port(port: &str) -> bool {
    port.parse::<u16>().is_ok_and(|port| port != 0)
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy() -> SessionPolicy {
        SessionPolicy::new("test-nonce".to_owned())
    }

    fn url(value: &str) -> Url {
        Url::parse(value).expect("valid test URL")
    }

    #[test]
    fn allows_faceit_and_subdomains_only() {
        let policy = policy();
        for allowed in [
            "https://faceit.com/",
            "https://www.faceit.com/en/players/example",
            "https://api.faceit.com/match/v2/match/id",
        ] {
            assert_eq!(
                policy.classify(&url(allowed), RequestContext::MainFrame),
                NavigationDecision::AllowInWebView
            );
        }

        for lookalike in [
            "https://faceit.com.evil.example/",
            "https://notfaceit.com/",
            "https://faceit.example/",
        ] {
            assert_eq!(
                policy.classify(&url(lookalike), RequestContext::MainFrame),
                NavigationDecision::OpenExternal
            );
        }
    }

    #[test]
    fn auth_origins_are_scoped_to_popups() {
        let google = url("https://accounts.google.com/o/oauth2/v2/auth");
        assert_eq!(
            policy().classify(&google, RequestContext::Popup),
            NavigationDecision::AllowInWebView
        );
        assert_eq!(
            policy().classify(&google, RequestContext::MainFrame),
            NavigationDecision::OpenExternal
        );
    }

    #[test]
    fn fails_closed_for_unknown_and_local_schemes() {
        let policy = policy();
        for denied in [
            "file:///C:/Windows/System32/calc.exe",
            "data:text/html,hello",
            "javascript:alert(1)",
            "ms-settings:privacy",
            "ftp://example.com/file",
        ] {
            assert_eq!(
                policy.classify(&url(denied), RequestContext::MainFrame),
                NavigationDecision::Deny
            );
        }
    }

    #[test]
    fn steam_connect_requires_a_trusted_manual_or_armed_visible_click() {
        let policy = policy();
        let plain = url("steam://connect/127.0.0.1:27015");
        assert_eq!(
            policy.classify(&plain, RequestContext::MainFrame),
            NavigationDecision::Deny
        );

        let clicked = url("steam://connect/127.0.0.1:27015#eloscope-gesture=test-nonce");
        assert_eq!(
            policy.classify(&clicked, RequestContext::MainFrame),
            NavigationDecision::OpenSteam {
                sanitized_url: "steam://connect/127.0.0.1:27015".to_owned()
            }
        );
    }

    #[test]
    fn shell_settings_require_exact_values_and_a_trusted_gesture() {
        let request = url(
            "eloscope://settings/apply?autostart=1&minimize_to_tray=0#eloscope-gesture=test-nonce",
        );
        assert_eq!(
            policy().classify(&request, RequestContext::MainFrame),
            NavigationDecision::ApplyShellSettings {
                settings: ShellSettingsRequest {
                    autostart: true,
                    minimize_to_tray: false,
                }
            }
        );
        assert_eq!(
            policy().classify(&request, RequestContext::Popup),
            NavigationDecision::Deny
        );
    }

    #[test]
    fn rejects_malformed_or_untrusted_shell_settings_requests() {
        for denied in [
            "eloscope://settings/apply?autostart=1&minimize_to_tray=1",
            "eloscope://settings/apply?autostart=1&minimize_to_tray=1#eloscope-gesture=wrong",
            "eloscope://settings/apply?autostart=1#eloscope-gesture=test-nonce",
            "eloscope://settings/apply?autostart=1&autostart=0&minimize_to_tray=1#eloscope-gesture=test-nonce",
            "eloscope://settings/apply?autostart=2&minimize_to_tray=1#eloscope-gesture=test-nonce",
            "eloscope://settings/apply?autostart=1&minimize_to_tray=true#eloscope-gesture=test-nonce",
            "eloscope://settings/apply?autostart=1&minimize_to_tray=1&extra=1#eloscope-gesture=test-nonce",
            "eloscope://other/apply?autostart=1&minimize_to_tray=1#eloscope-gesture=test-nonce",
            "eloscope://settings/other?autostart=1&minimize_to_tray=1#eloscope-gesture=test-nonce",
            "eloscope://user@settings/apply?autostart=1&minimize_to_tray=1#eloscope-gesture=test-nonce",
            "eloscope://settings:123/apply?autostart=1&minimize_to_tray=1#eloscope-gesture=test-nonce",
        ] {
            assert_eq!(
                policy().classify(&url(denied), RequestContext::MainFrame),
                NavigationDecision::Deny,
                "{denied} should be denied"
            );
        }
    }

    #[test]
    fn rejects_unsafe_steam_payloads() {
        let policy = policy();
        for denied in [
            "steam://run/730",
            "steam://connect/127.0.0.1",
            "steam://connect/127.0.0.1:0",
            "steam://connect/127.0.0.1:70000",
            "steam://connect/127.0.0.1:27015/password/extra",
            "steam://connect/127.0.0.1:27015?launch=calc",
        ] {
            assert_eq!(
                policy.classify(&url(denied), RequestContext::MainFrame),
                NavigationDecision::Deny,
                "{denied} should be denied"
            );
        }
    }

    #[test]
    fn faceit_anti_cheat_launch_is_exact_and_main_frame_only() {
        let launch = url("faceitac://launch");
        assert_eq!(
            policy().classify(&launch, RequestContext::MainFrame),
            NavigationDecision::OpenFaceitAntiCheat {
                sanitized_url: "faceitac://launch".to_owned()
            }
        );
        assert_eq!(
            policy().classify(&launch, RequestContext::Popup),
            NavigationDecision::Deny
        );
    }

    #[test]
    fn rejects_faceit_anti_cheat_commands_and_payloads() {
        let policy = policy();
        for denied in [
            "faceitac:launch",
            "faceitac://other",
            "faceitac://launch/",
            "faceitac://launch/extra",
            "faceitac://user@launch",
            "faceitac://user:password@launch",
            "faceitac://launch:28338",
            "faceitac://launch?command=other",
            "faceitac://launch#fragment",
        ] {
            assert_eq!(
                policy.classify(&url(denied), RequestContext::MainFrame),
                NavigationDecision::Deny,
                "{denied} should be denied"
            );
        }
    }

    #[test]
    fn popup_about_blank_is_the_only_non_https_popup_navigation() {
        assert_eq!(
            policy().classify(&url("about:blank"), RequestContext::Popup),
            NavigationDecision::AllowInWebView
        );
        assert_eq!(
            policy().classify(&url("about:blank"), RequestContext::MainFrame),
            NavigationDecision::Deny
        );
    }

    #[test]
    fn downloads_allow_https_only() {
        assert!(is_safe_download_url(&url(
            "https://cdn.example.test/demo.dem.gz"
        )));
        for denied in [
            "http://example.test/file.exe",
            "file:///C:/Windows/win.ini",
            "data:text/plain,secret",
            "steam://connect/127.0.0.1:27015",
        ] {
            assert!(!is_safe_download_url(&url(denied)), "{denied}");
        }
    }
}

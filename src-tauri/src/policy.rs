use std::sync::Arc;
use url::Url;

const FACEIT_ROOT: &str = "faceit.com";
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NavigationDecision {
    AllowInWebView,
    OpenExternal,
    OpenSteam { sanitized_url: String },
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
            _ => NavigationDecision::Deny,
        }
    }

    fn classify_steam(&self, url: &Url) -> NavigationDecision {
        if !is_safe_steam_connect(url) {
            return NavigationDecision::Deny;
        }

        let trusted_click = url.fragment().is_some_and(|fragment| {
            fragment
                .strip_prefix("eloscope-gesture=")
                .is_some_and(|value| {
                    constant_time_eq(value.as_bytes(), self.click_nonce.as_bytes())
                })
        });

        if !trusted_click {
            return NavigationDecision::Deny;
        }

        let mut sanitized = url.clone();
        sanitized.set_fragment(None);
        NavigationDecision::OpenSteam {
            sanitized_url: sanitized.into(),
        }
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

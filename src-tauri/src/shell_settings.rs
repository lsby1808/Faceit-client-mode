use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::Path;

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(default)]
pub(crate) struct ShellSettings {
    pub(crate) autostart: bool,
    pub(crate) minimize_to_tray: bool,
}

pub(crate) fn load(path: &Path) -> io::Result<ShellSettings> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(ShellSettings::default()),
        Err(error) => Err(error),
    }
}

pub(crate) fn save(path: &Path, settings: ShellSettings) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(&settings)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    fs::write(path, bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "eloscope-shell-settings-{}-{name}.json",
            std::process::id()
        ))
    }

    #[test]
    fn missing_file_uses_safe_disabled_defaults() {
        let path = temp_file("missing");
        let _ = fs::remove_file(&path);
        assert_eq!(
            load(&path).expect("load defaults"),
            ShellSettings::default()
        );
    }

    #[test]
    fn settings_round_trip_without_unrelated_data() {
        let path = temp_file("round-trip");
        let _ = fs::remove_file(&path);
        let expected = ShellSettings {
            autostart: true,
            minimize_to_tray: true,
        };

        save(&path, expected).expect("save settings");
        assert_eq!(load(&path).expect("load settings"), expected);

        let value: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).expect("read settings file"))
                .expect("parse settings file");
        assert_eq!(
            value,
            serde_json::json!({
                "autostart": true,
                "minimize_to_tray": true
            })
        );
        let _ = fs::remove_file(path);
    }

    #[test]
    fn malformed_file_fails_closed() {
        let path = temp_file("malformed");
        fs::write(&path, b"not-json").expect("write malformed settings");
        assert_eq!(
            load(&path)
                .expect_err("malformed settings must fail")
                .kind(),
            io::ErrorKind::InvalidData
        );
        let _ = fs::remove_file(path);
    }
}

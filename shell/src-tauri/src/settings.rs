// settings.rs — sigil-shell daemon connection settings.
//
// Loaded from $XDG_CONFIG_HOME/sigil-shell/daemon-settings.json at startup.
// Falls back to Unix transport with auto-detected socket path if absent.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Which transport the shell should use to connect to sigild.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Transport {
    Unix,
    Tcp,
}

impl Default for Transport {
    fn default() -> Self {
        Transport::Unix
    }
}

/// Persisted connection settings for the daemon.
///
/// Stored at `$XDG_CONFIG_HOME/sigil-shell/daemon-settings.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonSettings {
    /// Which transport to use.
    #[serde(default)]
    pub transport: Transport,

    /// Override for the Unix socket path. If None, the default
    /// `/run/user/$UID/sigild.sock` is used.
    #[serde(default)]
    pub unix_socket_path: Option<String>,

    /// Path to the credential JSON file for TCP transport.
    #[serde(default)]
    pub tcp_credential_path: Option<String>,

    /// Override `server_addr` from the credential file.
    #[serde(default)]
    pub tcp_addr_override: Option<String>,
}

impl Default for DaemonSettings {
    fn default() -> Self {
        Self {
            transport: Transport::Unix,
            unix_socket_path: None,
            tcp_credential_path: None,
            tcp_addr_override: None,
        }
    }
}

impl DaemonSettings {
    /// Loads settings from `$XDG_CONFIG_HOME/sigil-shell/daemon-settings.json`.
    ///
    /// Returns the default (Unix transport) if the file is absent or cannot
    /// be parsed, ensuring the shell always starts successfully.
    pub fn load() -> Self {
        let path = Self::settings_path();
        let data = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => return Self::default(),
        };
        serde_json::from_str(&data).unwrap_or_default()
    }

    fn settings_path() -> PathBuf {
        let base = std::env::var("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                std::env::var("HOME")
                    .map(|h| PathBuf::from(h).join(".config"))
                    .unwrap_or_else(|_| PathBuf::from("/tmp"))
            });
        base.join("sigil-shell").join("daemon-settings.json")
    }
}

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window_class: Option<String>,
    /// "inline" opens within the shell frame, "external" spawns a window.
    #[serde(default = "default_mode")]
    pub mode: String,
}

fn default_mode() -> String {
    "external".into()
}

#[derive(Debug, Serialize, Deserialize)]
struct AppListConfig {
    apps: Vec<AppConfig>,
}

fn config_path() -> PathBuf {
    let config_dir = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
            PathBuf::from(home).join(".config")
        });
    config_dir.join("sigil-shell").join("apps.json")
}

fn default_apps() -> Vec<AppConfig> {
    vec![
        AppConfig {
            id: "terminal".into(),
            name: "Terminal".into(),
            icon: "terminal".into(),
            command: "".into(),
            args: vec![],
            window_class: None,
            mode: "inline".into(),
        },
        AppConfig {
            id: "editor".into(),
            name: "VS Code".into(),
            icon: "editor".into(),
            command: "".into(),
            args: vec![],
            window_class: None,
            mode: "inline".into(),
        },
        AppConfig {
            id: "git".into(),
            name: "lazygit".into(),
            icon: "git".into(),
            command: "lazygit".into(),
            args: vec![],
            window_class: None,
            mode: "inline".into(),
        },
        AppConfig {
            id: "browser".into(),
            name: "Browser".into(),
            icon: "browser".into(),
            command: "".into(),
            args: vec![],
            window_class: None,
            mode: "inline".into(),
        },
        AppConfig {
            id: "events".into(),
            name: "Events".into(),
            icon: "events".into(),
            command: "".into(),
            args: vec![],
            window_class: None,
            mode: "inline".into(),
        },
    ]
}

#[tauri::command]
pub fn load_app_config() -> Vec<AppConfig> {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str::<AppListConfig>(&contents)
            .map(|c| c.apps)
            .unwrap_or_else(|_| default_apps()),
        Err(_) => default_apps(),
    }
}

#[tauri::command]
pub fn save_app_config(apps: Vec<AppConfig>) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create config dir: {e}"))?;
    }
    let config = AppListConfig { apps };
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("serialize config: {e}"))?;
    fs::write(&path, json)
        .map_err(|e| format!("write config: {e}"))?;
    Ok(())
}

/// Try to focus a window by Hyprland window class. Returns true if a window was focused.
#[cfg(target_os = "linux")]
fn try_focus_window(window_class: &str) -> bool {
    if window_class.is_empty() {
        return false;
    }
    // Query hyprctl for clients matching this class
    let output = Command::new("hyprctl")
        .args(["clients", "-j"])
        .output();

    let Ok(output) = output else { return false };
    if !output.status.success() {
        return false;
    }

    let Ok(text) = String::from_utf8(output.stdout) else { return false };
    let Ok(clients) = serde_json::from_str::<Vec<serde_json::Value>>(&text) else {
        return false;
    };

    // Check if any client has the matching class
    let has_match = clients.iter().any(|c| {
        c.get("class")
            .and_then(|v| v.as_str())
            .is_some_and(|cls| cls.eq_ignore_ascii_case(window_class))
    });

    if !has_match {
        return false;
    }

    // Focus the window
    let sig = match std::env::var("HYPRLAND_INSTANCE_SIGNATURE") {
        Ok(s) => s,
        Err(_) => return false,
    };
    let xdg_runtime = std::env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| "/tmp".into());
    let socket_path = format!("{}/hypr/{}/.socket.sock", xdg_runtime, sig);
    let socket_path = if std::path::Path::new(&socket_path).exists() {
        socket_path
    } else {
        format!("/tmp/hypr/{}/.socket.sock", sig)
    };

    use std::io::Write;
    use std::os::unix::net::UnixStream;

    let Ok(mut stream) = UnixStream::connect(&socket_path) else { return false };
    let cmd = format!("dispatch focuswindow class:{}", window_class);
    stream.write_all(cmd.as_bytes()).is_ok()
}

#[cfg(not(target_os = "linux"))]
fn try_focus_window(_window_class: &str) -> bool {
    false
}

fn spawn_detached(command: &str, args: &[String], cwd: Option<&str>) -> Result<(), String> {
    let mut cmd = Command::new(command);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    cmd.spawn().map_err(|e| format!("launch {command}: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn launch_app(command: String, args: Vec<String>, cwd: Option<String>) -> Result<(), String> {
    spawn_detached(&command, &args, cwd.as_deref())
}

#[tauri::command]
pub fn focus_or_launch(
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    window_class: Option<String>,
) -> Result<(), String> {
    if let Some(ref wc) = window_class {
        if try_focus_window(wc) {
            return Ok(());
        }
    }
    spawn_detached(&command, &args, cwd.as_deref())
}

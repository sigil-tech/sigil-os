use std::process::Command;

use tauri::{AppHandle, State};

use crate::pty::{open_pty, PtyMap};

/// Spawns nvim in a PTY, sharing the same PTY map as the terminal.
#[tauri::command]
pub fn spawn_editor(
    app: AppHandle,
    state: State<'_, PtyMap>,
    file_path: Option<String>,
) -> Result<String, String> {
    let cols: u16 = 220;
    let rows: u16 = 50;

    match &file_path {
        Some(fp) => open_pty(&app, &state, "nvim", &[fp.as_str()], cols, rows),
        None => open_pty(&app, &state, "nvim", &[], cols, rows),
    }
}

/// Launch an external editor (VS Code, Codium, IntelliJ, etc.) as a detached process.
/// Returns immediately — the editor runs independently of sigil-shell.
#[tauri::command]
pub fn launch_external_editor(editor: String, path: Option<String>) -> Result<(), String> {
    let mut cmd = Command::new(&editor);
    if let Some(p) = &path {
        cmd.arg(p);
    }

    // Detach so the editor outlives any potential shell restart
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    cmd.spawn().map_err(|e| format!("launch {editor}: {e}"))?;
    Ok(())
}

/// List external editors available on the system.
#[tauri::command]
pub fn detect_editors() -> Vec<EditorInfo> {
    let candidates = [
        ("code", "VS Code"),
        ("codium", "VSCodium"),
        ("idea", "IntelliJ IDEA"),
        ("webstorm", "WebStorm"),
        ("goland", "GoLand"),
        ("nvim", "Neovim"),
        ("vim", "Vim"),
    ];

    candidates
        .iter()
        .filter_map(|(bin, name)| {
            which(bin).map(|path| EditorInfo {
                id: bin.to_string(),
                name: name.to_string(),
                path,
            })
        })
        .collect()
}

#[derive(serde::Serialize)]
pub struct EditorInfo {
    pub id: String,
    pub name: String,
    pub path: String,
}

fn which(bin: &str) -> Option<String> {
    Command::new("which")
        .arg(bin)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

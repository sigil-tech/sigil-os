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

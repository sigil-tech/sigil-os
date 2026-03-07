// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod containers;
mod daemon_client;
mod editor;
mod git;
mod hyprland;
mod pty;

use daemon_client::DaemonClient;
use pty::PtyMap;
use tauri::Manager;

fn main() {
    let client = DaemonClient::new().into_shared();
    let pty_map = PtyMap::new();

    // Read optional theme CSS for injection at startup.
    // Uses XDG_CONFIG_HOME or falls back to ~/.config.
    let theme_css = std::env::var("XDG_CONFIG_HOME")
        .ok()
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join(".config")))
        .map(|d| d.join("aether-shell").join("theme.css"))
        .and_then(|p| std::fs::read_to_string(p).ok());

    tauri::Builder::default()
        .manage(client)
        .manage(pty_map)
        .setup(move |app| {
            if let Some(css) = theme_css {
                let windows: std::collections::HashMap<String, tauri::WebviewWindow> = app.webview_windows();
                if let Some(window) = windows.values().next() {
                    let escaped = css.replace('\\', "\\\\").replace('`', "\\`");
                    let js = format!(
                        "const s = document.createElement('style'); s.textContent = `{}`; document.head.appendChild(s);",
                        escaped
                    );
                    let _ = window.eval(&js);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Daemon client
            daemon_client::daemon_status,
            daemon_client::daemon_events,
            daemon_client::daemon_suggestions,
            daemon_client::daemon_files,
            daemon_client::daemon_commands,
            daemon_client::daemon_patterns,
            daemon_client::daemon_trigger_summary,
            daemon_client::daemon_feedback,
            daemon_client::daemon_ai_query,
            daemon_client::daemon_view_changed,
            daemon_client::daemon_undo,
            // PTY
            pty::spawn_pty,
            pty::pty_write,
            pty::pty_resize,
            // Editor
            editor::spawn_editor,
            // Git
            git::git_log,
            git::git_status,
            git::git_diff,
            git::git_branch,
            // Hyprland
            hyprland::pop_out_tool,
            // Containers
            containers::containers_list,
            containers::container_start,
            containers::container_stop,
            containers::container_restart,
            containers::container_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

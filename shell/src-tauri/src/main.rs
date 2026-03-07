// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod containers;
mod daemon_client;
mod editor;
mod git;
mod pty;

use daemon_client::DaemonClient;
use pty::PtyMap;

fn main() {
    let client = DaemonClient::new().into_shared();
    let pty_map = PtyMap::new();

    tauri::Builder::default()
        .manage(client)
        .manage(pty_map)
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

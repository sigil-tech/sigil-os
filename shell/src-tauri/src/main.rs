// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser;
mod containers;
mod cwd;
mod daemon_client;
mod editor;
mod git;
mod hyprland;
mod pty;

use browser::BrowserState;
use daemon_client::DaemonClient;
use pty::PtyMap;
use tauri::Manager;

fn main() {
    let client = DaemonClient::new().into_shared();
    let pty_map = PtyMap::new();

    // Read optional theme CSS for injection at startup.
    // Checks /etc/sigil-shell/theme.css (NixOS module output) first,
    // then XDG_CONFIG_HOME/sigil-shell/theme.css as fallback.
    let theme_css = std::fs::read_to_string("/etc/sigil-shell/theme.css")
        .ok()
        .or_else(|| {
            std::env::var("XDG_CONFIG_HOME")
                .ok()
                .map(std::path::PathBuf::from)
                .or_else(|| std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join(".config")))
                .map(|d| d.join("sigil-shell").join("theme.css"))
                .and_then(|p| std::fs::read_to_string(p).ok())
        });

    tauri::Builder::default()
        .manage(client)
        .manage(pty_map)
        .manage(BrowserState::new())
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

            // Spawn background threads that subscribe to daemon push events
            // and re-emit them as Tauri events for the frontend.
            let uid = daemon_client::get_uid();
            let socket_path = format!("/run/user/{}/sigild.sock", uid);
            daemon_client::subscribe_suggestions(app.handle().clone(), socket_path.clone());
            daemon_client::subscribe_actuations(app.handle().clone(), socket_path);

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
            daemon_client::daemon_purge,
            daemon_client::daemon_ai_query,
            daemon_client::daemon_view_changed,
            daemon_client::daemon_undo,
            daemon_client::daemon_fleet_preview,
            daemon_client::daemon_fleet_opt_out,
            daemon_client::daemon_config,
            daemon_client::daemon_sessions,
            daemon_client::daemon_actions,
            daemon_client::daemon_fleet_policy,
            // CWD
            cwd::get_cwd,
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
            // Browser
            browser::browser_create,
            browser::browser_navigate,
            browser::browser_back,
            browser::browser_forward,
            browser::browser_reload,
            browser::browser_show,
            browser::browser_hide,
            browser::browser_get_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

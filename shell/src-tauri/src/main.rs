// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod apps;
mod cwd;
mod daemon_client;
mod editor;
mod files;
mod git;
mod hyprland;
mod pty;
#[cfg(target_os = "macos")]
mod remote_pty;
mod settings;

use cwd::CwdTracker;
use daemon_client::DaemonClient;
use pty::PtyMap;
use settings::{DaemonSettings, Transport};
use tauri::Manager;

fn main() {
    // Load daemon connection settings; falls back to Unix defaults if absent.
    let daemon_settings = DaemonSettings::load();

    // Build the DaemonClient based on transport settings.
    let client = {
        let mut c = match &daemon_settings.transport {
            Transport::Unix => {
                if let Some(path) = &daemon_settings.unix_socket_path {
                    DaemonClient::with_path(path.clone())
                } else {
                    DaemonClient::new()
                }
            }
            Transport::Tcp => DaemonClient::new(), // connect_tcp called below
        };
        if daemon_settings.transport == Transport::Tcp {
            if let Some(cred_path) = &daemon_settings.tcp_credential_path {
                let addr = daemon_settings.tcp_addr_override.clone().unwrap_or_default();
                if let Err(e) = c.connect_tcp(&addr, cred_path) {
                    eprintln!("sigil-shell: TCP connect failed at startup: {}", e);
                    eprintln!("sigil-shell: will retry on first daemon call");
                }
            } else {
                eprintln!("sigil-shell: transport=tcp but no tcp_credential_path set");
            }
        }
        c.into_shared()
    };

    let pty_map = PtyMap::new();
    let cwd_tracker = CwdTracker::new();

    // Read optional theme CSS for injection at startup.
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

    // Determine socket path and TCP subscribe params for background threads.
    let uid = daemon_client::get_uid();
    let unix_socket_path = daemon_settings
        .unix_socket_path
        .clone()
        .unwrap_or_else(|| format!("/run/user/{}/sigild.sock", uid));
    let tcp_cred_path = if daemon_settings.transport == Transport::Tcp {
        daemon_settings.tcp_credential_path.clone()
    } else {
        None
    };
    let tcp_addr_override = daemon_settings.tcp_addr_override.clone();

    let mut builder = tauri::Builder::default()
        .manage(client)
        .manage(pty_map)
        .manage(cwd_tracker);

    // macOS-only: register remote PTY state
    #[cfg(target_os = "macos")]
    {
        builder = builder.manage(remote_pty::RemotePtyMap::new());
    }

    let mut app_builder = builder
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

            daemon_client::subscribe_suggestions(
                app.handle().clone(),
                unix_socket_path.clone(),
                tcp_cred_path.clone(),
                tcp_addr_override.clone(),
            );
            daemon_client::subscribe_actuations(
                app.handle().clone(),
                unix_socket_path,
                tcp_cred_path,
                tcp_addr_override,
            );

            Ok(())
        });

    #[cfg(not(target_os = "macos"))]
    {
        app_builder = app_builder.invoke_handler(tauri::generate_handler![
            // Daemon client
            daemon_client::get_connection_status,
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
            daemon_client::daemon_set_level,
            // CWD
            cwd::get_cwd,
            cwd::set_active_pty,
            cwd::navigate_to,
            // PTY
            pty::spawn_pty,
            pty::pty_write,
            pty::pty_resize,
            // Editor
            editor::spawn_editor,
            editor::launch_external_editor,
            editor::detect_editors,
            // Git (used by CWD tracker for repo detection)
            git::git_log,
            git::git_status,
            git::git_diff,
            git::git_branch,
            // Hyprland
            hyprland::pop_out_tool,
            // Files
            files::list_directory,
            files::read_file,
            files::write_file,
            // Apps
            apps::load_app_config,
            apps::save_app_config,
            apps::launch_app,
            apps::focus_or_launch,
        ]);
    }

    #[cfg(target_os = "macos")]
    {
        app_builder = app_builder.invoke_handler(tauri::generate_handler![
            // Daemon client
            daemon_client::get_connection_status,
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
            daemon_client::daemon_set_level,
            // CWD
            cwd::get_cwd,
            cwd::set_active_pty,
            cwd::navigate_to,
            // PTY
            pty::spawn_pty,
            pty::pty_write,
            pty::pty_resize,
            // Editor
            editor::spawn_editor,
            editor::launch_external_editor,
            editor::detect_editors,
            // Git
            git::git_log,
            git::git_status,
            git::git_diff,
            git::git_branch,
            // Hyprland (stub on macOS)
            hyprland::pop_out_tool,
            // Files
            files::list_directory,
            files::read_file,
            files::write_file,
            // Apps
            apps::load_app_config,
            apps::save_app_config,
            apps::launch_app,
            apps::focus_or_launch,
            // Remote PTY (macOS only)
            remote_pty::spawn_remote_pty,
            remote_pty::remote_pty_write,
            remote_pty::remote_pty_resize,
        ]);
    }

    app_builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

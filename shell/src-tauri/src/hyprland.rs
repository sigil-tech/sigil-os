use std::env;
use std::io::Write;
use std::os::unix::net::UnixStream;

/// Sends a Hyprland dispatch command via the Hyprland IPC socket.
fn hyprland_dispatch(cmd: &str) -> Result<(), String> {
    let sig = env::var("HYPRLAND_INSTANCE_SIGNATURE")
        .map_err(|_| "HYPRLAND_INSTANCE_SIGNATURE not set".to_string())?;
    // Hyprland >=0.40 uses XDG_RUNTIME_DIR/hypr/, older uses /tmp/hypr/
    let xdg_runtime = env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| "/tmp".to_string());
    let socket_path = format!("{}/hypr/{}/.socket.sock", xdg_runtime, sig);
    // Fall back to legacy path if XDG path doesn't exist
    let socket_path = if std::path::Path::new(&socket_path).exists() {
        socket_path
    } else {
        format!("/tmp/hypr/{}/.socket.sock", sig)
    };
    let mut stream = UnixStream::connect(&socket_path)
        .map_err(|e| format!("connect to Hyprland socket: {}", e))?;
    let frame = format!("dispatch {}", cmd);
    stream.write_all(frame.as_bytes())
        .map_err(|e| format!("write to Hyprland socket: {}", e))?;
    Ok(())
}

/// Pops the current tool out into a new Hyprland floating window.
/// For terminal/editor: spawns a new terminal with the current PTY's shell.
/// For other tools: spawns a new sigil-shell instance in that tool's view.
#[tauri::command]
pub fn pop_out_tool(tool: String) -> Result<(), String> {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    match tool.as_str() {
        "terminal" | "editor" => {
            hyprland_dispatch(&format!("exec foot --app-id sigil-popout {}", shell))?;
        }
        _ => {
            hyprland_dispatch("exec foot --app-id sigil-popout -e sigilctl status")?;
        }
    }
    hyprland_dispatch("exec hyprctl --batch 'keyword windowrulev2 float,class:sigil-popout'")?;
    Ok(())
}

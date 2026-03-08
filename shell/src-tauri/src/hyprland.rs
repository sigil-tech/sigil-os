use std::env;
use std::io::Write;
use std::os::unix::net::UnixStream;

/// Sends a Hyprland dispatch command via the Hyprland IPC socket.
fn hyprland_dispatch(cmd: &str) -> Result<(), String> {
    let sig = env::var("HYPRLAND_INSTANCE_SIGNATURE")
        .map_err(|_| "HYPRLAND_INSTANCE_SIGNATURE not set".to_string())?;
    let socket_path = format!("/tmp/hypr/{}/.socket.sock", sig);
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
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    match tool.as_str() {
        "terminal" | "editor" => {
            hyprland_dispatch(&format!("exec kitty --class sigil-popout {}", shell))?;
        }
        _ => {
            hyprland_dispatch("exec kitty --class sigil-popout sigilctl status")?;
        }
    }
    hyprland_dispatch("exec hyprctl --batch 'keyword windowrulev2 float,class:sigil-popout'")?;
    Ok(())
}

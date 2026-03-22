use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

struct PtyInstance {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    #[allow(dead_code)]
    child: Box<dyn portable_pty::Child + Send>,
}

pub struct PtyMap(Arc<Mutex<HashMap<String, PtyInstance>>>);

impl PtyMap {
    pub fn new() -> Self {
        PtyMap(Arc::new(Mutex::new(HashMap::new())))
    }
}

/// Resolve the initial working directory for new PTY sessions.
fn resolve_cwd() -> String {
    // Priority: SIGIL_CWD env > ~/workspace > HOME
    if let Ok(cwd) = std::env::var("SIGIL_CWD") {
        if std::path::Path::new(&cwd).is_dir() {
            return cwd;
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let workspace = format!("{home}/workspace");
        if std::path::Path::new(&workspace).is_dir() {
            return workspace;
        }
        return home;
    }
    "/".to_string()
}

/// Internal helper shared by spawn_pty and spawn_editor.
pub fn open_pty(
    app: &AppHandle,
    pty_map: &PtyMap,
    program: &str,
    args: &[&str],
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let pty_id = Uuid::new_v4().to_string();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("openpty: {e}"))?;

    let mut cmd = CommandBuilder::new(program);
    for arg in args {
        cmd.arg(arg);
    }

    // Set the working directory so the shell starts in the right place.
    let cwd = resolve_cwd();
    cmd.cwd(&cwd);

    // Ensure the child inherits the current environment (PATH, HOME, etc.).
    // On NixOS, PATH includes /run/current-system/sw/bin which is essential.
    for (key, value) in std::env::vars() {
        cmd.env(key, value);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| format!("spawn: {e}"))?;

    let writer = pair.master.take_writer().map_err(|e| format!("take_writer: {e}"))?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| format!("clone_reader: {e}"))?;

    let id_clone = pty_id.clone();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("pty-output-{id_clone}"), data);
                }
                Err(_) => break,
            }
        }
    });

    pty_map.0.lock().unwrap().insert(
        pty_id.clone(),
        PtyInstance { master: pair.master, writer, child },
    );
    Ok(pty_id)
}

/// Spawns a PTY running the user's shell as a login shell.
#[tauri::command]
pub fn spawn_pty(
    app: AppHandle,
    state: State<'_, PtyMap>,
    shell: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let shell_bin = shell.unwrap_or_else(|| {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    });
    // Pass -l to start as a login shell (sources .zshrc/.bashrc, sets PATH).
    open_pty(&app, &state, &shell_bin, &["-l"], cols, rows)
}

/// Writes data to the PTY's stdin.
#[tauri::command]
pub fn pty_write(
    state: State<'_, PtyMap>,
    pty_id: String,
    data: String,
) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    let inst = map.get_mut(&pty_id).ok_or_else(|| format!("PTY {pty_id} not found"))?;
    inst.writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("write: {e}"))?;
    inst.writer
        .flush()
        .map_err(|e| format!("flush: {e}"))?;
    Ok(())
}

/// Resizes the PTY window.
#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyMap>,
    pty_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    let inst = map.get(&pty_id).ok_or_else(|| format!("PTY {pty_id} not found"))?;
    inst.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("resize: {e}"))?;
    Ok(())
}

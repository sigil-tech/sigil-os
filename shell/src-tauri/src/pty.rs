use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const LOG_PATH: &str = "/tmp/sigil-pty-debug.log";

fn debug_log(msg: &str) {
    use std::io::Write as _;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(LOG_PATH)
    {
        let _ = writeln!(f, "[{timestamp}] {msg}");
    }
}

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
    let cwd = resolve_cwd();

    debug_log(&format!(
        "open_pty: id={pty_id} program={program} args={args:?} cols={cols} rows={rows} cwd={cwd}"
    ));

    // Check if program exists
    let program_path = std::path::Path::new(program);
    debug_log(&format!(
        "open_pty: program_exists={} program_is_absolute={}",
        program_path.exists(),
        program_path.is_absolute()
    ));

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| {
            debug_log(&format!("open_pty: openpty FAILED: {e}"));
            format!("openpty: {e}")
        })?;

    debug_log("open_pty: openpty succeeded");

    let mut cmd = CommandBuilder::new(program);
    for arg in args {
        cmd.arg(arg);
    }
    cmd.cwd(&cwd);

    // Inherit full environment
    for (key, value) in std::env::vars() {
        cmd.env(key, value);
    }
    cmd.env("TERM", "xterm-256color");

    // Log key env vars
    debug_log(&format!(
        "open_pty: SHELL={} HOME={} PATH={}",
        std::env::var("SHELL").unwrap_or_else(|_| "(unset)".into()),
        std::env::var("HOME").unwrap_or_else(|_| "(unset)".into()),
        std::env::var("PATH").unwrap_or_else(|_| "(unset)".into()),
    ));

    let child = pair.slave.spawn_command(cmd).map_err(|e| {
        debug_log(&format!("open_pty: spawn_command FAILED: {e}"));
        format!("spawn: {e}")
    })?;

    debug_log(&format!("open_pty: child spawned, pid={}", child.process_id().unwrap_or(0)));

    let writer = pair.master.take_writer().map_err(|e| {
        debug_log(&format!("open_pty: take_writer FAILED: {e}"));
        format!("take_writer: {e}")
    })?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| {
        debug_log(&format!("open_pty: clone_reader FAILED: {e}"));
        format!("clone_reader: {e}")
    })?;

    debug_log("open_pty: writer and reader obtained, starting reader thread");

    let id_clone = pty_id.clone();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        debug_log(&format!("reader_thread[{id_clone}]: started"));
        let mut buf = [0u8; 4096];
        let mut total_bytes: u64 = 0;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    debug_log(&format!(
                        "reader_thread[{id_clone}]: EOF after {total_bytes} total bytes"
                    ));
                    break;
                }
                Ok(n) => {
                    total_bytes += n as u64;
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let emit_result = app_clone.emit(&format!("pty-output-{id_clone}"), &data);
                    if total_bytes <= 4096 {
                        // Log first chunk of output for debugging
                        let preview = if data.len() > 80 {
                            format!("{}...", &data[..80])
                        } else {
                            data.clone()
                        };
                        debug_log(&format!(
                            "reader_thread[{id_clone}]: read {n} bytes, emit={emit_result:?}, preview={preview:?}"
                        ));
                    }
                }
                Err(e) => {
                    debug_log(&format!(
                        "reader_thread[{id_clone}]: read error after {total_bytes} bytes: {e}"
                    ));
                    break;
                }
            }
        }
    });

    pty_map.0.lock().unwrap().insert(
        pty_id.clone(),
        PtyInstance { master: pair.master, writer, child },
    );

    debug_log(&format!("open_pty: SUCCESS id={pty_id}"));
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
    debug_log(&format!("spawn_pty: shell_bin={shell_bin} cols={cols} rows={rows}"));
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
    let inst = map.get_mut(&pty_id).ok_or_else(|| {
        debug_log(&format!("pty_write: PTY {pty_id} NOT FOUND"));
        format!("PTY {pty_id} not found")
    })?;
    inst.writer
        .write_all(data.as_bytes())
        .map_err(|e| {
            debug_log(&format!("pty_write: write error: {e}"));
            format!("write: {e}")
        })?;
    inst.writer
        .flush()
        .map_err(|e| {
            debug_log(&format!("pty_write: flush error: {e}"));
            format!("flush: {e}")
        })?;
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

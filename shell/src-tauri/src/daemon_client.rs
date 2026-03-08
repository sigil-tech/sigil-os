// daemon_client.rs — Unix socket client for the aetherd daemon.
//
// Sends newline-delimited JSON requests and reads newline-delimited JSON
// responses. Reconnects automatically on socket drop with a 2-second backoff,
// up to 10 attempts. The struct is intended to be held behind Arc<Mutex<_>>
// as Tauri managed state.

use std::env;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

/// A request frame sent over the socket.
#[derive(Debug, Serialize)]
struct Request<'a> {
    method: &'a str,
    payload: serde_json::Value,
}

/// A response frame received from the daemon.
#[derive(Debug, Deserialize)]
struct Response {
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    result: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Public response types exposed to Tauri commands
// ---------------------------------------------------------------------------

/// Daemon process status information.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatusResponse {
    pub running: bool,
    pub pid: Option<u32>,
    pub uptime_secs: Option<u64>,
    pub version: Option<String>,
}

/// A single shell event from daemon history.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShellEvent {
    pub id: String,
    pub timestamp: u64,
    pub command: String,
    pub exit_code: i32,
    pub directory: String,
}

/// A command suggestion returned by the daemon.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Suggestion {
    pub command: String,
    pub score: f64,
    pub source: String,
}

/// A file entry returned by the daemon.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub path: String,
    pub kind: String,
    pub size: Option<u64>,
}

/// A known command record.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommandRecord {
    pub command: String,
    pub frequency: u64,
    pub last_used: u64,
}

/// A behaviour pattern detected by the daemon.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Pattern {
    pub id: String,
    pub description: String,
    pub confidence: f64,
}

/// Response from the `trigger_summary` method.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SummaryResponse {
    pub summary: String,
    pub generated_at: u64,
}

/// AI query response (used by Issue #35).
#[allow(dead_code)] // constructed by the daemon response path wired in Issue #35
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIQueryResponse {
    pub response: String,
    pub routing: String,
    pub latency_ms: u64,
}

// ---------------------------------------------------------------------------
// DaemonClient
// ---------------------------------------------------------------------------

const MAX_RECONNECT_ATTEMPTS: u32 = 10;
const RECONNECT_BACKOFF: Duration = Duration::from_secs(2);

/// DaemonClient manages the connection to the aetherd Unix socket.
///
/// The socket path defaults to `/run/user/$UID/aetherd.sock` but can be
/// overridden at construction time. Reconnection is handled transparently
/// inside `call`, up to `MAX_RECONNECT_ATTEMPTS` attempts with a fixed
/// 2-second backoff.
pub struct DaemonClient {
    socket_path: String,
    stream: Option<UnixStream>,
}

impl DaemonClient {
    /// Creates a new `DaemonClient` using the default socket path derived
    /// from the current user's UID.
    pub fn new() -> Self {
        let uid = get_uid();
        let socket_path = format!("/run/user/{}/aetherd.sock", uid);
        Self {
            socket_path,
            stream: None,
        }
    }

    /// Creates a new `DaemonClient` with a caller-supplied socket path.
    #[allow(dead_code)] // used in tests and by callers that override the default socket path
    pub fn with_path(socket_path: impl Into<String>) -> Self {
        Self {
            socket_path: socket_path.into(),
            stream: None,
        }
    }

    /// Wraps `self` in `Arc<Mutex<_>>` for use as Tauri managed state.
    pub fn into_shared(self) -> Arc<Mutex<Self>> {
        Arc::new(Mutex::new(self))
    }

    // -----------------------------------------------------------------------
    // Connection management
    // -----------------------------------------------------------------------

    fn connect(&mut self) -> Result<(), String> {
        match UnixStream::connect(&self.socket_path) {
            Ok(stream) => {
                self.stream = Some(stream);
                Ok(())
            }
            Err(e) => Err(format!(
                "daemon not reachable at {}: {}",
                self.socket_path, e
            )),
        }
    }

    fn ensure_connected(&mut self) -> Result<(), String> {
        if self.stream.is_some() {
            return Ok(());
        }
        self.connect()
    }

    // -----------------------------------------------------------------------
    // Core RPC — newline-delimited JSON
    // -----------------------------------------------------------------------

    /// Sends a single request to the daemon and returns the parsed result.
    ///
    /// On any I/O error the connection is dropped and a reconnect is attempted
    /// with `RECONNECT_BACKOFF` delay between tries. Returns an error if the
    /// daemon cannot be reached after `MAX_RECONNECT_ATTEMPTS`.
    fn call(
        &mut self,
        method: &str,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        for attempt in 0..MAX_RECONNECT_ATTEMPTS {
            if attempt > 0 {
                thread::sleep(RECONNECT_BACKOFF);
            }

            if let Err(e) = self.ensure_connected() {
                if attempt + 1 == MAX_RECONNECT_ATTEMPTS {
                    return Err(format!(
                        "daemon unavailable after {} attempts: {}",
                        MAX_RECONNECT_ATTEMPTS, e
                    ));
                }
                // Drop stale stream and retry.
                self.stream = None;
                continue;
            }

            let result = self.do_call(method, &payload);
            match result {
                Ok(val) => return Ok(val),
                Err(e) => {
                    // Drop the stream so the next iteration reconnects.
                    self.stream = None;
                    if attempt + 1 == MAX_RECONNECT_ATTEMPTS {
                        return Err(format!(
                            "daemon call failed after {} attempts: {}",
                            MAX_RECONNECT_ATTEMPTS, e
                        ));
                    }
                }
            }
        }
        // Unreachable — the loop always returns in the last iteration.
        Err("daemon call failed: unexpected loop exit".into())
    }

    fn do_call(
        &mut self,
        method: &str,
        payload: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let stream = self.stream.as_mut().ok_or("no active connection")?;

        // Serialize and write the request frame.
        let req = Request { method, payload: payload.clone() };
        let mut frame =
            serde_json::to_string(&req).map_err(|e| format!("serialize request: {}", e))?;
        frame.push('\n');

        stream
            .write_all(frame.as_bytes())
            .map_err(|e| format!("write to socket: {}", e))?;

        // Read a single response line.
        let read_stream = stream
            .try_clone()
            .map_err(|e| format!("clone stream for read: {}", e))?;
        let mut reader = BufReader::new(read_stream);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| format!("read from socket: {}", e))?;

        if line.is_empty() {
            return Err("daemon closed connection".into());
        }

        let resp: Response =
            serde_json::from_str(line.trim()).map_err(|e| format!("parse response: {}", e))?;

        if let Some(err_msg) = resp.error {
            return Err(format!("daemon error: {}", err_msg));
        }

        Ok(resp.result)
    }

    // -----------------------------------------------------------------------
    // Domain methods
    // -----------------------------------------------------------------------

    /// Returns the current daemon status.
    pub fn status(&mut self) -> Result<StatusResponse, String> {
        let val = self.call("status", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse status: {}", e))
    }

    /// Returns recent shell events from the daemon.
    pub fn events(&mut self) -> Result<Vec<ShellEvent>, String> {
        let val = self.call("events", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse events: {}", e))
    }

    /// Returns command suggestions from the daemon.
    pub fn suggestions(&mut self) -> Result<Vec<Suggestion>, String> {
        let val = self.call("suggestions", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse suggestions: {}", e))
    }

    /// Returns file entries from the daemon.
    pub fn files(&mut self) -> Result<Vec<FileEntry>, String> {
        let val = self.call("files", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse files: {}", e))
    }

    /// Returns known command records from the daemon.
    pub fn commands(&mut self) -> Result<Vec<CommandRecord>, String> {
        let val = self.call("commands", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse commands: {}", e))
    }

    /// Returns behaviour patterns detected by the daemon.
    pub fn patterns(&mut self) -> Result<Vec<Pattern>, String> {
        let val = self.call("patterns", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse patterns: {}", e))
    }

    /// Asks the daemon to generate and return a session summary.
    pub fn trigger_summary(&mut self) -> Result<SummaryResponse, String> {
        let val = self.call("trigger_summary", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse summary: {}", e))
    }

    /// Sends user feedback to the daemon.
    ///
    /// `kind` is a short tag such as `"positive"` or `"negative"`.
    /// `detail` carries an optional free-form message.
    pub fn feedback(&mut self, kind: &str, detail: Option<&str>) -> Result<(), String> {
        let payload = serde_json::json!({
            "kind": kind,
            "detail": detail,
        });
        self.call("feedback", payload)?;
        Ok(())
    }

    /// Requests the daemon to undo the most recent undoable action.
    pub fn undo(&mut self) -> Result<serde_json::Value, String> {
        self.call("undo", serde_json::Value::Null)
    }

    /// Notifies the daemon that the active tool view has changed.
    pub fn view_changed(&mut self, view: &str) -> Result<(), String> {
        let payload = serde_json::json!({ "view": view });
        self.call("view-changed", payload)?;
        Ok(())
    }

    /// Returns a preview of the fleet report payload without sending it.
    pub fn fleet_preview(&mut self) -> Result<serde_json::Value, String> {
        self.call("fleet-preview", serde_json::Value::Null)
    }

    /// Opts out of fleet reporting and clears the pending queue.
    pub fn fleet_opt_out(&mut self) -> Result<(), String> {
        self.call("fleet-opt-out", serde_json::Value::Null)?;
        Ok(())
    }

    /// Sends a natural-language query to the daemon's AI routing layer.
    ///
    /// Returns the AI response along with the routing decision and measured
    /// latency. Used by Issue #35.
    #[allow(dead_code)] // wired to a Tauri command in Issue #35
    pub fn ai_query(&mut self, query: &str, context: &str) -> Result<AIQueryResponse, String> {
        let payload = serde_json::json!({
            "query": query,
            "context": context,
        });
        let val = self.call("ai_query", payload)?;
        serde_json::from_value(val).map_err(|e| format!("parse ai_query response: {}", e))
    }
}

// ---------------------------------------------------------------------------
// Push subscription — runs in a dedicated thread
// ---------------------------------------------------------------------------

/// Spawns a background thread that opens a dedicated socket connection for
/// receiving push events from the daemon. Each received JSON line is emitted
/// as a `daemon-suggestion` Tauri event.
///
/// Used by Issue #34. The thread exits cleanly when the app handle is dropped
/// or the daemon closes the connection.
#[allow(dead_code)] // called from the setup hook wired in Issue #34
pub fn subscribe_suggestions(app: AppHandle, socket_path: String) {
    thread::spawn(move || {
        let mut attempt: u32 = 0;
        loop {
            if attempt > 0 {
                thread::sleep(RECONNECT_BACKOFF);
            }
            attempt += 1;

            let stream = match UnixStream::connect(&socket_path) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!(
                        "subscribe_suggestions: connect attempt {}: {}",
                        attempt, e
                    );
                    if attempt >= MAX_RECONNECT_ATTEMPTS {
                        eprintln!("subscribe_suggestions: giving up after {} attempts", attempt);
                        return;
                    }
                    continue;
                }
            };

            // Send the subscribe request frame.
            let req = Request {
                method: "subscribe_suggestions",
                payload: serde_json::Value::Null,
            };
            let mut frame = match serde_json::to_string(&req) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("subscribe_suggestions: serialize: {}", e);
                    return;
                }
            };
            frame.push('\n');

            let mut write_stream = match stream.try_clone() {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("subscribe_suggestions: clone stream: {}", e);
                    continue;
                }
            };

            if let Err(e) = write_stream.write_all(frame.as_bytes()) {
                eprintln!("subscribe_suggestions: write subscribe frame: {}", e);
                continue;
            }

            // Read push events until the daemon drops the connection.
            let reader = BufReader::new(stream);
            for line_result in reader.lines() {
                match line_result {
                    Ok(line) if line.is_empty() => continue,
                    Ok(line) => {
                        // Parse the push payload and emit it as a Tauri event.
                        match serde_json::from_str::<serde_json::Value>(&line) {
                            Ok(payload) => {
                                if let Err(e) = app.emit("daemon-suggestion", payload) {
                                    eprintln!("subscribe_suggestions: emit: {}", e);
                                }
                            }
                            Err(e) => {
                                eprintln!("subscribe_suggestions: parse push event: {}", e);
                            }
                        }
                    }
                    Err(_) => {
                        // Connection closed by daemon — reconnect.
                        break;
                    }
                }
            }

            // Reset attempt counter so reconnection tries the full budget again.
            attempt = 0;
        }
    });
}

// ---------------------------------------------------------------------------
// Push subscription — actuations
// ---------------------------------------------------------------------------

/// Spawns a background thread that opens a dedicated socket connection for
/// receiving actuation push events from the daemon. Each received JSON line
/// is emitted as a `daemon-actuation` Tauri event.
#[allow(dead_code)]
pub fn subscribe_actuations(app: AppHandle, socket_path: String) {
    thread::spawn(move || {
        let mut attempt: u32 = 0;
        loop {
            if attempt > 0 {
                thread::sleep(RECONNECT_BACKOFF);
            }
            attempt += 1;

            let stream = match UnixStream::connect(&socket_path) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!(
                        "subscribe_actuations: connect attempt {}: {}",
                        attempt, e
                    );
                    if attempt >= MAX_RECONNECT_ATTEMPTS {
                        eprintln!("subscribe_actuations: giving up after {} attempts", attempt);
                        return;
                    }
                    continue;
                }
            };

            let req = Request {
                method: "subscribe_actuations",
                payload: serde_json::Value::Null,
            };
            let mut frame = match serde_json::to_string(&req) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("subscribe_actuations: serialize: {}", e);
                    return;
                }
            };
            frame.push('\n');

            let mut write_stream = match stream.try_clone() {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("subscribe_actuations: clone stream: {}", e);
                    continue;
                }
            };

            if let Err(e) = write_stream.write_all(frame.as_bytes()) {
                eprintln!("subscribe_actuations: write subscribe frame: {}", e);
                continue;
            }

            let reader = BufReader::new(stream);
            for line_result in reader.lines() {
                match line_result {
                    Ok(line) if line.is_empty() => continue,
                    Ok(line) => {
                        match serde_json::from_str::<serde_json::Value>(&line) {
                            Ok(payload) => {
                                if let Err(e) = app.emit("daemon-actuation", payload) {
                                    eprintln!("subscribe_actuations: emit: {}", e);
                                }
                            }
                            Err(e) => {
                                eprintln!("subscribe_actuations: parse push event: {}", e);
                            }
                        }
                    }
                    Err(_) => break,
                }
            }

            attempt = 0;
        }
    });
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Returns the current daemon status.
#[tauri::command]
pub fn daemon_status(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<StatusResponse, String> {
    state.lock().unwrap().status()
}

/// Returns recent shell events recorded by the daemon.
#[tauri::command]
pub fn daemon_events(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<Vec<ShellEvent>, String> {
    state.lock().unwrap().events()
}

/// Returns command suggestions from the daemon.
#[tauri::command]
pub fn daemon_suggestions(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<Vec<Suggestion>, String> {
    state.lock().unwrap().suggestions()
}

/// Returns file entries from the daemon.
#[tauri::command]
pub fn daemon_files(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<Vec<FileEntry>, String> {
    state.lock().unwrap().files()
}

/// Returns known command records from the daemon.
#[tauri::command]
pub fn daemon_commands(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<Vec<CommandRecord>, String> {
    state.lock().unwrap().commands()
}

/// Returns behaviour patterns detected by the daemon.
#[tauri::command]
pub fn daemon_patterns(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<Vec<Pattern>, String> {
    state.lock().unwrap().patterns()
}

/// Asks the daemon to generate a session summary and returns it.
#[tauri::command]
pub fn daemon_trigger_summary(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<SummaryResponse, String> {
    state.lock().unwrap().trigger_summary()
}

/// Sends user feedback to the daemon.
#[tauri::command]
pub fn daemon_feedback(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
    kind: String,
    detail: Option<String>,
) -> Result<(), String> {
    state
        .lock()
        .unwrap()
        .feedback(&kind, detail.as_deref())
}

/// Requests the daemon to undo the most recent undoable action.
#[tauri::command]
pub fn daemon_undo(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().undo()
}

/// Notifies the daemon that the active tool view has changed, triggering
/// a keybinding profile switch.
#[tauri::command]
pub fn daemon_view_changed(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
    view: String,
) -> Result<(), String> {
    state.lock().unwrap().view_changed(&view)
}

/// Returns a preview of the fleet report data.
#[tauri::command]
pub fn daemon_fleet_preview(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().fleet_preview()
}

/// Opts out of fleet reporting.
#[tauri::command]
pub fn daemon_fleet_opt_out(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<(), String> {
    state.lock().unwrap().fleet_opt_out()
}

/// Sends an AI query to the daemon via the Cactus routing layer.
#[tauri::command]
pub fn daemon_ai_query(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
    query: String,
    context: String,
) -> Result<AIQueryResponse, String> {
    state.lock().unwrap().ai_query(&query, &context)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns the current process UID.
///
/// On Linux this is retrieved from `/proc/self/status` or via `libc::getuid`.
/// We use the `id` command via environment variable `UID` as a fallback that
/// works without a libc dependency.
fn get_uid() -> u32 {
    // $UID is set by most Unix shells; fall back to parsing /proc/self/status.
    if let Ok(uid_str) = env::var("UID") {
        if let Ok(uid) = uid_str.parse::<u32>() {
            return uid;
        }
    }

    // Read from /proc/self/status — works on Linux without any extra dep.
    if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
        for line in status.lines() {
            if line.starts_with("Uid:") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(uid_str) = parts.get(1) {
                    if let Ok(uid) = uid_str.parse::<u32>() {
                        return uid;
                    }
                }
            }
        }
    }

    // Last resort: effective UID 1000 is the common default for the first
    // non-root user on most Linux distributions.
    1000
}

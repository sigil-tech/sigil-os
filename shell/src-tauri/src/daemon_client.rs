// daemon_client.rs — Unix socket client for the sigild daemon.
//
// Sends newline-delimited JSON requests and reads newline-delimited JSON
// responses. Reconnects automatically on socket drop with a 2-second backoff,
// up to 10 attempts. The struct is intended to be held behind Arc<Mutex<_>>
// as Tauri managed state.

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
///
/// The daemon returns `{"ok":true,"payload":{...}}` on success
/// or `{"ok":false,"error":"..."}` on failure.
#[derive(Debug, Deserialize)]
struct Response {
    #[serde(default)]
    ok: bool,
    #[serde(default)]
    payload: serde_json::Value,
    #[serde(default)]
    error: Option<String>,
}

// ---------------------------------------------------------------------------
// Public response types exposed to Tauri commands
// ---------------------------------------------------------------------------

/// Daemon process status information.
/// Matches Go: {"status":"ok","version":"...","rss_mb":18,"notifier_level":2,"current_keybinding_profile":"terminal"}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatusResponse {
    pub status: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub rss_mb: Option<u64>,
    #[serde(default)]
    pub notifier_level: Option<u32>,
    #[serde(default)]
    pub current_keybinding_profile: Option<String>,
}

/// A single event from daemon history.
/// Matches Go event.Event: {"id":42,"kind":"file","source":"files","payload":{...},"timestamp":"2026-..."}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShellEvent {
    pub id: i64,
    pub kind: String,
    pub source: String,
    #[serde(default)]
    pub payload: serde_json::Value,
    pub timestamp: String,
}

/// A suggestion returned by the daemon.
/// Matches Go store.Suggestion: {"id":1,"category":"pattern","confidence":0.75,"title":"...","body":"...","action_cmd":"...","status":"pending","created_at":"..."}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Suggestion {
    pub id: i64,
    pub category: String,
    pub confidence: f64,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub action_cmd: Option<String>,
    pub status: String,
    pub created_at: String,
}

/// A file edit count returned by the daemon.
/// Matches Go store.FileEditCount: {"Path":"...","Count":3}
/// Note: Go struct has no json tags so fields are uppercase.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    #[serde(alias = "Path")]
    pub path: String,
    #[serde(alias = "Count")]
    pub count: u64,
}

/// A command frequency record.
/// Matches Go commands handler: {"cmd":"...","count":3,"last_exit_code":0}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommandRecord {
    pub cmd: String,
    pub count: u64,
    pub last_exit_code: i32,
}

/// A behaviour pattern detected by the daemon.
/// Patterns are just Suggestions filtered to category=="pattern".
pub type Pattern = Suggestion;

/// Response from the `trigger-summary` method.
/// Matches Go: {"ok":true,"message":"analysis cycle queued"}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SummaryResponse {
    #[serde(default)]
    pub ok: Option<bool>,
    #[serde(default)]
    pub message: Option<String>,
}

/// AI query response.
/// Matches Go ai-query handler: {"response":"...","routing":"local|cloud","latency_ms":42}
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

/// DaemonClient manages the connection to the sigild Unix socket.
///
/// The socket path defaults to `/run/user/$UID/sigild.sock` but can be
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
        let socket_path = format!("/run/user/{}/sigild.sock", uid);
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

        if !resp.ok {
            let msg = resp.error.unwrap_or_else(|| "unknown error".into());
            return Err(format!("daemon error: {}", msg));
        }

        Ok(resp.payload)
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

    /// Asks the daemon to trigger an analysis cycle.
    pub fn trigger_summary(&mut self) -> Result<SummaryResponse, String> {
        let val = self.call("trigger-summary", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse summary: {}", e))
    }

    /// Sends suggestion feedback to the daemon.
    ///
    /// `suggestion_id` identifies the suggestion.
    /// `outcome` is `"accepted"` or `"dismissed"`.
    pub fn feedback(&mut self, suggestion_id: i64, outcome: &str) -> Result<(), String> {
        let payload = serde_json::json!({
            "suggestion_id": suggestion_id,
            "outcome": outcome,
        });
        self.call("feedback", payload)?;
        Ok(())
    }

    /// Purges all local data from the daemon store.
    pub fn purge(&mut self) -> Result<(), String> {
        self.call("purge", serde_json::Value::Null)?;
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

    /// Returns resolved runtime configuration with API keys masked.
    pub fn config(&mut self) -> Result<serde_json::Value, String> {
        self.call("config", serde_json::Value::Null)
    }

    /// Returns terminal session summaries from the last 24 hours.
    pub fn sessions(&mut self) -> Result<serde_json::Value, String> {
        self.call("sessions", serde_json::Value::Null)
    }

    /// Returns recent undoable actions from the actuator.
    pub fn actions(&mut self) -> Result<serde_json::Value, String> {
        self.call("actions", serde_json::Value::Null)
    }

    /// Returns the current fleet routing policy.
    pub fn fleet_policy(&mut self) -> Result<serde_json::Value, String> {
        self.call("fleet-policy", serde_json::Value::Null)
    }

    /// Sends a natural-language query to the daemon's AI routing layer.
    ///
    /// Returns the AI response along with the routing decision and measured
    /// latency.
    pub fn ai_query(&mut self, query: &str, context: &str) -> Result<AIQueryResponse, String> {
        let payload = serde_json::json!({
            "query": query,
            "context": context,
        });
        let val = self.call("ai-query", payload)?;
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
                method: "subscribe",
                payload: serde_json::json!({"topic": "suggestions"}),
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
                method: "subscribe",
                payload: serde_json::json!({"topic": "actuations"}),
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

/// Sends suggestion feedback to the daemon.
#[tauri::command]
pub fn daemon_feedback(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
    suggestion_id: i64,
    outcome: String,
) -> Result<(), String> {
    state
        .lock()
        .unwrap()
        .feedback(suggestion_id, &outcome)
}

/// Purges all local daemon data.
#[tauri::command]
pub fn daemon_purge(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<(), String> {
    state.lock().unwrap().purge()
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

/// Returns resolved runtime configuration.
#[tauri::command]
pub fn daemon_config(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().config()
}

/// Returns terminal session summaries.
#[tauri::command]
pub fn daemon_sessions(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().sessions()
}

/// Returns recent undoable actions.
#[tauri::command]
pub fn daemon_actions(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().actions()
}

/// Returns the current fleet routing policy.
#[tauri::command]
pub fn daemon_fleet_policy(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().fleet_policy()
}

/// Sends an AI query to the daemon via the inference engine.
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

/// Returns the current process UID via the underlying syscall.
pub fn get_uid() -> u32 {
    // SAFETY: getuid() is always safe — no arguments, no failure mode.
    unsafe { libc::getuid() }
}

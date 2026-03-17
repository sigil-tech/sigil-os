// daemon_client.rs — Multi-transport client for the sigild daemon.
//
// Supports Unix socket (local) and TCP+TLS (remote) transports.
// For TCP, a custom ServerCertVerifier performs SPKI fingerprint pinning
// instead of CA chain validation, matching the credential file format.
//
// The struct is intended to be held behind Arc<Mutex<_>> as Tauri managed state.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::os::unix::net::UnixStream;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, ClientConnection, DigitallySignedStruct, Error as TlsError, StreamOwned};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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
    ok: bool,
    #[serde(default)]
    payload: serde_json::Value,
    #[serde(default)]
    error: Option<String>,
}

// ---------------------------------------------------------------------------
// Public response types exposed to Tauri commands
// ---------------------------------------------------------------------------

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShellEvent {
    pub id: i64,
    pub kind: String,
    pub source: String,
    #[serde(default)]
    pub payload: serde_json::Value,
    pub timestamp: String,
}

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    #[serde(alias = "Path")]
    pub path: String,
    #[serde(alias = "Count")]
    pub count: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommandRecord {
    pub cmd: String,
    pub count: u64,
    pub last_exit_code: i32,
}

pub type Pattern = Suggestion;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SummaryResponse {
    #[serde(default)]
    pub ok: Option<bool>,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIQueryResponse {
    pub response: String,
    pub routing: String,
    pub latency_ms: u64,
}

/// Connection status returned by `get_connection_status`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionStatus {
    pub transport: String,
    pub connected: bool,
    pub remote_addr: Option<String>,
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/// Active transport connection. Held inside DaemonClient.
enum Transport {
    Unix(BufReader<UnixStream>),
    Tcp(BufReader<StreamOwned<ClientConnection, TcpStream>>, String /* remote addr */),
}

impl Transport {
    fn write_all(&mut self, data: &[u8]) -> Result<(), String> {
        match self {
            Transport::Unix(r) => r
                .get_mut()
                .write_all(data)
                .map_err(|e| format!("write (unix): {}", e)),
            Transport::Tcp(r, _) => r
                .get_mut()
                .write_all(data)
                .map_err(|e| format!("write (tcp): {}", e)),
        }
    }

    fn read_line(&mut self) -> Result<String, String> {
        let mut line = String::new();
        match self {
            Transport::Unix(r) => r
                .read_line(&mut line)
                .map_err(|e| format!("read (unix): {}", e))?,
            Transport::Tcp(r, _) => r
                .read_line(&mut line)
                .map_err(|e| format!("read (tcp): {}", e))?,
        };
        Ok(line)
    }

    fn transport_name(&self) -> &'static str {
        match self {
            Transport::Unix(_) => "unix",
            Transport::Tcp(_, _) => "tcp",
        }
    }

    fn remote_addr(&self) -> Option<String> {
        match self {
            Transport::Unix(_) => None,
            Transport::Tcp(_, addr) => Some(addr.clone()),
        }
    }
}

// ---------------------------------------------------------------------------
// Credential file
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct CredentialFile {
    #[allow(dead_code)]
    id: String,
    token: String,
    server_addr: String,
    server_cert_spki: String,
}

// ---------------------------------------------------------------------------
// SPKI fingerprint verifier
// ---------------------------------------------------------------------------

/// A rustls ServerCertVerifier that accepts a server certificate only if its
/// SPKI fingerprint matches the pinned value from the credential file.
#[derive(Debug)]
struct SpkiVerifier {
    /// Expected fingerprint in "sha256/<base64>" format.
    expected: String,
}

impl ServerCertVerifier for SpkiVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        // Parse using x509 raw DER: extract SPKI bytes.
        // We use a minimal manual approach rather than pulling in an x509 crate.
        let spki_bytes = extract_spki_der(end_entity.as_ref()).ok_or_else(|| {
            TlsError::General("failed to extract SPKI from certificate".into())
        })?;

        let mut hasher = Sha256::new();
        hasher.update(&spki_bytes);
        let digest = hasher.finalize();
        let fingerprint = format!(
            "sha256/{}",
            base64_encode(&digest)
        );

        if fingerprint == self.expected {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(TlsError::General(format!(
                "TLS fingerprint mismatch: got {}, expected {}",
                fingerprint, self.expected
            )))
        }
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        // TLS 1.3 minimum is enforced via ClientConfig; TLS 1.2 won't be used.
        Err(TlsError::General("TLS 1.2 not supported".into()))
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

/// Extracts the SubjectPublicKeyInfo DER bytes from a DER-encoded X.509 cert.
///
/// X.509 structure (simplified):
///   SEQUENCE {                          -- Certificate
///     SEQUENCE {                        -- TBSCertificate
///       [0] INTEGER (version)
///       INTEGER (serialNumber)
///       SEQUENCE (signature alg)
///       SEQUENCE (issuer)
///       SEQUENCE (validity)
///       SEQUENCE (subject)
///       SEQUENCE { ... }               -- subjectPublicKeyInfo  ← we want this
///       ...
///     }
///     ...
///   }
///
/// We walk the DER manually using a minimal TLV parser.
fn extract_spki_der(cert_der: &[u8]) -> Option<Vec<u8>> {
    // Unwrap outer SEQUENCE (Certificate).
    let tbs = der_unwrap_sequence(cert_der)?;
    // Unwrap inner SEQUENCE (TBSCertificate).
    let tbs_inner = der_unwrap_sequence(tbs)?;

    // Skip: version [0] EXPLICIT (optional), serialNumber, signature, issuer, validity, subject.
    // Each is a TLV; we skip 6 fields to reach subjectPublicKeyInfo.
    let mut pos = tbs_inner;
    for _ in 0..6 {
        let (_, rest) = der_next_tlv(pos)?;
        pos = rest;
    }
    // pos now points at the subjectPublicKeyInfo TLV. Return the whole TLV.
    let (spki_tlv, _) = der_tlv_bytes(pos)?;
    Some(spki_tlv.to_vec())
}

/// Returns the content bytes of the first DER SEQUENCE at `data`.
fn der_unwrap_sequence(data: &[u8]) -> Option<&[u8]> {
    if data.is_empty() || data[0] != 0x30 {
        return None;
    }
    let (len, hdr) = der_length(&data[1..])?;
    let start = 1 + hdr;
    if data.len() < start + len {
        return None;
    }
    Some(&data[start..start + len])
}

/// Returns (value_bytes, rest_after_tlv) for the next TLV in `data`.
fn der_next_tlv(data: &[u8]) -> Option<(&[u8], &[u8])> {
    if data.is_empty() {
        return None;
    }
    let (len, hdr) = der_length(&data[1..])?;
    let end = 1 + hdr + len;
    if data.len() < end {
        return None;
    }
    Some((&data[1 + hdr..end], &data[end..]))
}

/// Returns (full_tlv_bytes, rest) for the next TLV in `data`.
fn der_tlv_bytes(data: &[u8]) -> Option<(&[u8], &[u8])> {
    if data.is_empty() {
        return None;
    }
    let (len, hdr) = der_length(&data[1..])?;
    let end = 1 + hdr + len;
    if data.len() < end {
        return None;
    }
    Some((&data[..end], &data[end..]))
}

/// Returns (length_value, bytes_consumed_for_length_encoding).
fn der_length(data: &[u8]) -> Option<(usize, usize)> {
    if data.is_empty() {
        return None;
    }
    let b = data[0] as usize;
    if b < 0x80 {
        return Some((b, 1));
    }
    let n = b & 0x7f;
    if n == 0 || n > 4 || data.len() < 1 + n {
        return None;
    }
    let mut len = 0usize;
    for i in 0..n {
        len = (len << 8) | (data[1 + i] as usize);
    }
    Some((len, 1 + n))
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        let combined = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[(combined >> 18) & 0x3f] as char);
        out.push(TABLE[(combined >> 12) & 0x3f] as char);
        if chunk.len() > 1 {
            out.push(TABLE[(combined >> 6) & 0x3f] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[combined & 0x3f] as char);
        } else {
            out.push('=');
        }
    }
    out
}

// ---------------------------------------------------------------------------
// DaemonClient
// ---------------------------------------------------------------------------

/// Exponential backoff durations for subscribe reconnect loops.
/// Caps at 30s. Call() does not retry — the frontend polls every 5–30s.
const BACKOFF_STEPS: &[u64] = &[2, 4, 8, 16, 30];

/// DaemonClient manages a connection to sigild over Unix socket or TCP+TLS.
pub struct DaemonClient {
    socket_path: String,
    transport: Option<Transport>,
    /// Credential file path for TCP reconnects.
    tcp_credential_path: Option<String>,
    /// TCP address override.
    tcp_addr_override: Option<String>,
}

impl DaemonClient {
    /// Creates a new `DaemonClient` using the default Unix socket path.
    pub fn new() -> Self {
        let uid = get_uid();
        let socket_path = format!("/run/user/{}/sigild.sock", uid);
        Self {
            socket_path,
            transport: None,
            tcp_credential_path: None,
            tcp_addr_override: None,
        }
    }

    /// Creates a new `DaemonClient` with a caller-supplied Unix socket path.
    #[allow(dead_code)]
    pub fn with_path(socket_path: impl Into<String>) -> Self {
        Self {
            socket_path: socket_path.into(),
            transport: None,
            tcp_credential_path: None,
            tcp_addr_override: None,
        }
    }

    /// Wraps `self` in `Arc<Mutex<_>>` for use as Tauri managed state.
    pub fn into_shared(self) -> Arc<Mutex<Self>> {
        Arc::new(Mutex::new(self))
    }

    // -----------------------------------------------------------------------
    // Connection management
    // -----------------------------------------------------------------------

    fn connect_unix(&mut self) -> Result<(), String> {
        let stream = UnixStream::connect(&self.socket_path).map_err(|e| {
            format!("daemon not reachable at {}: {}", self.socket_path, e)
        })?;
        // Match TCP's 30s read timeout so a hung daemon can't block the mutex.
        stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
        self.transport = Some(Transport::Unix(BufReader::new(stream)));
        Ok(())
    }

    /// Connects to a remote daemon over TCP+TLS using a credential file.
    pub fn connect_tcp(
        &mut self,
        addr: &str,
        credential_path: &str,
    ) -> Result<(), String> {
        // Load credential file.
        let data = std::fs::read_to_string(credential_path)
            .map_err(|e| format!("read credential file {}: {}", credential_path, e))?;
        let cred: CredentialFile = serde_json::from_str(&data)
            .map_err(|e| format!("parse credential file: {}", e))?;

        let target_addr = if !addr.is_empty() {
            addr.to_string()
        } else {
            cred.server_addr.clone()
        };

        // Build rustls ClientConfig with SPKI fingerprint verifier.
        let verifier = Arc::new(SpkiVerifier {
            expected: cred.server_cert_spki.clone(),
        });
        let config = ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(verifier)
            .with_no_client_auth();

        // Connect TCP.
        let tcp = TcpStream::connect(&target_addr)
            .map_err(|e| format!("TCP connect to {}: {}", target_addr, e))?;
        tcp.set_read_timeout(Some(Duration::from_secs(30))).ok();
        tcp.set_write_timeout(Some(Duration::from_secs(10))).ok();

        // TLS handshake.
        let server_name = target_addr
            .split(':')
            .next()
            .unwrap_or("localhost")
            .to_string()
            .try_into()
            .map_err(|_| "invalid server name".to_string())?;
        let conn = ClientConnection::new(Arc::new(config), server_name)
            .map_err(|e| format!("TLS init: {}", e))?;
        let mut tls_stream = StreamOwned::new(conn, tcp);

        // Send auth request.
        let auth_req = serde_json::json!({
            "method": "auth",
            "payload": { "token": cred.token }
        });
        let mut frame = serde_json::to_string(&auth_req)
            .map_err(|e| format!("serialize auth: {}", e))?;
        frame.push('\n');
        tls_stream
            .write_all(frame.as_bytes())
            .map_err(|e| format!("write auth: {}", e))?;

        // Read auth response.
        let mut reader = BufReader::new(tls_stream);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| format!("read auth response: {}", e))?;
        let resp: serde_json::Value = serde_json::from_str(line.trim())
            .map_err(|e| format!("parse auth response: {}", e))?;
        if !resp["ok"].as_bool().unwrap_or(false) {
            let err = resp["error"].as_str().unwrap_or("unauthorized");
            return Err(format!("auth failed: {}", err));
        }

        self.tcp_credential_path = Some(credential_path.to_string());
        self.transport = Some(Transport::Tcp(reader, target_addr));
        Ok(())
    }

    fn ensure_connected(&mut self) -> Result<(), String> {
        if self.transport.is_some() {
            return Ok(());
        }
        // Reconnect based on which transport was last configured.
        if let Some(cred_path) = self.tcp_credential_path.clone() {
            let addr = self.tcp_addr_override.clone().unwrap_or_default();
            self.connect_tcp(&addr, &cred_path)
        } else {
            self.connect_unix()
        }
    }

    // -----------------------------------------------------------------------
    // Core RPC — newline-delimited JSON
    // -----------------------------------------------------------------------

    fn call(
        &mut self,
        method: &str,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        // Single attempt — no retry loop. The mutex must not be held for multiple
        // seconds; the frontend's polling intervals (5s–30s) handle reconnection.
        if let Err(e) = self.ensure_connected() {
            self.transport = None;
            return Err(format!("daemon unavailable: {}", e));
        }

        let result = self.do_call(method, &payload);
        if result.is_err() {
            self.transport = None;
        }
        result
    }

    fn do_call(
        &mut self,
        method: &str,
        payload: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let transport = self.transport.as_mut().ok_or("no active connection")?;

        let req = Request { method, payload: payload.clone() };
        let mut frame =
            serde_json::to_string(&req).map_err(|e| format!("serialize request: {}", e))?;
        frame.push('\n');

        // Write then read on the same mutable reference — no try_clone needed.
        transport.write_all(frame.as_bytes())?;
        let line = transport.read_line()?;

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

    /// Returns the current connection status.
    pub fn connection_status(&self) -> ConnectionStatus {
        match &self.transport {
            None => ConnectionStatus {
                transport: "unix".into(),
                connected: false,
                remote_addr: None,
            },
            Some(t) => ConnectionStatus {
                transport: t.transport_name().into(),
                connected: true,
                remote_addr: t.remote_addr(),
            },
        }
    }

    // -----------------------------------------------------------------------
    // Domain methods
    // -----------------------------------------------------------------------

    pub fn status(&mut self) -> Result<StatusResponse, String> {
        let val = self.call("status", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse status: {}", e))
    }

    pub fn events(&mut self) -> Result<Vec<ShellEvent>, String> {
        let val = self.call("events", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse events: {}", e))
    }

    pub fn suggestions(&mut self) -> Result<Vec<Suggestion>, String> {
        let val = self.call("suggestions", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse suggestions: {}", e))
    }

    pub fn files(&mut self) -> Result<Vec<FileEntry>, String> {
        let val = self.call("files", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse files: {}", e))
    }

    pub fn commands(&mut self) -> Result<Vec<CommandRecord>, String> {
        let val = self.call("commands", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse commands: {}", e))
    }

    pub fn patterns(&mut self) -> Result<Vec<Pattern>, String> {
        let val = self.call("patterns", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse patterns: {}", e))
    }

    pub fn trigger_summary(&mut self) -> Result<SummaryResponse, String> {
        let val = self.call("trigger-summary", serde_json::Value::Null)?;
        serde_json::from_value(val).map_err(|e| format!("parse summary: {}", e))
    }

    pub fn feedback(&mut self, suggestion_id: i64, outcome: &str) -> Result<(), String> {
        let payload = serde_json::json!({
            "suggestion_id": suggestion_id,
            "outcome": outcome,
        });
        self.call("feedback", payload)?;
        Ok(())
    }

    pub fn purge(&mut self) -> Result<(), String> {
        self.call("purge", serde_json::Value::Null)?;
        Ok(())
    }

    pub fn undo(&mut self) -> Result<serde_json::Value, String> {
        self.call("undo", serde_json::Value::Null)
    }

    pub fn view_changed(&mut self, view: &str) -> Result<(), String> {
        let payload = serde_json::json!({ "view": view });
        self.call("view-changed", payload)?;
        Ok(())
    }

    pub fn fleet_preview(&mut self) -> Result<serde_json::Value, String> {
        self.call("fleet-preview", serde_json::Value::Null)
    }

    pub fn fleet_opt_out(&mut self) -> Result<(), String> {
        self.call("fleet-opt-out", serde_json::Value::Null)?;
        Ok(())
    }

    pub fn config(&mut self) -> Result<serde_json::Value, String> {
        self.call("config", serde_json::Value::Null)
    }

    pub fn sessions(&mut self) -> Result<serde_json::Value, String> {
        self.call("sessions", serde_json::Value::Null)
    }

    pub fn actions(&mut self) -> Result<serde_json::Value, String> {
        self.call("actions", serde_json::Value::Null)
    }

    pub fn fleet_policy(&mut self) -> Result<serde_json::Value, String> {
        self.call("fleet-policy", serde_json::Value::Null)
    }

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

/// Spawns a background thread subscribed to "suggestions" push events.
///
/// If `credential_path` is Some, connects over TCP+TLS using the credential file.
/// Otherwise connects over the Unix socket at `socket_path`.
pub fn subscribe_suggestions(
    app: AppHandle,
    socket_path: String,
    credential_path: Option<String>,
    addr_override: Option<String>,
) {
    thread::spawn(move || {
        if let Some(cred) = credential_path {
            subscribe_tcp_topic(app, cred, addr_override.unwrap_or_default(), "suggestions", "daemon-suggestion");
        } else {
            subscribe_unix_topic(app, socket_path, "suggestions", "daemon-suggestion");
        }
    });
}

/// Spawns a background thread subscribed to "actuations" push events.
///
/// If `credential_path` is Some, connects over TCP+TLS using the credential file.
/// Otherwise connects over the Unix socket at `socket_path`.
pub fn subscribe_actuations(
    app: AppHandle,
    socket_path: String,
    credential_path: Option<String>,
    addr_override: Option<String>,
) {
    thread::spawn(move || {
        if let Some(cred) = credential_path {
            subscribe_tcp_topic(app, cred, addr_override.unwrap_or_default(), "actuations", "daemon-actuation");
        } else {
            subscribe_unix_topic(app, socket_path, "actuations", "daemon-actuation");
        }
    });
}

fn subscribe_tcp_topic(
    app: AppHandle,
    credential_path: String,
    addr_override: String,
    topic: &str,
    event_name: &str,
) {
    let mut attempt: u32 = 0;
    let mut logged_waiting = false;
    loop {
        if attempt > 0 {
            let secs = BACKOFF_STEPS[(attempt as usize - 1).min(BACKOFF_STEPS.len() - 1)];
            thread::sleep(Duration::from_secs(secs));
        }
        attempt += 1;

        // Load credential.
        let data = match std::fs::read_to_string(&credential_path) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("subscribe_{} (tcp): read credential: {}", topic, e);
                return; // credential file missing — no point retrying
            }
        };
        let cred: CredentialFile = match serde_json::from_str(&data) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("subscribe_{} (tcp): parse credential: {}", topic, e);
                return; // credential file corrupt — no point retrying
            }
        };

        let addr = if !addr_override.is_empty() {
            addr_override.clone()
        } else {
            cred.server_addr.clone()
        };

        // Connect + TLS.
        let tcp = match TcpStream::connect(&addr) {
            Ok(t) => t,
            Err(e) => {
                if !logged_waiting {
                    eprintln!("subscribe_{} (tcp): daemon not reachable ({}); will keep retrying", topic, e);
                    logged_waiting = true;
                }
                continue;
            }
        };

        let verifier = Arc::new(SpkiVerifier { expected: cred.server_cert_spki.clone() });
        let config = ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(verifier)
            .with_no_client_auth();

        let server_name: rustls::pki_types::ServerName<'static> = match addr
            .split(':')
            .next()
            .unwrap_or("localhost")
            .to_string()
            .try_into()
        {
            Ok(n) => n,
            Err(_) => {
                eprintln!("subscribe_{} (tcp): invalid server name", topic);
                return;
            }
        };

        let conn = match ClientConnection::new(Arc::new(config), server_name) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("subscribe_{} (tcp): TLS init: {}", topic, e);
                continue;
            }
        };
        let mut tls_stream = StreamOwned::new(conn, tcp);

        // Auth handshake.
        let auth_req = serde_json::json!({
            "method": "auth",
            "payload": { "token": cred.token }
        });
        let mut auth_frame = match serde_json::to_string(&auth_req) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("subscribe_{} (tcp): serialize auth: {}", topic, e);
                return;
            }
        };
        auth_frame.push('\n');

        if let Err(e) = tls_stream.write_all(auth_frame.as_bytes()) {
            eprintln!("subscribe_{} (tcp): write auth: {}", topic, e);
            continue;
        }

        let mut reader = BufReader::new(tls_stream);
        let mut auth_line = String::new();
        if let Err(e) = reader.read_line(&mut auth_line) {
            eprintln!("subscribe_{} (tcp): read auth response: {}", topic, e);
            continue;
        }
        let auth_resp: serde_json::Value = match serde_json::from_str(auth_line.trim()) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("subscribe_{} (tcp): parse auth response: {}", topic, e);
                continue;
            }
        };
        if !auth_resp["ok"].as_bool().unwrap_or(false) {
            eprintln!("subscribe_{} (tcp): auth failed", topic);
            return; // credential revoked — no point retrying
        }

        // Send subscribe request.
        let sub_req = serde_json::json!({
            "method": "subscribe",
            "payload": { "topic": topic }
        });
        let mut sub_frame = match serde_json::to_string(&sub_req) {
            Ok(s) => s,
            Err(_) => return,
        };
        sub_frame.push('\n');

        if let Err(e) = reader.get_mut().write_all(sub_frame.as_bytes()) {
            eprintln!("subscribe_{} (tcp): write subscribe: {}", topic, e);
            continue;
        }

        // Read and discard the subscribe acknowledgement.
        let mut ack = String::new();
        let _ = reader.read_line(&mut ack);

        // Successfully connected — reset backoff and suppress flag.
        attempt = 0;
        logged_waiting = false;

        // Read push events.
        for line_result in reader.lines() {
            match line_result {
                Ok(line) if line.is_empty() => continue,
                Ok(line) => match serde_json::from_str::<serde_json::Value>(&line) {
                    Ok(payload) => {
                        if let Err(e) = app.emit(event_name, payload) {
                            eprintln!("subscribe_{} (tcp): emit: {}", topic, e);
                        }
                    }
                    Err(e) => eprintln!("subscribe_{} (tcp): parse event: {}", topic, e),
                },
                Err(_) => break,
            }
        }
    }
}

fn subscribe_unix_topic(app: AppHandle, socket_path: String, topic: &str, event_name: &str) {
    let mut attempt: u32 = 0;
    let mut logged_waiting = false;
    loop {
        if attempt > 0 {
            let secs = BACKOFF_STEPS[(attempt as usize - 1).min(BACKOFF_STEPS.len() - 1)];
            thread::sleep(Duration::from_secs(secs));
        }
        attempt += 1;

        let stream = match UnixStream::connect(&socket_path) {
            Ok(s) => s,
            Err(e) => {
                // Log the first failure; suppress repeats until success resets the counter.
                if !logged_waiting {
                    eprintln!("subscribe_{}: daemon not reachable ({}); will keep retrying", topic, e);
                    logged_waiting = true;
                }
                continue;
            }
        };

        let req = Request {
            method: "subscribe",
            payload: serde_json::json!({"topic": topic}),
        };
        let mut frame = match serde_json::to_string(&req) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("subscribe_{}: serialize: {}", topic, e);
                return;
            }
        };
        frame.push('\n');

        // Write subscribe frame using a cloned write-side stream.
        let mut write_stream = match stream.try_clone() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("subscribe_{}: clone stream: {}", topic, e);
                continue;
            }
        };

        if let Err(e) = write_stream.write_all(frame.as_bytes()) {
            eprintln!("subscribe_{}: write subscribe frame: {}", topic, e);
            continue;
        }

        // Successfully connected — reset backoff and suppress flag.
        attempt = 0;
        logged_waiting = false;

        let reader = BufReader::new(stream);
        for line_result in reader.lines() {
            match line_result {
                Ok(line) if line.is_empty() => continue,
                Ok(line) => match serde_json::from_str::<serde_json::Value>(&line) {
                    Ok(payload) => {
                        if let Err(e) = app.emit(event_name, payload) {
                            eprintln!("subscribe_{}: emit: {}", topic, e);
                        }
                    }
                    Err(e) => {
                        eprintln!("subscribe_{}: parse push event: {}", topic, e);
                    }
                },
                Err(_) => break,
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn daemon_status(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<StatusResponse, String> {
    state.lock().unwrap().status()
}

#[tauri::command]
pub fn daemon_events(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<Vec<ShellEvent>, String> {
    state.lock().unwrap().events()
}

#[tauri::command]
pub fn daemon_suggestions(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<Vec<Suggestion>, String> {
    state.lock().unwrap().suggestions()
}

#[tauri::command]
pub fn daemon_files(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<Vec<FileEntry>, String> {
    state.lock().unwrap().files()
}

#[tauri::command]
pub fn daemon_commands(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<Vec<CommandRecord>, String> {
    state.lock().unwrap().commands()
}

#[tauri::command]
pub fn daemon_patterns(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<Vec<Pattern>, String> {
    state.lock().unwrap().patterns()
}

#[tauri::command]
pub fn daemon_trigger_summary(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<SummaryResponse, String> {
    state.lock().unwrap().trigger_summary()
}

#[tauri::command]
pub fn daemon_feedback(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
    suggestion_id: i64,
    outcome: String,
) -> Result<(), String> {
    state.lock().unwrap().feedback(suggestion_id, &outcome)
}

#[tauri::command]
pub fn daemon_purge(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<(), String> {
    state.lock().unwrap().purge()
}

#[tauri::command]
pub fn daemon_undo(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().undo()
}

#[tauri::command]
pub fn daemon_view_changed(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
    view: String,
) -> Result<(), String> {
    state.lock().unwrap().view_changed(&view)
}

#[tauri::command]
pub fn daemon_fleet_preview(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().fleet_preview()
}

#[tauri::command]
pub fn daemon_fleet_opt_out(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<(), String> {
    state.lock().unwrap().fleet_opt_out()
}

#[tauri::command]
pub fn daemon_config(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().config()
}

#[tauri::command]
pub fn daemon_sessions(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().sessions()
}

#[tauri::command]
pub fn daemon_actions(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().actions()
}

#[tauri::command]
pub fn daemon_fleet_policy(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> Result<serde_json::Value, String> {
    state.lock().unwrap().fleet_policy()
}

#[tauri::command]
pub fn daemon_ai_query(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
    query: String,
    context: String,
) -> Result<AIQueryResponse, String> {
    state.lock().unwrap().ai_query(&query, &context)
}

/// Returns the current daemon connection status (transport, connected, remote_addr).
#[tauri::command]
pub fn get_connection_status(
    state: tauri::State<'_, Arc<Mutex<DaemonClient>>>,
) -> ConnectionStatus {
    state.lock().unwrap().connection_status()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub fn get_uid() -> u32 {
    // SAFETY: getuid() is always safe.
    unsafe { libc::getuid() }
}

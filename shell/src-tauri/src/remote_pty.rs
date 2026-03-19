//! SSH-based remote PTY for macOS launcher mode.
//!
//! Connects to the NixOS VM via SSH and opens a channel with a PTY request.
//! I/O is streamed through Tauri events using the same `pty-output-{id}` pattern
//! as the local `pty.rs`, so the frontend TerminalView works identically.

#![cfg(target_os = "macos")]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use russh::client;
use russh_keys::key;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use uuid::Uuid;

/// Settings for connecting to the VM's SSH server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemotePtyConfig {
    /// SSH host (typically localhost or VM IP)
    pub host: String,
    /// SSH port
    pub port: u16,
    /// Username
    pub user: String,
    /// Password (for MVP; key-based auth can be added later)
    pub password: String,
}

impl Default for RemotePtyConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 22,
            user: "sigil".into(),
            password: "sigil".into(),
        }
    }
}

/// Holds active remote PTY sessions.
pub struct RemotePtyMap(pub Arc<Mutex<HashMap<String, RemotePtyHandle>>>);

pub struct RemotePtyHandle {
    pub channel_id: russh::ChannelId,
    pub tx: tokio::sync::mpsc::Sender<Vec<u8>>,
}

impl RemotePtyMap {
    pub fn new() -> Self {
        RemotePtyMap(Arc::new(Mutex::new(HashMap::new())))
    }
}

/// Client handler for russh -- accepts all host keys for MVP.
struct SshHandler;

#[async_trait::async_trait]
impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // MVP: accept all host keys. The VM is local and ephemeral.
        Ok(true)
    }
}

/// Spawns a remote PTY session over SSH to the VM.
///
/// Returns a PTY ID that the frontend uses to send input and receive output,
/// exactly like the local `spawn_pty` command.
#[tauri::command]
pub async fn spawn_remote_pty(
    app: AppHandle,
    state: State<'_, RemotePtyMap>,
    config: Option<RemotePtyConfig>,
    cols: u32,
    rows: u32,
) -> Result<String, String> {
    let cfg = config.unwrap_or_default();
    let pty_id = Uuid::new_v4().to_string();

    let ssh_config = Arc::new(client::Config::default());
    let handler = SshHandler;

    let mut session = client::connect(ssh_config, (cfg.host.as_str(), cfg.port), handler)
        .await
        .map_err(|e| format!("SSH connect: {e}"))?;

    let auth_ok = session
        .authenticate_password(&cfg.user, &cfg.password)
        .await
        .map_err(|e| format!("SSH auth: {e}"))?;

    if !auth_ok {
        return Err("SSH authentication failed".into());
    }

    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("SSH channel open: {e}"))?;

    let channel_id = channel.id();

    // Request a PTY on the channel
    channel
        .request_pty(
            false,
            "xterm-256color",
            cols,
            rows,
            0, // pixel width
            0, // pixel height
            &[],
        )
        .await
        .map_err(|e| format!("SSH PTY request: {e}"))?;

    // Start a shell
    channel
        .request_shell(false)
        .await
        .map_err(|e| format!("SSH shell request: {e}"))?;

    // Create a write channel for sending input
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(256);

    // Store the handle
    {
        let mut map = state.0.lock().unwrap();
        map.insert(pty_id.clone(), RemotePtyHandle { channel_id, tx });
    }

    // Spawn writer task: reads from mpsc and writes to SSH channel
    let mut writer = channel.make_writer();
    tokio::spawn(async move {
        while let Some(data) = rx.recv().await {
            if writer.write_all(&data).await.is_err() {
                break;
            }
        }
    });

    // Spawn reader task: reads from SSH channel and emits Tauri events
    let id_for_reader = pty_id.clone();
    let mut reader = channel.make_reader();
    tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit(&format!("pty-output-{id_for_reader}"), data);
                }
                Err(_) => break,
            }
        }
    });

    Ok(pty_id)
}

/// Writes data to a remote PTY's stdin.
#[tauri::command]
pub async fn remote_pty_write(
    state: State<'_, RemotePtyMap>,
    pty_id: String,
    data: String,
) -> Result<(), String> {
    let tx = {
        let map = state.0.lock().unwrap();
        let handle = map.get(&pty_id).ok_or_else(|| format!("Remote PTY {pty_id} not found"))?;
        handle.tx.clone()
    };
    tx.send(data.into_bytes())
        .await
        .map_err(|e| format!("write to remote PTY: {e}"))?;
    Ok(())
}

/// Resizes a remote PTY window.
#[tauri::command]
pub async fn remote_pty_resize(
    _state: State<'_, RemotePtyMap>,
    _pty_id: String,
    _cols: u32,
    _rows: u32,
) -> Result<(), String> {
    // TODO: SSH window-change request requires channel handle access.
    // For MVP, resize is a no-op. The initial size is used.
    Ok(())
}

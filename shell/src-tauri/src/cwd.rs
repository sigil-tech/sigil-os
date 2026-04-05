use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::git;

/// Event payload emitted when the active PTY's working directory changes.
#[derive(Clone, Serialize)]
pub struct CwdChangedEvent {
    pub path: String,
    pub git_root: Option<String>,
    pub git_branch: Option<String>,
    pub pty_id: String,
}

/// Per-PTY working directory state.
struct CwdState {
    path: String,
    git_root: Option<String>,
    git_branch: Option<String>,
}

/// Tracks the current working directory for each PTY session.
/// Emits `cwd-changed` events when the active PTY's CWD changes.
pub struct CwdTracker {
    ptys: Mutex<HashMap<String, CwdState>>,
    active_pty: Mutex<Option<String>>,
}

impl CwdTracker {
    pub fn new() -> Self {
        Self {
            ptys: Mutex::new(HashMap::new()),
            active_pty: Mutex::new(None),
        }
    }

    /// Update the CWD for a PTY session. Detects git repo and emits event
    /// if this is the active PTY.
    pub fn update_cwd(&self, app: &AppHandle, pty_id: &str, path: String) {
        let git_root = git::find_repo_root(&path);
        let git_branch = git_root
            .as_ref()
            .and_then(|root| git::current_branch_for(root));

        let event = CwdChangedEvent {
            path: path.clone(),
            git_root: git_root.clone(),
            git_branch: git_branch.clone(),
            pty_id: pty_id.to_string(),
        };

        {
            let mut ptys = self.ptys.lock().unwrap();
            ptys.insert(
                pty_id.to_string(),
                CwdState { path, git_root, git_branch },
            );
        }

        // Only emit if this is the active PTY
        let active = self.active_pty.lock().unwrap();
        if active.as_deref() == Some(pty_id) {
            let _ = app.emit("cwd-changed", event);
        }
    }

    /// Set which PTY is currently focused. Emits a cwd-changed event
    /// for the newly focused PTY's current state.
    pub fn set_active(&self, app: &AppHandle, pty_id: &str) {
        {
            let mut active = self.active_pty.lock().unwrap();
            *active = Some(pty_id.to_string());
        }

        // Emit current state for the newly active PTY
        let ptys = self.ptys.lock().unwrap();
        if let Some(state) = ptys.get(pty_id) {
            let event = CwdChangedEvent {
                path: state.path.clone(),
                git_root: state.git_root.clone(),
                git_branch: state.git_branch.clone(),
                pty_id: pty_id.to_string(),
            };
            let _ = app.emit("cwd-changed", event);
        }
    }

    /// Remove a PTY session (on exit).
    pub fn remove_pty(&self, pty_id: &str) {
        self.ptys.lock().unwrap().remove(pty_id);
    }

    /// Get the active PTY's current CWD path.
    pub fn active_cwd(&self) -> Option<String> {
        let active = self.active_pty.lock().unwrap();
        let pty_id = active.as_ref()?;
        let ptys = self.ptys.lock().unwrap();
        ptys.get(pty_id).map(|s| s.path.clone())
    }
}

/// Returns the current working directory. If a CwdTracker is available and has
/// an active PTY, returns that PTY's CWD. Otherwise falls back to the static
/// resolution (SIGIL_CWD > ~/workspace > $HOME).
#[tauri::command]
pub fn get_cwd(tracker: tauri::State<'_, CwdTracker>) -> Result<String, String> {
    if let Some(cwd) = tracker.active_cwd() {
        return Ok(cwd);
    }
    // Fallback: static resolution for startup before any PTY exists
    resolve_initial_cwd()
}

/// Resolve initial CWD before any PTY session exists.
pub fn resolve_initial_cwd() -> Result<String, String> {
    if let Ok(cwd) = std::env::var("SIGIL_CWD") {
        if std::path::Path::new(&cwd).exists() {
            return Ok(cwd);
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let workspace = format!("{home}/workspace");
        if std::path::Path::new(&workspace).exists() {
            return Ok(workspace);
        }
        return Ok(home);
    }
    std::env::current_dir()
        .map_err(|e| format!("cwd: {e}"))
        .and_then(|p| {
            p.into_os_string()
                .into_string()
                .map_err(|_| "cwd: path is not valid UTF-8".to_string())
        })
}

/// Set the active PTY (called by frontend on terminal focus).
#[tauri::command]
pub fn set_active_pty(
    app: AppHandle,
    tracker: tauri::State<'_, CwdTracker>,
    pty_id: String,
) -> Result<(), String> {
    tracker.set_active(&app, &pty_id);
    Ok(())
}

/// Navigate to a directory: update CWD tracker and write `cd` to the active PTY.
#[tauri::command]
pub fn navigate_to(
    _app: AppHandle,
    tracker: tauri::State<'_, CwdTracker>,
    pty_state: tauri::State<'_, crate::pty::PtyMap>,
    path: String,
) -> Result<(), String> {
    // Validate path exists
    if !std::path::Path::new(&path).is_dir() {
        return Err(format!("not a directory: {path}"));
    }

    // Write cd command to the active PTY
    let active = tracker.active_pty.lock().unwrap().clone();
    if let Some(pty_id) = active {
        let cmd = format!("cd {}\n", shell_escape(&path));
        let _ = pty_state.write_to(&pty_id, cmd.as_bytes());
    }

    Ok(())
}

/// Minimal shell escaping for paths (wrap in single quotes).
fn shell_escape(s: &str) -> String {
    // Single-quote the path, escaping any embedded single quotes
    format!("'{}'", s.replace('\'', "'\\''"))
}

// --- OSC 7 parsing ---

/// Extract a file path from an OSC 7 escape sequence in the given data.
/// OSC 7 format: \x1b]7;file://hostname/path\x07 (or \x1b\\ as terminator)
/// Returns the decoded path and the total byte length consumed (including the
/// escape sequence), or None if no complete OSC 7 is found.
pub fn extract_osc7(data: &[u8]) -> Option<(String, usize)> {
    // Look for ESC ] 7 ; prefix
    let prefix = b"\x1b]7;";
    let start = data.windows(prefix.len()).position(|w| w == prefix)?;
    let after_prefix = start + prefix.len();

    // Find terminator: BEL (\x07) or ST (\x1b\\)
    let rest = &data[after_prefix..];
    let (url_end, seq_end) = if let Some(pos) = rest.iter().position(|&b| b == 0x07) {
        (pos, after_prefix + pos + 1)
    } else if let Some(pos) = rest.windows(2).position(|w| w == b"\x1b\\") {
        (pos, after_prefix + pos + 2)
    } else {
        return None; // Incomplete sequence
    };

    let url = std::str::from_utf8(&rest[..url_end]).ok()?;

    // Parse file:// URL — extract path component
    let path = if let Some(stripped) = url.strip_prefix("file://") {
        // file://hostname/path or file:///path
        if let Some(slash_pos) = stripped.find('/') {
            &stripped[slash_pos..]
        } else {
            stripped
        }
    } else {
        // Bare path (non-standard but handle gracefully)
        url
    };

    // URL-decode percent-encoded characters
    let decoded = percent_decode(path);
    Some((decoded, seq_end))
}

/// Remove all OSC 7 sequences from data, returning cleaned output.
pub fn strip_osc7(data: &[u8]) -> Vec<u8> {
    let prefix = b"\x1b]7;";
    let mut result = Vec::with_capacity(data.len());
    let mut i = 0;

    while i < data.len() {
        if data[i..].starts_with(prefix) {
            // Find terminator
            let rest = &data[i + prefix.len()..];
            if let Some(pos) = rest.iter().position(|&b| b == 0x07) {
                i += prefix.len() + pos + 1;
                continue;
            } else if let Some(pos) = rest.windows(2).position(|w| w == b"\x1b\\") {
                i += prefix.len() + pos + 2;
                continue;
            }
            // Incomplete — leave as-is (will be buffered by caller)
        }
        result.push(data[i]);
        i += 1;
    }

    result
}

/// Decode percent-encoded characters in a URL path.
fn percent_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().and_then(|c| hex_val(c));
            let lo = chars.next().and_then(|c| hex_val(c));
            if let (Some(h), Some(l)) = (hi, lo) {
                result.push((h << 4 | l) as char);
            } else {
                result.push('%');
            }
        } else {
            result.push(b as char);
        }
    }
    result
}

fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_osc7_bel_terminator() {
        let data = b"\x1b]7;file://hostname/home/nick/workspace\x07rest";
        let (path, consumed) = extract_osc7(data).unwrap();
        assert_eq!(path, "/home/nick/workspace");
        assert_eq!(&data[consumed..], b"rest");
    }

    #[test]
    fn test_extract_osc7_st_terminator() {
        let data = b"\x1b]7;file://hostname/home/nick\x1b\\rest";
        let (path, consumed) = extract_osc7(data).unwrap();
        assert_eq!(path, "/home/nick");
        assert_eq!(&data[consumed..], b"rest");
    }

    #[test]
    fn test_extract_osc7_triple_slash() {
        let data = b"\x1b]7;file:///tmp/foo\x07";
        let (path, _) = extract_osc7(data).unwrap();
        assert_eq!(path, "/tmp/foo");
    }

    #[test]
    fn test_extract_osc7_percent_encoded() {
        let data = b"\x1b]7;file:///home/nick/my%20project\x07";
        let (path, _) = extract_osc7(data).unwrap();
        assert_eq!(path, "/home/nick/my project");
    }

    #[test]
    fn test_extract_osc7_incomplete() {
        let data = b"\x1b]7;file:///home/nick";
        assert!(extract_osc7(data).is_none());
    }

    #[test]
    fn test_extract_osc7_no_sequence() {
        let data = b"just regular terminal output";
        assert!(extract_osc7(data).is_none());
    }

    #[test]
    fn test_extract_osc7_with_prefix_data() {
        let data = b"prompt$ \x1b]7;file://sigil/home/nick/workspace/sigil\x07";
        let (path, _) = extract_osc7(data).unwrap();
        assert_eq!(path, "/home/nick/workspace/sigil");
    }

    #[test]
    fn test_strip_osc7() {
        let data = b"hello\x1b]7;file:///tmp\x07world";
        let cleaned = strip_osc7(data);
        assert_eq!(cleaned, b"helloworld");
    }

    #[test]
    fn test_strip_osc7_multiple() {
        let data = b"a\x1b]7;file:///tmp\x07b\x1b]7;file:///home\x07c";
        let cleaned = strip_osc7(data);
        assert_eq!(cleaned, b"abc");
    }

    #[test]
    fn test_strip_osc7_no_sequences() {
        let data = b"no escape sequences here";
        let cleaned = strip_osc7(data);
        assert_eq!(cleaned, data.to_vec());
    }

    #[test]
    fn test_shell_escape() {
        assert_eq!(shell_escape("/home/nick"), "'/home/nick'");
        assert_eq!(shell_escape("/home/nick's dir"), "'/home/nick'\\''s dir'");
    }
}

use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// List directory contents, sorted (directories first, then files).
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("not a directory: {path}"));
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|e| format!("read_dir: {e}"))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("entry: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip hidden files/directories
        if name.starts_with('.') {
            continue;
        }
        let file_type = entry.file_type().map_err(|e| format!("file_type: {e}"))?;
        entries.push(DirEntry {
            path: entry.path().to_string_lossy().to_string(),
            name,
            is_dir: file_type.is_dir(),
        });
    }

    // Sort: directories first, then alphabetical
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Read a file's contents as a UTF-8 string.
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read_file: {e}"))
}

/// Write a string to a file (creates or overwrites).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("write_file: {e}"))
}

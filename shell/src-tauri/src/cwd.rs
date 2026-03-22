/// Returns a useful working directory for the user.
/// Priority: SIGIL_CWD env var > ~/workspace > $HOME > process cwd.
/// Used by GitView to determine the initial repository path.
#[tauri::command]
pub fn get_cwd() -> Result<String, String> {
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

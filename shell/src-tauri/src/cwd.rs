/// Returns the current working directory of the Tauri process.
/// Used by GitView to determine the initial repository path.
#[tauri::command]
pub fn get_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map_err(|e| format!("cwd: {e}"))
        .and_then(|p| {
            p.into_os_string()
                .into_string()
                .map_err(|_| "cwd: path is not valid UTF-8".to_string())
        })
}

use git2::Repository;
use serde::Serialize;

#[derive(Serialize)]
pub struct CommitSummary {
    pub sha: String,
    pub message: String,
    pub author: String,
    pub timestamp_unix: i64,
}

#[derive(Serialize)]
pub struct FileStatus {
    pub path: String,
    pub status: String,
}

#[tauri::command]
pub fn git_log(repo_path: String, limit: u32) -> Result<Vec<CommitSummary>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| format!("open repo: {e}"))?;
    let mut revwalk = repo.revwalk().map_err(|e| format!("revwalk: {e}"))?;
    if let Err(_) = revwalk.push_head() {
        return Ok(Vec::new()); // No commits yet
    }

    let mut commits = Vec::new();
    for (i, oid) in revwalk.enumerate() {
        if i as u32 >= limit {
            break;
        }
        let oid = oid.map_err(|e| format!("oid: {e}"))?;
        let commit = repo.find_commit(oid).map_err(|e| format!("find_commit: {e}"))?;
        let full_sha = oid.to_string();
        let sha = full_sha[..full_sha.len().min(8)].to_string();
        commits.push(CommitSummary {
            sha,
            message: commit.summary().unwrap_or("").to_string(),
            author: commit.author().name().unwrap_or("").to_string(),
            timestamp_unix: commit.time().seconds(),
        });
    }
    Ok(commits)
}

#[tauri::command]
pub fn git_status(repo_path: String) -> Result<Vec<FileStatus>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| format!("open repo: {e}"))?;
    let statuses = repo.statuses(None).map_err(|e| format!("statuses: {e}"))?;

    let mut files = Vec::new();
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let st = entry.status();
        let status = if st.contains(git2::Status::INDEX_NEW)
            || st.contains(git2::Status::INDEX_MODIFIED)
            || st.contains(git2::Status::INDEX_DELETED)
        {
            "staged"
        } else if st.contains(git2::Status::WT_MODIFIED) {
            "modified"
        } else if st.contains(git2::Status::WT_NEW) {
            "untracked"
        } else if st.contains(git2::Status::WT_DELETED) || st.contains(git2::Status::INDEX_DELETED) {
            "deleted"
        } else {
            "modified"
        };
        files.push(FileStatus {
            path,
            status: status.to_string(),
        });
    }
    Ok(files)
}

#[tauri::command]
pub fn git_diff(repo_path: String, file_path: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(|e| format!("open repo: {e}"))?;

    // Check if file is untracked — diff_tree_to_workdir_with_index has no HEAD entry to diff
    // against for untracked files and will produce an empty result, so we handle them explicitly.
    let statuses = repo.statuses(None).map_err(|e| format!("statuses: {e}"))?;
    let is_untracked = statuses.iter().any(|entry| {
        entry.path() == Some(&file_path) && entry.status().contains(git2::Status::WT_NEW)
    });

    if is_untracked {
        // For untracked files, show the file content as all additions.
        let full_path = std::path::Path::new(&repo_path).join(&file_path);
        let content = std::fs::read_to_string(&full_path)
            .map_err(|e| format!("read file: {e}"))?;
        let mut output = format!("--- /dev/null\n+++ b/{file_path}\n");
        for line in content.lines() {
            output.push('+');
            output.push_str(line);
            output.push('\n');
        }
        return Ok(output);
    }

    // Normal diff for tracked files.
    let head = repo.head().map_err(|e| format!("head: {e}"))?;
    let tree = head.peel_to_tree().map_err(|e| format!("peel tree: {e}"))?;

    let mut opts = git2::DiffOptions::new();
    opts.pathspec(&file_path);

    let diff = repo
        .diff_tree_to_workdir_with_index(Some(&tree), Some(&mut opts))
        .map_err(|e| format!("diff: {e}"))?;

    let mut output = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        use git2::DiffLineType::{Addition, Context, Deletion};
        let prefix = match line.origin_value() {
            Addition => "+",
            Deletion => "-",
            Context => " ",
            _ => "",
        };
        output.push_str(prefix);
        output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })
    .map_err(|e| format!("diff print: {e}"))?;

    Ok(output)
}

#[tauri::command]
pub fn git_branch(repo_path: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(|e| format!("open repo: {e}"))?;
    // Bind to a local so the Reference (and its borrow of `repo`) is dropped
    // before `repo` itself is dropped at end of scope.
    let result = match repo.head() {
        Ok(head) => Ok(head.shorthand().unwrap_or("HEAD").to_string()),
        Err(_) => Ok("(no commits)".to_string()),
    };
    result
}

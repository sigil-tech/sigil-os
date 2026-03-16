# Data Model: Shell Views Implementation

This feature has no new persistent data entities. All data structures already exist in the codebase. This document captures the existing types for reference.

## Existing Types (Rust backend → TypeScript frontend)

### CommitSummary
Produced by `git_log` in `git.rs`, consumed by `GitView.tsx`.

| Field | Type | Description |
|-------|------|-------------|
| sha | String | First 8 chars of commit OID |
| message | String | First line of commit message |
| author | String | Author name |
| timestamp_unix | i64 | Unix timestamp of commit |

### FileStatus
Produced by `git_status` in `git.rs`, consumed by `GitView.tsx`.

| Field | Type | Description |
|-------|------|-------------|
| path | String | Repo-relative file path |
| status | String | One of: staged, modified, untracked, deleted |

### ContainerSummary
Produced by `containers_list` in `containers.rs`, consumed by `ContainerView.tsx`.

| Field | Type | Description |
|-------|------|-------------|
| id | String | First 12 chars of container ID |
| name | String | Container name (without leading `/`) |
| image | String | Image name and tag |
| status | String | Docker status string (e.g. "Up 2 hours") |
| ports | String | Formatted port mappings (e.g. "8080:80/tcp") |
| created | i64 | Unix timestamp of container creation |

## New Command

### get_cwd
New Tauri command added in `cwd.rs`.

- **Input**: none
- **Output**: `Result<String, String>` — absolute path string on success, error message on failure
- **Behavior**: Returns `std::env::current_dir()` as a UTF-8 string. Returns error if cwd is unavailable or not valid UTF-8.

# Quickstart: Shell Views Implementation

## Testing the Editor View

1. Boot Sigil OS (VM or MBP)
2. Press `Ctrl+2` — Neovim should open within 2 seconds filling the pane
3. Type some text, navigate, open a file (`:e /etc/hosts`) — all input should be responsive
4. Press `Ctrl+1` to switch to terminal, then `Ctrl+2` again — Neovim session resumes in same state
5. Resize the window — Neovim buffer should reflow to match new dimensions

**Expected failure before fix**: "Failed to launch editor: No such file or directory (os error 2)" or similar nvim-not-found error displayed in the pane.

## Testing the Git View

1. Open a terminal (`Ctrl+1`), navigate to a git repository (e.g., `cd ~/workspace/sigil-os`)
2. Press `Ctrl+4` — the git view should show the current branch, modified files, and recent commits
3. Click a modified file — the diff should appear in the right panel
4. Navigate to a non-repo directory (`cd /tmp`), switch away, switch back — "Working tree clean" or similar message

**Expected failure before fix**: Git view always shows branch `(no branch)` and no files because it opens `/home` which is not a git repo.

**Note**: After the fix, `get_cwd` returns the process working directory at Sigil Shell launch time, not the terminal's live cwd. If the user changes directory in the terminal and wants the git view to reflect that directory, they must manually enter the path (future feature).

## Testing the Containers View

1. Ensure Docker is running (`systemctl status docker` or `docker ps`)
2. Have at least one container present (`docker run -d --name test nginx` if needed)
3. Press `Ctrl+5` — the container list should load within 3 seconds
4. Click Start/Stop/Restart — buttons should execute and the list should refresh
5. Click a container row — logs should appear inline

**Expected failure before fix**: "Docker unavailable — ..." error, or a perpetual loading state, because `http+unix://` scheme is not handled.

## Validation Commands

```bash
# Check nix flake is valid after adding neovim
cd ~/workspace/sigil-os
nix flake check --extra-experimental-features "nix-command flakes"

# Check Rust compilation with unix-socket feature
cd ~/workspace/sigil-os/shell
cargo build --manifest-path src-tauri/Cargo.toml

# Run VM for full runtime test
make run-vm
```

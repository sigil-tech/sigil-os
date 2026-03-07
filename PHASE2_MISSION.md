# Phase 2 Mission — Aether Shell v0

You are building the Aether Shell: a full-screen, keyboard-first, single-pane developer
environment for Aether OS. It runs as a Tauri app on Hyprland/Wayland.

**Repos involved:**
- `sigil_os/` — this repo; the Tauri shell lives in `shell/` (currently just `.gitkeep`)
- `aether/` — the daemon repo at `../aether/`; issues #34 and #35 require changes there too

**GitHub repo slug:** `wambozi/aether`
**GITHUB_TOKEN is set in your environment.** Use it for all API calls.

## Rules

1. Work through issues in the exact order listed below — later issues depend on earlier ones.
2. Before starting each issue, read all relevant existing files.
3. After implementing each issue:
   - Run `cargo build` from `shell/src-tauri/` — must pass.
   - Run `npm run build` from `shell/` — must pass (TypeScript, no type errors).
   - Commit with message: `feat: <short description> (closes #<N>)`
   - Close the GitHub issue via API (curl commands below).
4. Do not skip an issue. Do not batch commits across issues.
5. `shell/` is the Tauri project root. `shell/src-tauri/` is the Rust backend.
6. The frontend stack is **Preact + TypeScript** — not React. Use `h` from `preact`, not `React.createElement`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| App framework | Tauri 2.x |
| Frontend | Preact + TypeScript |
| Styling | Hand-written CSS, IBM Plex Mono font |
| Terminal emulation | xterm.js |
| PTY (Rust) | `portable-pty` crate |
| Git (Rust) | `git2` crate |
| Containers (Rust) | Docker Engine API via `reqwest` (HTTP to `/var/run/docker.sock`) |
| Daemon IPC (Rust) | Unix socket, newline-delimited JSON (matches `aether/internal/socket`) |

## Close Issue Command

After each successful build + commit:
```bash
ISSUE=<number>
curl -s -X POST "https://api.github.com/repos/wambozi/aether/issues/${ISSUE}/comments" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -d "{\"body\": \"Implemented. See commit $(git rev-parse --short HEAD).\"}"

curl -s -X PATCH "https://api.github.com/repos/wambozi/aether/issues/${ISSUE}" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -d '{"state": "closed", "state_reason": "completed"}'
```

---

## Issue Queue (implement in this order)

---

### Issue #24 — Tauri project scaffold

Initialize the Tauri 2.x application in `shell/`. Replace the `.gitkeep` with a full project.

**Acceptance criteria:**
- `shell/` is a valid Tauri 2.x project (`tauri.conf.json`, `src-tauri/Cargo.toml`, `src/`)
- Frontend: Preact + TypeScript, bundled with Vite
- `tauri.conf.json`:
  - `productName`: `"aether-shell"`
  - `windows`: `[{ "fullscreen": true, "decorations": false, "transparent": false }]`
  - `bundle.identifier`: `"dev.aether.shell"`
- `src-tauri/Cargo.toml` includes initial deps: `tauri`, `serde`, `serde_json`, `tokio`
- App renders a placeholder `<div id="app">Aether Shell</div>` — full build passes
- `shell/src/main.tsx` entry point uses Preact's `render()`
- Global CSS loads IBM Plex Mono from `@fontsource/ibm-plex-mono` (npm package)
- Background color `#0a0a0a`, text color `#e5e5e5`

**Shell structure after this issue:**
```
shell/
├── src/
│   ├── main.tsx          ← Preact entry
│   ├── app.tsx           ← root component (placeholder)
│   └── styles/
│       └── global.css    ← IBM Plex Mono, base colors
├── src-tauri/
│   ├── src/
│   │   └── main.rs       ← Tauri builder
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json          ← Preact, TypeScript, Vite, xterm.js, @fontsource/ibm-plex-mono
├── tsconfig.json
└── vite.config.ts
```

---

### Issue #36 — Shell to daemon Unix socket client (Rust side)

Before any views touch the daemon, establish the Rust-side socket client.

**Acceptance criteria:**
- `shell/src-tauri/src/daemon_client.rs` — a `DaemonClient` struct that:
  - Connects to the aetherd Unix socket (default path: `/run/user/$UID/aetherd.sock`, configurable)
  - Sends newline-delimited JSON requests: `{"method":"<m>","payload":{...}}\n`
  - Reads newline-delimited JSON responses
  - Reconnects automatically if the socket drops (retry with 2s backoff, up to 10 attempts)
  - Is `Arc<Mutex<DaemonClient>>` safe for concurrent Tauri command use
- Implements methods for all existing daemon socket handlers:
  `status`, `events`, `suggestions`, `files`, `commands`, `patterns`, `trigger-summary`, `feedback`
- Tauri state: register `DaemonClient` as managed Tauri state in `main.rs`
- Tauri commands exposed to frontend (via `#[tauri::command]`):
  `daemon_status`, `daemon_events`, `daemon_suggestions`, `daemon_files`,
  `daemon_commands`, `daemon_patterns`, `daemon_trigger_summary`, `daemon_feedback`
- If daemon is not running, commands return a structured error (not a panic)

---

### Issue #25 — Left rail navigation component

**Acceptance criteria:**
- `shell/src/components/LeftRail.tsx` — 56px-wide vertical strip
- 6 icon buttons in order: Terminal, Editor, Browser, Git, Containers, Insights
- Use simple SVG icons inline (no icon library dependency)
- Keyboard shortcuts `Mod+1` through `Mod+6` switch active view (`Mod` = Ctrl on Linux)
- Active icon is highlighted with accent color `#6366f1`
- Bottom of rail: three status indicators
  - Daemon health dot (green = connected, red = disconnected) — reads from `daemon_status`
  - Cactus mode label (`local` / `hybrid` / `cloud`) — from status response
  - Memory usage in MB — from status response `rss_mb` field
- Status indicators poll daemon every 30 seconds
- Rail is keyboard-accessible (focus ring visible)
- `shell/src/app.tsx` updated: render `<LeftRail>` on the left, placeholder content area on the right

---

### Issue #28 — Content pane layout and split-pane foundation

**Acceptance criteria:**
- `shell/src/components/ContentPane.tsx` — fills all space between left rail and input bar
- `shell/src/layouts/` directory with layout types: `single` (default) and `split` (future)
- Switching views via left rail swaps the active view component without destroying PTY state
  - Use a "keep-alive" pattern: mount all views, show/hide via CSS `display:none`, so PTYs stay alive
- `Ctrl+\` keyboard shortcut registered (for split-pane, stub for now — log "split-pane: not yet implemented")
- Smooth 100ms opacity transition on view switch
- `shell/src/app.tsx` updated: `<LeftRail>` + `<ContentPane>` side by side, `<InputBar>` placeholder at bottom

---

### Issue #27 — Unified input bar — shell mode

**Acceptance criteria:**
- `shell/src/components/InputBar.tsx` — fixed bar at bottom of shell, always visible, height 40px
- Shell mode: prefix `$` displayed in `#6366f1`, monospace
- `Enter` sends the typed command to the active Terminal PTY (via Tauri command)
- Command history: `ArrowUp` / `ArrowDown` cycle through session history (in-memory array, max 1000)
- `Alt+Tab` shortcut registered — log "AI mode: coming in issue #35" for now, mode indicator shows `✦`
- Input bar has a mode indicator on the left: `$` for shell, `✦` for AI
- Background `#111111`, border-top `1px solid #222222`

---

### Issue #26 — Terminal view with xterm.js connected to PTY via Tauri

**Acceptance criteria:**
- `shell/src/components/TerminalView.tsx`:
  - Renders an xterm.js `Terminal` instance in a full-height div
  - Connects to a Rust PTY via Tauri event stream (not polling)
  - `FitAddon` applied on mount and window resize
  - Supports 256 colors and truecolor (`allowTransparency: false`, `cursorStyle: "block"`)
  - Theme matches shell: background `#0a0a0a`, foreground `#e5e5e5`, cursor `#6366f1`
- `shell/src-tauri/src/pty.rs`:
  - Uses `portable-pty` crate
  - `spawn_pty(shell: String, cols: u16, rows: u16) -> pty_id: String` Tauri command
  - `pty_write(pty_id: String, data: String)` Tauri command — writes to PTY master
  - `pty_resize(pty_id: String, cols: u16, rows: u16)` Tauri command
  - PTY output streamed to frontend via Tauri event `pty-output-{pty_id}`
  - Multiple PTYs supported simultaneously (HashMap keyed by UUID)
  - PTY inherits the user's `$SHELL`, falling back to `/bin/bash`
- Input bar's `Enter` calls `pty_write` on the active terminal's PTY ID

---

### Issue #29 — Editor view: Neovim via PTY embedded in xterm.js

**Acceptance criteria:**
- `shell/src/components/EditorView.tsx`:
  - Reuses the xterm.js + PTY infrastructure from #26
  - Spawns a dedicated PTY running `nvim` on mount
  - Full Neovim works: LSP, plugins, mouse, splits
  - PTY ID stored in component state; PTY stays alive when switching to other views (keep-alive from #28)
- `shell/src-tauri/src/editor.rs`:
  - `spawn_editor(file_path: Option<String>) -> pty_id: String` Tauri command
  - Launches `nvim <file_path>` or plain `nvim` in a PTY
  - Returns the same PTY ID format as `pty.rs` (shares the same PTY map)
- Switching back to Editor view from another view resumes the existing Neovim session

---

### Issue #30 — Browser view: Tauri WebView minimal browser

**Acceptance criteria:**
- `shell/src/components/BrowserView.tsx`:
  - URL bar input at the top of the browser view
  - `<webview>` tag (Tauri/WebKitGTK) renders the page (or use an iframe backed by WebView)
  - Navigation: back (`Alt+Left`), forward (`Alt+Right`), reload (`Ctrl+R`)
  - Entering a URL and pressing Enter navigates to it
  - Bare domain entries (no scheme) prepend `https://`
  - Opens terminal-clicked URLs: emit a Tauri event `open-url` and BrowserView listens
- Default home page: `about:blank` with a simple "Aether Browser" label

---

### Issue #31 — Git view: commit log, working tree, diffs

**Acceptance criteria:**
- `shell/src-tauri/src/git.rs`:
  - Uses `git2` crate
  - `git_log(repo_path: String, limit: u32) -> Vec<CommitSummary>` — returns `{sha, message, author, timestamp_unix}`
  - `git_status(repo_path: String) -> Vec<FileStatus>` — returns `{path, status}` where status is `modified|staged|untracked|deleted`
  - `git_diff(repo_path: String, file_path: String) -> String` — unified diff string for a file
  - `git_branch(repo_path: String) -> String` — current branch name
  - All commands exposed as Tauri commands
- `shell/src/components/GitView.tsx`:
  - Two-panel layout: left = file list (status), right = diff
  - Header shows current branch name
  - Commit log section below: last 20 commits with message, author, relative timestamp
  - Clicking a file loads its diff in the right panel
  - Reads from the same working directory the daemon watches (`daemon_files` for cross-reference)
  - Branch name also pushed to LeftRail status area

---

### Issue #32 — Container view: Docker container status and controls

**Acceptance criteria:**
- `shell/src-tauri/src/containers.rs`:
  - Talks to Docker Engine API via HTTP over Unix socket (`/var/run/docker.sock`) using `reqwest` with a custom connector
  - `containers_list() -> Vec<ContainerSummary>` — `{id, name, image, status, ports, created}`
  - `container_start(id: String)`, `container_stop(id: String)`, `container_restart(id: String)` — Tauri commands
  - `container_logs(id: String, tail: u32) -> String` — last N lines of container logs
  - All commands exposed as Tauri commands
  - Returns structured error if Docker socket is unavailable (not a panic)
- `shell/src/components/ContainerView.tsx`:
  - Table of containers: name, image, status (colored dot), uptime, port bindings
  - Row actions: Start / Stop / Restart buttons
  - Clicking a row expands an inline log tail (last 50 lines, monospace)
  - Auto-refreshes every 10 seconds
  - Shows "Docker unavailable" gracefully if socket missing

---

### Issue #33 — Insights view: daemon socket connection

**Acceptance criteria:**
- `shell/src/components/InsightsView.tsx`:
  - Connects to daemon via the `DaemonClient` from #36 (through Tauri commands)
  - Four sections rendered in tabs:
    1. **Events** — recent events list (file, git, process, terminal) via `daemon_events`
    2. **Patterns** — detected patterns with name, description, confidence score via `daemon_patterns`
    3. **AI History** — Cactus routing history: method, routing decision (local/cloud), latency ms, timestamp
    4. **Prompt Previews** — last 5 LLM prompts sent to Cactus (text, truncated to 500 chars)
  - AI interaction metrics summary at top: total queries today, local %, suggestion acceptance %
  - Kill switch button: labeled "Purge all local data" → calls `aetherctl purge` equivalent via daemon
    (send `purge` socket method — add this handler to `aether/cmd/aetherd/main.go`)
  - Data refreshes every 5 seconds while Insights tab is active

---

### Issue #34 — Suggestion bar: daemon push via socket subscription

This issue modifies **both** repos: `sigil_os/shell/` and `aether/`.

**Changes to `aether/` (daemon):**
- `aether/internal/socket/server.go`: add a `subscribe` method
  - Request: `{"method":"subscribe","payload":{"topic":"suggestions"}}`
  - Response: `{"ok":true,"payload":{"subscribed":true}}`
  - After subscribing, the server pushes suggestion events over the same connection as they arrive:
    `{"event":"suggestion","payload":{"id":"...","text":"...","confidence":0.87}}\n`
  - The `Notifier.OnSuggestion` hook must be wired in `aether/cmd/aetherd/main.go` to fan suggestions to all subscribers
- `aether/cmd/aetherd/main.go`: wire the subscription fan-out

**Changes to `sigil_os/shell/`:**
- `shell/src-tauri/src/daemon_client.rs`: add `subscribe_suggestions()` method
  - Opens a dedicated long-lived socket connection for the subscription
  - Receives push events and emits them as Tauri events: `daemon-suggestion`
- `shell/src/components/SuggestionBar.tsx`:
  - Fixed-height strip (32px) between `ContentPane` and `InputBar`
  - Displays one suggestion at a time (rotating every 8 seconds if multiple queued)
  - `Tab` key: accepts current suggestion, calls `daemon_feedback(id, "accept")`
  - `Esc` key: dismisses suggestion, calls `daemon_feedback(id, "dismiss")`
  - Suggestion text truncated with ellipsis if over one line
  - Background `#111111`, subtle left border `3px solid #6366f1`
  - Hidden (zero height) when no suggestions pending
- `shell/src/app.tsx`: add `<SuggestionBar>` between `<ContentPane>` and `<InputBar>`

**Commit strategy:** two commits — one in `aether/`, one in `sigil_os/` — both referencing `closes #34`.

---

### Issue #35 — AI mode input bar (Alt+Tab toggle, routes through daemon to Cactus)

This issue modifies **both** repos: `sigil_os/shell/` and `aether/`.

**Changes to `aether/` (daemon):**
- `aether/internal/socket/server.go`: register `ai-query` method
  - Request: `{"method":"ai-query","payload":{"query":"...","context":"..."}}`
  - Forwards to Cactus via the existing `cactus.Client.Complete()` with routing `localfirst`
  - Logs an `AIInteraction` event to the store (via `store.InsertAIInteraction`)
  - Response: `{"ok":true,"payload":{"response":"...","routing":"local|cloud","latency_ms":120}}`
- `aether/cmd/aetherd/main.go`: register the `ai-query` handler

**Changes to `sigil_os/shell/`:**
- `shell/src-tauri/src/daemon_client.rs`: add `ai_query(query: String, context: String) -> AIQueryResponse` command
- `shell/src/components/InputBar.tsx`:
  - `Alt+Tab` properly toggles mode; mode state lifted to app-level context
  - AI mode: `✦` prefix, input placeholder "Ask anything about your workflow..."
  - `Enter` in AI mode: calls `daemon_ai_query` Tauri command with query text + current view as context
  - While waiting for response: show a subtle spinner/pulse on the `✦` indicator
  - On response: emit a Tauri event `ai-response` with the response text and routing info
- `shell/src/components/ContentPane.tsx`:
  - Listens for `ai-response` event
  - Renders response in a new ephemeral "AI" view overlaid on the current view
  - Response text rendered as markdown (use `marked` npm package)
  - `Esc` closes the AI response overlay and returns to the previous view
  - Routing info shown as a small badge: `local` (green) or `cloud` (blue)

**Commit strategy:** two commits — one in `aether/`, one in `sigil_os/` — both referencing `closes #35`.

---

### Issue #37 — Phase 2 exit criteria validation

Documentation only — no new code. Create `sigil_os/docs/phases/phase_2_shell_v0.md`.

Document the following exit criteria with status and manual verification steps:

```markdown
# Phase 2 — Aether Shell v0: Exit Criteria

## Status

- [ ] Engineer uses Aether Shell as sole interface for a full day of development without switching back to the native WM
      Verification: boot into NixOS on 2017 MBP, launch aether-shell, work for a full day
      Status: pending NVMe install on 2017 MacBook Pro

- [ ] All 6 views functional: Terminal, Editor, Browser, Git, Containers, Insights
      Verification: open each view via Cmd+1 through Cmd+6, verify each renders and responds
      Status: implemented, requires Linux runtime test

- [ ] Terminal view: PTY connected, commands execute and output returns
      Verification: `echo hello` in terminal returns "hello"

- [ ] Editor view: Neovim launches, LSP works, session persists across view switches
      Verification: open a .go file, verify gopls provides completions, switch views and return

- [ ] Suggestion bar receives live daemon suggestions
      Verification: run daemon, trigger activity, verify suggestions appear in bar within 60s

- [ ] AI mode: routes a query through daemon to Cactus, response renders in content pane
      Verification: Alt+Tab, type "what files did I edit today?", verify routed response appears

- [ ] Shell total memory under 200MB (shell process + WebView, daemon excluded)
      Verification: `ps aux | grep aether-shell`, check RSS column after 30min of use

- [ ] No PTY state lost when switching between tool views
      Verification: start a long-running process in terminal, switch to git view, switch back — process still running
```

After writing the doc, close issue #37.

---

## Completion

When all issues are closed:

```bash
curl -s "https://api.github.com/repos/wambozi/aether/milestones/2" \
  -H "Authorization: token $GITHUB_TOKEN" | grep '"open_issues"'
```

If `open_issues` is 1 (only the epic #3 remains), close it:

```bash
curl -s -X PATCH "https://api.github.com/repos/wambozi/aether/issues/3" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -d '{"state": "closed", "state_reason": "completed"}'
```

Phase 2 is done.

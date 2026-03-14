# Data Model: Sigil Shell v0

**Feature**: 001-sigil-shell-v0
**Date**: 2026-03-14

## Entities

### View

Represents one of six integrated developer tool views in the shell.

| Field | Type | Description |
|-------|------|-------------|
| id | ViewId | Unique identifier: `terminal`, `editor`, `browser`, `git`, `containers`, `insights` |
| label | string | Display name shown in left rail and command palette |
| shortcut | string | Keyboard shortcut (Ctrl+1 through Ctrl+6) |
| icon | string | Icon identifier for left rail rendering |
| isActive | boolean | Whether this view is currently visible in the content pane |

**Constraints**: Exactly 6 views exist. ViewId is an enum, not a free-form string. Only one view is active at a time in single-pane mode; two in split mode.

---

### PTY Session

Represents a pseudo-terminal connection between the shell and a spawned process.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (string) | Unique session identifier (UUID v4) |
| program | string | Spawned program path (e.g., `/bin/zsh`, `nvim`) |
| cols | integer | Current terminal width in columns |
| rows | integer | Current terminal height in rows |
| isAlive | boolean | Whether the PTY process is still running |

**Relationships**: A TerminalView has exactly one PTY Session. An EditorView has exactly one PTY Session. PTY Sessions persist across view switches (keep-alive).

**State transitions**:
- `spawning` → `alive` (on successful PTY creation)
- `alive` → `dead` (on process exit or error)
- `dead` → `spawning` (on user-initiated restart)

---

### Suggestion

A daemon-generated recommendation pushed to the shell via subscription.

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Unique suggestion identifier from daemon |
| category | enum | `pattern`, `insight`, or `ai_discovery` |
| confidence | float (0.0–1.0) | Daemon's confidence in the suggestion |
| title | string | Short display title (bold in suggestion bar) |
| body | string | Descriptive text (truncated with ellipsis if overflow) |
| action_cmd | string (optional) | Shell command to execute on acceptance |
| status | enum | `new`, `shown`, `accepted`, `dismissed`, `ignored` |
| created_at | ISO 8601 timestamp | When the daemon generated the suggestion |

**State transitions**:
- `new` → `shown` (when displayed in suggestion bar)
- `shown` → `accepted` (user presses Tab)
- `shown` → `dismissed` (user presses Esc)
- `shown` → `shown` (rotated past, then shown again)
- Any → `ignored` (expired without interaction)

**Constraints**: Maximum queue depth is unbounded (daemon controls emission rate). Bar rotates every 8 seconds.

---

### DaemonStatus

Health and metadata reported by the sigild daemon.

| Field | Type | Description |
|-------|------|-------------|
| status | string | `ok` or error state |
| version | string | Daemon version (e.g., `0.1.0-dev`) |
| rss_mb | integer | Resident memory in megabytes |
| notifier_level | integer (0–4) | Current notification level |
| current_keybinding_profile | string | Active keybinding profile |
| next_digest_at | ISO 8601 (optional) | Next digest time (level 1 only) |

**Constraints**: Polled every 30 seconds. Used for left rail status display.

---

### SplitState

Layout configuration for the content pane.

| Field | Type | Description |
|-------|------|-------------|
| mode | enum | `none`, `horizontal`, `vertical` |
| primaryView | ViewId | View displayed in the primary (left/top) pane |
| secondaryView | ViewId | View displayed in the secondary (right/bottom) pane |
| focus | enum | `primary` or `secondary` — which pane has keyboard focus |

**Constraints**: In `none` mode, only `primaryView` is rendered. `secondaryView` defaults to the next view in order when split is first activated.

---

### InputMode

Current mode of the unified input bar.

| Field | Type | Description |
|-------|------|-------------|
| mode | enum | `shell` or `ai` |
| indicator | string | `$` for shell, `✦` for AI |
| placeholder | string | Mode-specific placeholder text |
| history | string[] | Command history (max 1000 entries) |
| historyIndex | integer | Current position in history navigation |

**State transitions**:
- `shell` ↔ `ai` (toggled by Alt+Tab)

---

### AIResponse

Response from a natural language query routed through the daemon.

| Field | Type | Description |
|-------|------|-------------|
| response | string | Markdown-formatted response text |
| routing | enum | `local` or `cloud` — where inference ran |
| latency_ms | integer | Round-trip time in milliseconds |

**Constraints**: Rendered as markdown overlay on content pane. Dismissed by Esc or view switch.

---

### CommandPaletteItem

An entry in the command palette search results.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique item identifier |
| label | string | Display text |
| category | enum | `tool`, `command`, `file` |
| action | function | Callback to execute on selection |
| shortcut | string (optional) | Keyboard shortcut hint |

**Constraints**: Static items (tool switches, sigilctl commands) are always available. Dynamic items (recent files) are populated from daemon queries.

---

### Actuation

A daemon-driven action pushed to the shell via subscription.

| Field | Type | Description |
|-------|------|-------------|
| type | string | Action type: `split-pane`, `close-split`, `keybinding-profile` |
| id | string | Unique action identifier (UUID) |
| description | string | Human-readable description |
| undo_cmd | string | Command to reverse the action |
| reason | string | Why the daemon triggered this action |

**Constraints**: Actuation events are received via the `actuations` push subscription topic. The shell executes them and provides undo capability via the input bar (Ctrl+Z).

## Relationships

```text
AppState
├── activeView: ViewId ──────────── references → View
├── inputMode: InputMode
├── split: SplitState
│   ├── primaryView ─────────────── references → View
│   └── secondaryView ──────────── references → View
├── isPaletteOpen: boolean
├── suggestions: Suggestion[] ──── received from → DaemonSubscription("suggestions")
├── actuations: Actuation[] ────── received from → DaemonSubscription("actuations")
└── daemonStatus: DaemonStatus ── polled from → DaemonClient.status()

View (Terminal) ─── owns → PTY Session (zsh)
View (Editor) ──── owns → PTY Session (nvim)
View (Git) ─────── queries → git2 (Rust backend)
View (Containers) ─ queries → Docker socket (Rust backend)
View (Insights) ── queries → DaemonClient methods
View (Browser) ── owns → navigation history, URL state
```

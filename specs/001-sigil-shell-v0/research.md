# Research: Sigil Shell v0

**Feature**: 001-sigil-shell-v0
**Date**: 2026-03-14

## R1: Existing Shell Scaffold Status

**Decision**: Build on the existing Tauri scaffold in `shell/` — all major components are already implemented.

**Rationale**: The exploration of the codebase reveals that the shell scaffold is substantially complete:
- All 6 views implemented (TerminalView, EditorView, BrowserView, GitView, ContainerView, InsightsView)
- PTY management via portable-pty with spawn/write/resize
- Daemon client with 12+ methods, auto-reconnect, push subscriptions
- AppContext with global state management
- SuggestionBar with queue/rotate/accept/dismiss
- InputBar with shell/AI mode toggle and command history
- ContentPane with keep-alive pattern and split pane support
- CommandPalette with fuzzy search
- LeftRail with daemon status polling
- 800+ lines of CSS with theme variables

**What remains**: Hardening, testing, completing missing daemon socket handlers (Go side), and NixOS packaging for the Tauri app binary.

**Alternatives considered**:
- Rewrite from scratch: Rejected — existing scaffold is architecturally sound and feature-complete
- Switch to Electron: Rejected — violates constitution (minimal surface area) and would 5x memory usage

## R2: Daemon Socket API Completeness

**Decision**: The daemon already implements the core socket server infrastructure with handler registration and subscription fan-out. Several API methods need handlers registered.

**Rationale**: The Go daemon's `internal/socket/server.go` provides:
- Request/response mode with JSON protocol
- Subscribe mode with topic-based push channels
- Handler registration via `Server.Handle(method, fn)`
- Notification fan-out via `Server.Notify(topic, payload)`

Currently registered handlers (from `cmd/sigild/main.go` wiring): status, events, ingest, suggestions, files, commands, patterns, feedback, trigger-summary, undo, view-changed, set-level, ai-query, actions, purge, config, sessions, fleet-preview, fleet-opt-out, fleet-policy.

**What remains**: Verify all 20 handlers are wired, add any missing ones, ensure response payloads match the Tauri client expectations.

**Alternatives considered**: gRPC or HTTP API — rejected, Unix socket with newline-delimited JSON is simpler, lower latency, and already implemented on both sides.

## R3: Tauri 2.x on Wayland/WebKitGTK

**Decision**: Use Tauri 2.x with WebKitGTK for Wayland-native rendering.

**Rationale**: Tauri 2.x has first-class Wayland support via WebKitGTK on Linux. The existing `tauri.conf.json` configures:
- Full-screen, no decorations (matches Hyprland tiling)
- Product name: `sigil-shell`, identifier: `dev.sigil.shell`
- CSP: null (allows inline scripts for theme injection)

WebKitGTK renders natively on Wayland without XWayland, satisfying the constitution's Wayland-only requirement.

**Alternatives considered**:
- Electron: 5x memory, requires XWayland — rejected
- GTK4 native: Would lose the web frontend advantage — rejected
- Qt/QML: Additional dependency, less familiar — rejected

## R4: PTY Management Strategy

**Decision**: Use `portable-pty` crate for cross-platform PTY abstraction with UUID-keyed instance map.

**Rationale**: The existing implementation in `pty.rs` uses:
- `portable-pty` 0.8 for PTY creation and management
- `HashMap<String, PtyInstance>` keyed by UUID v4
- Background reader thread per PTY, emitting Tauri events (`pty-output-{id}`)
- Thread-safe access via `Arc<Mutex<PtyMap>>`

This approach correctly handles:
- Multiple concurrent PTYs (terminal + editor)
- Independent lifecycle per PTY
- Resize propagation
- Keep-alive across view switches (PTY persists, only CSS visibility changes)

**Alternatives considered**:
- Raw `libc::openpty`: Not portable, more error-prone — rejected
- `nix` crate PTY: Lower-level, more boilerplate — rejected

## R5: xterm.js Terminal Emulation

**Decision**: Use xterm.js with FitAddon for terminal rendering in Terminal and Editor views.

**Rationale**: xterm.js is the industry standard for web-based terminal emulation. It supports:
- Full VT100/VT220/xterm escape sequences
- 256-color and truecolor
- Cursor positioning and alternate screen buffer
- FitAddon for automatic resizing to container dimensions
- WebGL renderer for performance (optional, falls back to canvas)

The existing implementation correctly wires xterm.js data events to `pty_write` and listens for `pty-output-{id}` events to write to the terminal.

**Alternatives considered**:
- Custom terminal renderer: Massive effort, no benefit — rejected
- Alacritty/kitty embedding: Not embeddable in WebView — rejected

## R6: NixOS Packaging for Tauri App

**Decision**: Package the Tauri app as a Nix derivation in `flake.nix`, using `buildNpmPackage` for the frontend and `buildRustPackage` for the backend.

**Rationale**: The flake already builds `sigild` from local source. The shell needs similar treatment:
1. Frontend: `buildNpmPackage` with `package-lock.json` for deterministic npm deps
2. Backend: Tauri Rust binary via `crane` or `buildRustPackage` with `Cargo.lock`
3. Combined: wrapper script that launches the Tauri binary with correct environment (WAYLAND_DISPLAY, XDG paths)

The `sigil-shell.nix` module already generates theme CSS — it just needs to also install the shell binary and create a desktop entry.

**Alternatives considered**:
- FHS-compatible binary bundle: Not reproducible, violates constitution — rejected
- Flatpak: Extra runtime layer, harder to integrate with NixOS — rejected

## R7: Hyprland Integration

**Decision**: Use Hyprland IPC via Unix socket for window management operations (pop-out, workspace dispatch).

**Rationale**: The existing `hyprland.rs` communicates with Hyprland via its IPC socket. Hyprland keybindings in `sigil-hyprland.nix` map Super+1 through Super+6 to tool view focus. The shell handles Ctrl+Shift+O pop-out by dispatching `hyprctl` commands.

Key integration points:
- Shell keybindings (Ctrl+N) handled by the Tauri app internally
- Compositor keybindings (Super+N) handled by Hyprland config
- Pop-out creates a floating `kitty` window via `windowrulev2`

**Alternatives considered**: D-Bus for IPC — Hyprland's native socket is simpler and more direct.

## R8: Docker API Integration

**Decision**: Communicate with Docker Engine via HTTP over Unix socket (`/var/run/docker.sock`) using the `reqwest` crate.

**Rationale**: The existing `containers.rs` implementation:
- Uses `reqwest` 0.12 with Unix socket transport
- Maps Docker API responses to `ContainerSummary` structs
- Handles missing Docker gracefully ("Docker unavailable")
- Supports list, start, stop, restart, and log tail operations

This is the standard approach for Docker integration without requiring the Docker CLI as a dependency.

**Alternatives considered**:
- Docker CLI subprocess: Slower, harder to parse output — rejected
- Bollard crate: Full Docker client library, heavier than needed — rejected

## R9: Git Integration

**Decision**: Use `git2` crate (libgit2 bindings) for Git operations.

**Rationale**: The existing `git.rs` uses `git2` 0.20 for:
- Branch name resolution
- Working tree status (modified/staged/untracked/deleted)
- Commit log with sha, message, author, timestamp
- Unified diff generation

This avoids shelling out to `git` CLI and provides structured data directly.

**Alternatives considered**:
- `git` CLI subprocess: Slower, parsing overhead — rejected
- `gitoxide`: Pure Rust but less mature API — rejected

## R10: Theme and Styling Strategy

**Decision**: CSS custom properties injected from NixOS module configuration at Tauri startup.

**Rationale**: The existing approach:
1. `sigil-shell.nix` generates `/etc/sigil-shell/theme.css` with CSS custom properties
2. `main.rs` reads theme CSS and injects via `window.eval()` at startup
3. `global.css` references CSS custom properties (e.g., `var(--bg-primary)`)

This allows theme changes without rebuilding the app — just regenerate the NixOS configuration and restart the shell.

Default theme: dark background (#0a0a0a), light foreground (#e5e5e5), accent indigo (#6366f1), IBM Plex Mono 13px.

**Alternatives considered**:
- Hardcoded theme: Not configurable — rejected
- Runtime theme switching: Over-engineering for single-user system — rejected

# Implementation Plan: Sigil Shell v0

**Branch**: `001-sigil-shell-v0` | **Date**: 2026-03-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-sigil-shell-v0/spec.md`

## Summary

Build the Sigil Shell — a full-screen Tauri 2.x application running on Hyprland/Wayland that unifies six developer tool views (Terminal, Editor, Browser, Git, Containers, Insights) with a daemon socket connection, live suggestion bar, dual-mode input bar (Shell/AI), and 20+ socket API methods. The shell already has a substantial scaffold in `shell/` with Preact+TypeScript frontend and Rust backend — this plan covers completing, hardening, and integrating all components to production readiness.

## Technical Context

**Language/Version**: TypeScript 5.x (frontend, Preact + Vite), Rust 1.75+ (Tauri 2.x backend), Go 1.24 (sigild daemon)
**Primary Dependencies**: Tauri 2.x, Preact, xterm.js, portable-pty, git2, reqwest, tokio, marked (markdown), serde/serde_json
**Storage**: SQLite WAL (daemon-side via modernc.org/sqlite), no shell-local persistence
**Testing**: `cargo test` (Rust backend), `vitest` (frontend unit), `nix flake check` (NixOS integration), `make run-vm` (QEMU runtime)
**Target Platform**: NixOS with Hyprland compositor on Wayland (WebKitGTK), 2017 MacBook Pro (8GB RAM)
**Project Type**: Desktop application (Tauri) + system daemon (Go) + NixOS modules
**Performance Goals**: <200ms view switching, <200MB total memory, <1s suggestion delivery, <5s local AI response
**Constraints**: <200MB memory footprint, single-user system, keyboard-first UX, Wayland-only (no X11)
**Scale/Scope**: Single-user developer workstation, 6 tool views, 20+ socket API methods, 2 push subscription topics

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Nix-First | PASS | Shell packaged via `sigil-shell.nix` module. Theme injected as NixOS option. App built via Nix flake. |
| II. Reproducible Builds | PASS | Tauri app built as `buildGoModule` + `buildNpmPackage` in flake.nix. All inputs pinned via flake.lock. |
| III. Module Boundaries | PASS | `sigil-shell.nix` owns theme config only. `sigild.nix` owns daemon service. No cross-module state leakage. |
| IV. Hardware Abstraction | PASS | Shell has zero hardware-specific code. Runs identically on installed MBP, ISO, and VM configurations. |
| V. Daemon Integration | PASS | Shell defers all intelligence to sigild via Unix socket. No duplicated daemon logic in the OS or shell layer. |
| VI. Security by Default | PASS | Wayland-only compositor. Daemon runs sandboxed systemd service. No X11 attack surface. |
| VII. Minimal Surface Area | PASS | Tauri over Electron (~5x smaller). Only essential packages included. No dev tools in runtime image. |

**GATE RESULT**: All 7 principles pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-sigil-shell-v0/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── socket-api.md    # Daemon socket API contract
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
shell/
├── src/                          # Preact + TypeScript frontend
│   ├── main.tsx                  # Entry point (render to #app)
│   ├── app.tsx                   # Root component, layout orchestration
│   ├── context/
│   │   └── AppContext.tsx        # Global state (activeView, inputMode, split)
│   ├── components/
│   │   ├── LeftRail.tsx          # Icon nav, daemon status indicator
│   │   ├── ContentPane.tsx       # View router, split pane, AI overlay
│   │   ├── SuggestionBar.tsx     # Daemon push suggestions
│   │   ├── InputBar.tsx          # Shell/AI mode toggle, command history
│   │   ├── CommandPalette.tsx    # Ctrl+K fuzzy search
│   │   ├── TerminalView.tsx      # xterm.js + PTY
│   │   ├── EditorView.tsx        # Neovim via PTY
│   │   ├── BrowserView.tsx       # iFrame/WebView browser
│   │   ├── GitView.tsx           # Git status, diff, log
│   │   ├── ContainerView.tsx     # Docker container management
│   │   └── InsightsView.tsx      # Daemon events, patterns, fleet
│   ├── layouts/
│   │   └── index.ts              # SplitState type definitions
│   └── styles/
│       └── global.css            # Master stylesheet (CSS custom properties)
├── src-tauri/
│   ├── src/
│   │   ├── main.rs               # Tauri setup, theme injection, subscriptions
│   │   ├── daemon_client.rs      # Unix socket IPC client (690+ lines)
│   │   ├── pty.rs                # PTY management via portable-pty
│   │   ├── editor.rs             # Neovim spawning
│   │   ├── git.rs                # Git operations via git2
│   │   ├── containers.rs         # Docker API over Unix socket
│   │   └── hyprland.rs           # Hyprland IPC dispatching
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── tsconfig.json
└── vite.config.ts

modules/                          # NixOS modules
├── sigil-shell.nix               # Shell theme config + package
├── sigild.nix                    # Daemon systemd service
├── sigil-hyprland.nix            # Compositor config + keybindings
├── sigil-base.nix                # Base system packages
└── sigil-inference.nix           # llama.cpp + model management
```

**Structure Decision**: Hybrid desktop app — Tauri (Rust backend + Preact frontend) in `shell/`, NixOS integration in `modules/`, daemon in separate `sigil/` repository. This structure already exists and is the correct architecture for a Wayland-native developer shell.

## Complexity Tracking

No constitution violations — this table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                   |

# Implementation Plan: Native Browser Webview

**Branch**: `002-native-browser-webview` | **Date**: 2026-03-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-native-browser-webview/spec.md`

## Summary

Replace the iframe-based browser view in Sigil Shell with a native WebKitGTK webview using Tauri 2.x's multi-webview API (`Window::add_child`). The current iframe cannot load most websites due to X-Frame-Options restrictions. The native webview renders through the OS browser engine, bypassing all embedding restrictions while providing full JavaScript support, cookie persistence, and standard browser capabilities.

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend, Preact + Vite), Rust 2021 edition (Tauri 2.x backend)
**Primary Dependencies**: Tauri 2.x (with `unstable` + `custom-protocol` features), Preact 10.x, WebKitGTK 4.1 (system)
**Storage**: N/A (webview manages its own cookie/session storage)
**Testing**: `nix flake check` (Nix validation), `cargo clippy` (Rust lint), `make run-vm` (QEMU runtime testing)
**Target Platform**: Linux (NixOS) with Hyprland compositor, WebKitGTK 4.1
**Project Type**: Desktop application (Tauri shell)
**Performance Goals**: Page load within 10% of standalone browser (SC-002)
**Constraints**: Single fullscreen window on Hyprland, must coexist with shell UI webview
**Scale/Scope**: Single webview, no tabs, basic navigation controls

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Nix-First | PASS | No Nix module changes needed — WebKitGTK 4.1 already in `flake.nix` buildInputs |
| II. Reproducible Builds | PASS | Only changes to Cargo.toml (feature flag) and source code. All deps pinned via Cargo.lock |
| III. Module Boundaries | PASS | New `browser.rs` module with single responsibility (webview management). Communicates via Tauri command/event interface |
| IV. Hardware Abstraction | PASS | No hardware-specific code. WebKitGTK is abstracted by Tauri/wry |
| V. Daemon Integration | PASS | No daemon changes. Browser is a shell-only feature |
| VI. Security by Default | PASS | Native webview inherits WebKitGTK security model (TLS, CSP enforcement, sandboxing). CSP null in Tauri config is for the shell UI, not the browser webview |
| VII. Minimal Surface Area | PASS | No new system packages. Only adds `unstable` feature flag to existing Tauri dependency |

**Post-Phase 1 re-check**: All gates still PASS. The design adds one new Rust module (`browser.rs`) and modifies one existing frontend component (`BrowserView.tsx`). No new Nix packages, no new npm dependencies.

## Project Structure

### Documentation (this feature)

```text
specs/002-native-browser-webview/
├── plan.md              # This file
├── research.md          # Phase 0 output — 8 research decisions
├── data-model.md        # Phase 1 output — entity definitions
├── quickstart.md        # Phase 1 output — architecture overview and build guide
├── contracts/
│   └── tauri-commands.md # Phase 1 output — IPC command/event contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
shell/
├── src-tauri/
│   ├── Cargo.toml           # Modified: add "unstable" feature to tauri
│   └── src/
│       ├── main.rs          # Modified: register browser commands, add BrowserState
│       └── browser.rs       # New: webview lifecycle management (create, navigate, show/hide)
└── src/
    └── components/
        └── BrowserView.tsx  # Modified: replace iframe with invoke-based native webview control
```

**Structure Decision**: This feature modifies the existing Tauri desktop app structure. No new directories or projects are needed. One new Rust module (`browser.rs`) follows the established pattern of feature modules (`pty.rs`, `git.rs`, `containers.rs`, `hyprland.rs`).

## Complexity Tracking

No constitution violations. No complexity justifications needed.

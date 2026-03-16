# Implementation Plan: Shell Views Implementation

**Branch**: `004-shell-views-impl` | **Date**: 2026-03-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-shell-views-impl/spec.md`

## Summary

Three views in Sigil Shell — Editor (Ctrl+2), Git (Ctrl+4), and Containers (Ctrl+5) — exist as stubs but fail at runtime due to three distinct root causes: (1) `neovim` is absent from the NixOS package set so `spawn_editor` finds no binary; (2) `GitView.tsx` reads `window.__TAURI_INTERNALS__?.metadata?.currentDir` which is undefined in Tauri 2.x, falling back to `/home` where there is no repo; (3) `reqwest` is built without the `unix-socket` feature, so all Docker API calls over `/var/run/docker.sock` fail before reaching the daemon.

Each fix is isolated, testable independently, and requires no new dependencies beyond enabling what is already stubbed in the code.

## Technical Context

**Language/Version**: TypeScript 5.7 (Preact + Vite frontend), Rust 2021 edition (Tauri 2.x backend)
**Primary Dependencies**: Tauri 2.x, xterm.js + FitAddon, portable-pty, git2 0.20, reqwest 0.12, Preact 10.x
**Storage**: N/A
**Testing**: `nix flake check` (fast validation), `make run-vm` (runtime), manual view interaction
**Target Platform**: NixOS (Sigil OS), Wayland/Hyprland compositor, Linux x86_64
**Project Type**: Desktop application (Tauri)
**Performance Goals**: Editor launches within 2s, git view loads within 1s, containers list within 3s
**Constraints**: All views must degrade gracefully when dependency is absent; no blank/frozen screens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Nix-First | PASS | `neovim` added via NixOS package declaration in `modules/sigil-shell.nix` |
| II. Reproducible Builds | PASS | `nix flake check` required to pass; no imperative installs |
| III. Module Boundaries | PASS | Changes stay within `sigil-shell.nix` and `shell/` (Tauri code) |
| IV. Hardware Abstraction | PASS | No hardware-specific paths; neovim is a user-space package |
| V. Daemon Integration | PASS | No sigild changes needed |
| VI. Security by Default | PASS | Docker socket access requires user in `docker` group; no elevated privileges added |
| VII. Minimal Surface Area | PASS | `neovim` is a single justified addition |

**Verdict**: All gates pass. Proceed.

## Project Structure

### Documentation (this feature)

```text
specs/004-shell-views-impl/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (changed files)

```text
modules/
└── sigil-shell.nix              # Add neovim to environment.systemPackages

shell/
├── src-tauri/
│   ├── Cargo.toml               # Add unix-socket feature to reqwest
│   ├── Cargo.lock               # Updated by cargo
│   └── src/
│       ├── main.rs              # Register get_cwd command
│       └── cwd.rs               # New: get_cwd Tauri command
└── src/
    └── components/
        └── GitView.tsx          # Fix cwd detection: invoke('get_cwd') instead of __TAURI_INTERNALS__
```

**Structure Decision**: Targeted fixes across three layers — Nix module (package), Rust backend (feature flag + command), TypeScript frontend (API call). No new architectural layers introduced.

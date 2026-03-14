# Quickstart: Sigil Shell v0

**Feature**: 001-sigil-shell-v0
**Date**: 2026-03-14

## Prerequisites

- NixOS with flakes enabled
- Hyprland compositor running
- `sigild` daemon built and running (`make run` in `~/workspace/sigil/`)
- Node.js 20+ and npm (for frontend development)
- Rust toolchain with `cargo` (for Tauri backend)

## Development Setup

### 1. Start the daemon

```bash
cd ~/workspace/sigil
make run  # builds and runs sigild with dev.toml
```

Verify the socket exists:
```bash
ls /run/user/$(id -u)/sigild.sock
```

### 2. Install frontend dependencies

```bash
cd ~/workspace/sigil-os/shell
npm install
```

### 3. Run the shell in dev mode

```bash
cd ~/workspace/sigil-os/shell
cargo tauri dev
```

This launches the Tauri app with hot-reload for the Preact frontend. The Rust backend recompiles on changes.

### 4. Build for production

```bash
cd ~/workspace/sigil-os/shell
cargo tauri build
```

### 5. Build the full NixOS system

```bash
cd ~/workspace/sigil-os
nix build .#nixosConfigurations.sigil.config.system.build.toplevel
```

### 6. Test in QEMU VM

```bash
cd ~/workspace/sigil-os
make run-vm
```

## Validating the NixOS config

```bash
cd ~/workspace/sigil-os
nix flake check  # ~5 seconds, validates all configs
```

## Testing the daemon socket API

```bash
# Test status method
echo '{"method":"status","payload":null}' | socat - UNIX-CONNECT:/run/user/$(id -u)/sigild.sock

# Test ingest method
echo '{"method":"ingest","payload":{"cmd":"echo hello","exit_code":0,"cwd":"/tmp"}}' | socat - UNIX-CONNECT:/run/user/$(id -u)/sigild.sock

# Subscribe to suggestions (long-lived)
echo '{"method":"subscribe","payload":{"topic":"suggestions"}}' | socat - UNIX-CONNECT:/run/user/$(id -u)/sigild.sock
```

## Key file locations

| What | Path |
|------|------|
| Frontend source | `shell/src/` |
| Rust backend | `shell/src-tauri/src/` |
| Tauri config | `shell/src-tauri/tauri.conf.json` |
| NixOS shell module | `modules/sigil-shell.nix` |
| NixOS daemon module | `modules/sigild.nix` |
| Hyprland config | `modules/sigil-hyprland.nix` |
| Daemon socket API | `~/workspace/sigil/internal/socket/server.go` |
| Spec | `specs/001-sigil-shell-v0/spec.md` |
| API contract | `specs/001-sigil-shell-v0/contracts/socket-api.md` |

## Keyboard shortcuts (development)

| Shortcut | Action |
|----------|--------|
| Ctrl+1–6 | Switch tool views |
| Alt+Tab | Toggle Shell/AI mode |
| Ctrl+K | Command palette |
| Ctrl+\ | Horizontal split |
| Ctrl+Shift+\ | Vertical split |
| Ctrl+[ / ] | Switch split focus |
| Ctrl+Shift+O | Pop out to floating window |
| Tab | Accept suggestion |
| Esc | Dismiss suggestion / close overlay |
| Ctrl+Z (empty input) | Undo last daemon action |

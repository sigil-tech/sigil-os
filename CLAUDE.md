# sigil-os Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-14

## Active Technologies
- TypeScript 5.7 (frontend, Preact + Vite), Rust 2021 edition (Tauri 2.x backend) + Tauri 2.x (with `unstable` + `custom-protocol` features), Preact 10.x, WebKitGTK 4.1 (system) (002-native-browser-webview)
- N/A (webview manages its own cookie/session storage) (002-native-browser-webview)
- TypeScript 5.7 (frontend, Preact + Vite), Rust 2021 edition (Tauri 2.x backend), Nix (NixOS modules) + Preact, xterm.js, Tauri 2.x, fontconfig, foot terminal, Waybar (003-shell-font-update)
- TypeScript 5.7 (Preact + Vite frontend), Rust 2021 edition (Tauri 2.x backend) + Tauri 2.x, xterm.js + FitAddon, portable-pty, git2 0.20, reqwest 0.12, Preact 10.x (004-shell-views-impl)
- Go 1.24 (daemon), Rust 2021 / Tauri 2.x (sigil-shell) (005-daemon-network-transport)
- Credential store — JSON file at `$XDG_DATA_HOME/sigil/credentials.json`; TLS cert/key at `$XDG_DATA_HOME/sigil/server-{cert,key}.pem` (005-daemon-network-transport)

- TypeScript 5.x (frontend, Preact + Vite), Rust 1.75+ (Tauri 2.x backend), Go 1.24 (sigild daemon) + Tauri 2.x, Preact, xterm.js, portable-pty, git2, reqwest, tokio, marked (markdown), serde/serde_json (001-sigil-shell-v0)

## Project Structure

```text
src/
tests/
```

## Commands

cargo test [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] cargo clippy

## Code Style

TypeScript 5.x (frontend, Preact + Vite), Rust 1.75+ (Tauri 2.x backend), Go 1.24 (sigild daemon): Follow standard conventions

## Recent Changes
- 005-daemon-network-transport: Added Go 1.24 (daemon), Rust 2021 / Tauri 2.x (sigil-shell)
- 004-shell-views-impl: Added TypeScript 5.7 (Preact + Vite frontend), Rust 2021 edition (Tauri 2.x backend) + Tauri 2.x, xterm.js + FitAddon, portable-pty, git2 0.20, reqwest 0.12, Preact 10.x
- 003-shell-font-update: Added TypeScript 5.7 (frontend, Preact + Vite), Rust 2021 edition (Tauri 2.x backend), Nix (NixOS modules) + Preact, xterm.js, Tauri 2.x, fontconfig, foot terminal, Waybar


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

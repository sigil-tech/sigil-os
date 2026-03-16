# sigil-os Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-14

## Active Technologies
- TypeScript 5.7 (frontend, Preact + Vite), Rust 2021 edition (Tauri 2.x backend) + Tauri 2.x (with `unstable` + `custom-protocol` features), Preact 10.x, WebKitGTK 4.1 (system) (002-native-browser-webview)
- N/A (webview manages its own cookie/session storage) (002-native-browser-webview)

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
- 002-native-browser-webview: Added TypeScript 5.7 (frontend, Preact + Vite), Rust 2021 edition (Tauri 2.x backend) + Tauri 2.x (with `unstable` + `custom-protocol` features), Preact 10.x, WebKitGTK 4.1 (system)

- 001-sigil-shell-v0: Added TypeScript 5.x (frontend, Preact + Vite), Rust 1.75+ (Tauri 2.x backend), Go 1.24 (sigild daemon) + Tauri 2.x, Preact, xterm.js, portable-pty, git2, reqwest, tokio, marked (markdown), serde/serde_json

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

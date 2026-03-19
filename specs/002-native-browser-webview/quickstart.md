# Quickstart: Native Browser Webview

**Feature**: 002-native-browser-webview
**Date**: 2026-03-15

## What This Feature Does

Replaces the broken iframe-based browser in Sigil Shell with a native WebKitGTK webview using Tauri 2.x's multi-webview API. This allows loading any website (including those with X-Frame-Options restrictions) directly inside Sigil Shell.

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Tauri Window (fullscreen, Hyprland)            │
│ ┌─────┬──────────────────────────────────────┐  │
│ │     │  Shell UI Webview (Preact app)       │  │
│ │  L  │  ┌──────────────────────────────┐    │  │
│ │  e  │  │ [←] [→] [↻] [ URL bar      ]│    │  │
│ │  f  │  ├──────────────────────────────┤    │  │
│ │  t  │  │                              │    │  │
│ │     │  │  Browser Child Webview       │    │  │
│ │  R  │  │  (native WebKitGTK)          │    │  │
│ │  a  │  │                              │    │  │
│ │  i  │  │  Renders on top of shell     │    │  │
│ │  l  │  │  webview in this region      │    │  │
│ │     │  │                              │    │  │
│ │     │  └──────────────────────────────┘    │  │
│ │     │  ┌──────────────────────────────┐    │  │
│ │     │  │ InputBar / SuggestionBar     │    │  │
│ └─────┴──┴──────────────────────────────┘    │  │
└─────────────────────────────────────────────────┘
```

The shell UI webview (existing) renders the Preact app with navigation controls. A second native child webview (new) renders the actual web content, positioned over the content area of the shell.

## Key Files to Modify

| File | Change |
|------|--------|
| `shell/src-tauri/Cargo.toml` | Add `unstable` feature to tauri dependency |
| `shell/src-tauri/src/main.rs` | Register browser commands, add BrowserState to managed state |
| `shell/src-tauri/src/browser.rs` | **New** — Browser webview management (create, navigate, show/hide) |
| `shell/src/components/BrowserView.tsx` | Replace iframe with invoke-based native webview control |
| `shell/src-tauri/tauri.conf.json` | No changes expected (CSP already null) |

## Data Flow

```
User types URL in address bar (Preact)
  → invoke('browser_create', { url, bounds })
  → Rust creates child webview via window.add_child()
  → WebKitGTK loads page natively
  → on_navigation callback fires
  → app.emit('browser-url-changed', { url })
  → BrowserView.tsx updates address bar display

User clicks Back button (Preact)
  → invoke('browser_back')
  → Rust calls webview.eval("history.back()")
  → WebKitGTK navigates back
  → on_navigation callback → emit browser-url-changed

User switches to Terminal view (Preact)
  → invoke('browser_hide')
  → Rust calls webview.hide()
  → Webview preserved in memory (page, cookies, scroll, history)

User switches back to Browser view (Preact)
  → invoke('browser_show', { bounds })
  → Rust calls webview.set_bounds() + webview.show()
  → Page appears exactly as left
```

## Build & Test

```bash
cd ~/workspace/sigil-os

# Validate Nix config (no changes needed to Nix modules)
nix flake check

# Build the shell
cd shell && npm run tauri build

# Test in QEMU VM
cd ~/workspace/sigil-os && make run-vm
```

## Dependencies

- **Tauri 2.x `unstable` feature**: Required for `Window::add_child()` multi-webview API
- **WebKitGTK 4.1**: Already in Nix buildInputs (`webkitgtk_4_1`), no changes needed
- No new npm dependencies required
- No new system packages required

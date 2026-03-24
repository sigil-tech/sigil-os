# Changelog

## [0.1.0-beta] - 2026-03-22

### Added
- NixOS-based AI-native operating system for software engineers
- Sigil Shell (Tauri 2.x + Preact): 7-view unified workspace
  - Terminal (xterm.js + portable-pty)
  - Editor (CodeMirror 6 with file tree, tabs, VS Code/Neovim preference)
  - Browser (WebKitGTK native webview)
  - Git (git2 integration with auto-refresh)
  - Containers (Docker API with live status)
  - Insights (daemon health dashboard with 6 metrics)
  - Extensions (editor detection, plugin management)
- AI mode with rich context, progressive reveal, route badges
- Command palette with 10+ daemon actions
- Toast notification system
- Settings panel (Ctrl+,)
- Suggestion bar wired to daemon push subscription
- Hand-written markdown renderer (no external dependency)
- Storybook 8 component library
- 36 vitest frontend tests
- 5 NixOS configurations: installed, ISO, VM, macOS launcher, Windows launcher
- Modular tool selection via sigil-tools.nix (editor, container engine, shell)
- Automated disk image generation (raw for Apple VF, GPT+EFI for Hyper-V)
- Plymouth boot splash with pulsing logo animation
- Hyprland Wayland compositor with waybar
- Docker support with rootless access
- llama.cpp inference with runtime model management
- lib.mkLauncherVM for launcher-driven custom VM builds

### Security
- All data stays on the user's machine
- Tauri ACL capabilities for event listen/emit
- No external UI library dependencies (constitution compliance)

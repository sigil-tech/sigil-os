# Sigil OS

A purpose-built, AI-native Linux operating system designed exclusively for professional software engineers. Built on NixOS with a custom Tauri shell, integrated intelligence daemon, and on-device inference.

## Architecture

```
Sigil OS (NixOS 25.05)
├── sigild            Go daemon — workflow observation, pattern detection, suggestions
├── Sigil Shell       Tauri 2.x + Preact — unified developer workspace
│   ├── Terminal      xterm.js + portable-pty
│   ├── Editor        CodeMirror 6 with file tree and tabs
│   ├── Browser       WebKitGTK native webview
│   ├── Git           git2 integration (status, log, diff)
│   ├── Containers    Docker API (list, start/stop, logs)
│   └── Insights      Daemon telemetry dashboard
├── Hyprland          Wayland compositor (GPU, multi-monitor, tiling)
├── llama.cpp         On-device LLM inference (managed llama-server)
└── Plymouth          Animated boot splash
```

## Quick Start

### Prerequisites

- [Nix](https://nixos.org/download/) with flakes enabled
- For deployment: SSH access to target machine running NixOS

### Build & Test

```bash
# Validate configuration (~5s)
make check

# Evaluate all configs without building (~3s)
make eval

# Build system closure
make build-system

# Build bootable ISO
make build-iso

# Boot a QEMU VM for local testing
make run-vm
```

### Deploy to Hardware

```bash
# Deploy to installed machine over SSH
make deploy MBP_HOST=user@sigil.local

# Test deploy (reverts on reboot)
make deploy-test MBP_HOST=user@sigil.local

# Sync source + rebuild on remote (edit locally, deploy remotely)
make push MBP_HOST=user@sigil.local
```

## NixOS Configurations

| Configuration | Target | Description |
|---------------|--------|-------------|
| `sigil` | Installed system | Full desktop with Hyprland, sigild, Sigil Shell |
| `sigil-iso` | Live USB | Bootable installer ISO |
| `sigil-vm` | QEMU/KVM | Local testing VM (4GB RAM, 2 cores) |
| `sigil-launcher` | macOS VM | Headless aarch64 guest for Apple Virtualization |
| `sigil-launcher-windows` | Windows VM | Headless x86_64 guest for Hyper-V |

## NixOS Modules

| Module | Purpose |
|--------|---------|
| `sigil-base.nix` | System packages, users, SSH, Docker, Zsh |
| `sigil-hyprland.nix` | Wayland compositor, foot terminal, waybar, mako |
| `sigild.nix` | Daemon systemd service, socket, inference config |
| `sigil-shell.nix` | Tauri app packaging, desktop entry, theme injection |
| `sigil-inference.nix` | llama.cpp server, model management |
| `sigil-plymouth.nix` | Boot splash theme with pulsing logo animation |
| `sigil-keybindings.nix` | Keybinding profile system |

## Shell Development

The Sigil Shell is a Tauri 2.x desktop app with a Preact frontend and Rust backend.

```bash
cd shell

# Install dependencies
npm install

# Development (requires Tauri CLI)
npm run tauri dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Launch Storybook (component library)
npm run storybook

# Type check
npx tsc --noEmit

# Production build
npm run build
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Preact 10.x, TypeScript 5.7, Vite 6 |
| Editor | CodeMirror 6 (JS/TS/Rust/Python/JSON/CSS/HTML/Markdown) |
| Terminal | xterm.js + portable-pty |
| Backend | Rust (Tauri 2.x), git2, WebKitGTK, Docker API |
| Testing | Vitest, Testing Library, Storybook 8 |
| Styling | CSS variables, dark theme, Fira Code 16px |

### Project Structure

```
shell/
├── src/
│   ├── components/       # Preact components (15 components)
│   ├── context/           # AppContext, ToastContext
│   ├── lib/               # Utilities (markdown, context, platform)
│   ├── styles/            # Global CSS
│   └── test/              # Test setup and mocks
├── src-tauri/
│   └── src/               # Rust backend (PTY, git, files, daemon client)
├── .storybook/            # Storybook configuration
├── vitest.config.ts       # Test configuration
└── package.json
```

## Hardware Support

Primary target: 2017 MacBook Pro (Intel, i915 GPU, Broadcom WiFi). Hardware configs in `hardware/`:

- `mbp-2017.nix` — Broadcom WiFi (brcmfmac), i915, EFI/systemd-boot
- `apple-vf.nix` — Apple Virtualization Framework (virtio-fs)
- `hyper-v.nix` — Hyper-V Gen2 (CIFS shares)
- `vm.nix` — QEMU/KVM local testing

## Related Repositories

| Repository | Description |
|------------|-------------|
| [sigil](https://github.com/sigil-tech/sigil) | Go daemon (sigild) and CLI (sigilctl) |
| [sigil-launcher-macos](https://github.com/sigil-tech/sigil-launcher-macos) | Native Swift launcher for macOS |
| [sigil-launcher-windows](https://github.com/sigil-tech/sigil-launcher-windows) | Native C# launcher for Windows |

## License

Apache 2.0

# Quickstart: Shell Font Update

**Feature**: 003-shell-font-update
**Date**: 2026-03-15

## What This Feature Does

Replaces the system-wide font (IBM Plex Mono 13px) with Fira Code 14px across all text surfaces in Sigil OS — the Sigil Shell, the standalone terminal, and the status bar.

## How to Verify

### 1. Validate Nix configuration

```bash
cd ~/workspace/sigil-os
nix flake check
```

### 2. Test in VM

```bash
make run-vm
# Once booted, check:
# - Open Sigil Shell: all text should be Fira Code 14pt
# - Open foot terminal (Super+Return): text should be Fira Code 14pt
# - Waybar at top: text should be Fira Code 14pt
# - Run: fc-match monospace  → should output "FiraCode-Regular.ttf"
```

### 3. Verify font availability

Inside the VM or deployed system:

```bash
fc-list | grep -i fira     # Fira Code should be listed
fc-match monospace          # Should resolve to Fira Code
```

### 4. Verify shell frontend

Open Sigil Shell and inspect each view:
- Terminal view: monospace text at readable size
- Editor view: same font/size
- Browser URL bar: same font/size
- Command palette (Ctrl+K): same font/size
- Input bar at bottom: same font/size

## Files Changed

| File | Change |
|------|--------|
| `modules/sigil-hyprland.nix` | Font package, fontconfig default, foot config, waybar CSS |
| `modules/sigil-shell.nix` | Theme option defaults |
| `shell/package.json` | npm font dependency |
| `shell/package-lock.json` | Lockfile update |
| `shell/src/styles/global.css` | CSS imports, custom properties, all font-family declarations |
| `shell/src/components/TerminalView.tsx` | xterm.js fontFamily |
| `shell/src/components/EditorView.tsx` | xterm.js fontFamily |
| `flake.nix` | npmDepsHash update |

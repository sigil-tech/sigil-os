# Implementation Plan: Shell Font Update

**Branch**: `003-shell-font-update` | **Date**: 2026-03-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-shell-font-update/spec.md`

## Summary

Replace IBM Plex Mono 13px/13pt with Fira Code 14px/14pt across all text-rendering surfaces in Sigil OS: the Sigil Shell frontend (CSS, xterm.js configs), the NixOS Hyprland module (foot terminal, Waybar), the sigil-shell NixOS module (theme defaults), and the system font configuration (fontconfig). The font fallback stack is Fira Code, Consolas, Courier New, monospace.

## Technical Context

**Language/Version**: TypeScript 5.7 (frontend, Preact + Vite), Rust 2021 edition (Tauri 2.x backend), Nix (NixOS modules)
**Primary Dependencies**: Preact, xterm.js, Tauri 2.x, fontconfig, foot terminal, Waybar
**Storage**: N/A
**Testing**: Visual verification on QEMU VM, `nix flake check` for config validity
**Target Platform**: NixOS (Hyprland/Wayland), 2017 MacBook Pro Retina
**Project Type**: Desktop OS / shell application
**Performance Goals**: N/A (cosmetic change)
**Constraints**: Font must be available in nixpkgs. Font stack must degrade gracefully.
**Scale/Scope**: ~10 files across 3 layers (Nix modules, shell frontend CSS, shell frontend TypeScript)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Nix-First | PASS | Font package and fontconfig defaults set via Nix modules |
| II. Reproducible Builds | PASS | Font pinned via nixpkgs flake input, npm dep pinned via lockfile |
| III. Module Boundaries | PASS | Font config in sigil-hyprland.nix (compositor layer), theme defaults in sigil-shell.nix (shell layer) — each module owns its own font config |
| IV. Hardware Abstraction | PASS | No hardware-specific font config; works across all three NixOS configurations |
| V. Daemon Integration | N/A | No daemon changes |
| VI. Security by Default | N/A | No security implications |
| VII. Minimal Surface Area | PASS | Replacing one font package with another, not adding net-new packages |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/003-shell-font-update/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — no data entities)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# NixOS modules (font packages, fontconfig, foot, waybar)
modules/
├── sigil-hyprland.nix   # Font package, fontconfig defaults, foot config, waybar CSS
└── sigil-shell.nix      # Theme option defaults (fontFamily, fontSize)

# Sigil Shell frontend (CSS, xterm.js font configs)
shell/
├── package.json                          # npm font dependency
├── src/
│   ├── styles/global.css                 # CSS custom properties, all font-family declarations
│   └── components/
│       ├── TerminalView.tsx              # xterm.js fontFamily/fontSize
│       └── EditorView.tsx                # xterm.js fontFamily/fontSize
└── src-tauri/
    # No Rust changes needed for font

# Nix flake (npm hash update)
flake.nix                                 # npmDepsHash for shell frontend build
```

**Structure Decision**: Changes span three existing layers — no new files or directories needed. All modifications are in-place edits to existing config surfaces.

## Complexity Tracking

No constitution violations. Table omitted.

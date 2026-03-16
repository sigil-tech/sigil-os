# Research: Shell Font Update

**Feature**: 003-shell-font-update
**Date**: 2026-03-15

## No NEEDS CLARIFICATION Items

The feature spec had no unresolved clarifications. All technology choices and configuration surfaces are well-understood from the existing codebase.

## Research Tasks

### 1. Fira Code availability in nixpkgs

**Decision**: Use `pkgs.fira-code` from nixpkgs.
**Rationale**: Fira Code is available in nixpkgs as `fira-code`. It includes regular and bold weights (400, 700) which cover the needs of both the shell CSS and foot terminal config.
**Alternatives considered**: JetBrains Mono (already included as a Nerd Font variant for icons, but user specifically requested Fira Code), Source Code Pro (good but not requested).

### 2. npm font package for Sigil Shell frontend

**Decision**: Use `@fontsource/fira-code` npm package, replacing `@fontsource/ibm-plex-mono`.
**Rationale**: The @fontsource packages provide self-hosted web fonts that work with Vite bundling. The fira-code package includes 400 and 700 weights needed for the CSS imports.
**Alternatives considered**: Loading from system fonts via CSS `local()` — rejected because the Tauri webview may not reliably pick up system fonts, and the current architecture uses bundled @fontsource packages.

### 3. Font stack fallback order

**Decision**: `'Fira Code', Consolas, 'Courier New', monospace`
**Rationale**: User-specified order. Fira Code is the primary. Consolas provides a quality fallback on systems where it's available (unlikely on NixOS but relevant if theme CSS is ever shared). Courier New is universally available. Generic `monospace` is the final safety net.
**Alternatives considered**: None — user specified the exact stack.

### 4. Font size: 14px vs 14pt

**Decision**: Use 14px in CSS contexts, 14 (point size) in foot/waybar configs.
**Rationale**: Web CSS `font-size: 14px` and foot's `font=Fira Code:size=14` produce comparable visual results on the target display. The xterm.js `fontSize` option also uses pixels. This matches the user's intent of "14pt" in practical terms.
**Alternatives considered**: True 14pt (18.67px) — rejected as too large for a code-focused UI; the user's intent is clearly "14px" based on the readability complaint about the current 13px.

### 5. Fontconfig default monospace configuration

**Decision**: Set `fonts.fontconfig.defaultFonts.monospace = [ "Fira Code" "DejaVu Sans Mono" ]` in sigil-hyprland.nix.
**Rationale**: This ensures any application that requests the generic "monospace" font family gets Fira Code first, with DejaVu Sans Mono as a reliable fallback (already included in the system).
**Alternatives considered**: Setting it in sigil-base.nix — rejected because font/compositor config is the responsibility of sigil-hyprland.nix per module boundaries.

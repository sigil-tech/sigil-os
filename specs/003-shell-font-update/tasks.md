# Tasks: Shell Font Update

**Feature**: 003-shell-font-update
**Date**: 2026-03-15
**Plan**: [plan.md](plan.md)

## Phase 1: Setup — NPM Font Dependency

- [x] **T-001**: Replace `@fontsource/ibm-plex-mono` with `@fontsource/fira-code` in `shell/package.json`
- [x] **T-002**: Update `shell/package-lock.json` via `npm install` in the shell directory
- [x] **T-003**: Update `npmDepsHash` in `flake.nix` to match the new lockfile

## Phase 2: Shell Frontend CSS

- [x] **T-004**: Update CSS imports in `shell/src/styles/global.css` from `@fontsource/ibm-plex-mono` to `@fontsource/fira-code` (400 and 700 weights)
- [x] **T-005**: Update CSS custom properties in `shell/src/styles/global.css`: `--font-family` to `'Fira Code', Consolas, 'Courier New', monospace` and `--font-size` to `14px`
- [x] **T-006**: Replace all `IBM Plex Mono` references in `shell/src/styles/global.css` with `Fira Code` font stack [P]

## Phase 3: Shell Frontend TypeScript

- [x] **T-007**: Update `fontFamily` in `shell/src/components/TerminalView.tsx` xterm.js config [P]
- [x] **T-008**: Update `fontFamily` in `shell/src/components/EditorView.tsx` xterm.js config [P]

## Phase 4: NixOS Modules

- [x] **T-009**: Update `modules/sigil-hyprland.nix`: replace `ibm-plex` with `fira-code` in `fonts.packages`, update `fontconfig.defaultFonts.monospace`, update foot config, update waybar CSS
- [x] **T-010**: Update `modules/sigil-shell.nix`: change `fontFamily` and `fontSize` option defaults

## Phase 5: Validation

- [x] **T-011**: Run `nix flake check` to validate NixOS configuration
- [x] **T-012**: Verify no remaining references to `ibm-plex-mono` or `IBM Plex Mono` in the codebase

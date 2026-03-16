# Data Model: Shell Font Update

**Feature**: 003-shell-font-update
**Date**: 2026-03-15

## Entities

This feature involves no persistent data entities. All changes are to configuration values (font family, font size) across static config surfaces.

## Configuration Surfaces

The following are the configuration "entities" — the places where font settings live:

| Surface | Format | Font Family Setting | Font Size Setting |
|---------|--------|--------------------|--------------------|
| Shell CSS custom properties | CSS `:root` vars | `--font-family` | `--font-size` |
| Shell CSS declarations | CSS `font-family` property | ~10 declarations in `global.css` | Inline `font-size` values |
| Terminal xterm.js | TypeScript config object | `fontFamily` option | `fontSize` option |
| Editor xterm.js | TypeScript config object | `fontFamily` option | `fontSize` option |
| Shell npm dependency | `package.json` | `@fontsource/fira-code` | N/A |
| Shell CSS imports | `@import` statements | `@fontsource/fira-code/*.css` | N/A |
| NixOS shell module | Nix option defaults | `fontFamily` option | `fontSize` option |
| NixOS fontconfig | Nix module option | `defaultFonts.monospace` | N/A |
| NixOS font packages | Nix list | `fonts.packages` | N/A |
| Foot terminal config | INI file (`foot.ini`) | `font=` directive | Part of `font=` directive (`:size=`) |
| Waybar CSS | CSS `font-family` property | `font-family` in `*` selector | `font-size` in `*` selector |
| Nix flake | Nix expression | N/A | N/A (but `npmDepsHash` changes) |

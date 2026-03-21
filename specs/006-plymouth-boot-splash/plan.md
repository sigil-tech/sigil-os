# Implementation Plan: Sigil Boot Splash Screen

**Branch**: `006-plymouth-boot-splash` | **Date**: 2026-03-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-plymouth-boot-splash/spec.md`

## Summary

Replace the default NixOS boot screen with a branded Sigil logo splash using Plymouth. The logo pulses with a sine-wave opacity animation from kernel start through to Hyprland. Packaged as a self-contained NixOS module toggled by a single boolean option. Hardware-specific KMS config lands in `hardware/mbp-2017.nix`; splash logic in `modules/sigil-plymouth.nix`; the theme derivation in `pkgs/sigil-plymouth/`.

## Technical Context

**Language/Version**: Nix (module + derivation), Plymouth script language (theme animation)
**Primary Dependencies**: Plymouth (NixOS `boot.plymouth` module), `stdenvNoCC` (Nix packaging), `boot.initrd.systemd` (systemd initrd)
**Storage**: N/A — theme files in Nix store, no runtime persistence
**Testing**: `nix flake check` (eval), `make run-vm` (runtime), `make build-iso` (integration)
**Target Platform**: NixOS on MBP 2017 (Intel Kaby Lake GT2, i915); VM config excluded
**Performance Goals**: Splash visible within 1s of display activation; zero boot regression (SC-005: ≤2s additional time-to-desktop)
**Constraints**: Must not block boot on splash failure; module default is `false` (opt-in); no design work — existing `sigil_logo.png` only
**Scale/Scope**: Single hardware target; three NixOS configs (installed, ISO, VM); VM stays off

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Nix-First | ✓ PASS | Fully declarative — new NixOS module + Nix derivation |
| II. Reproducible Builds | ✓ PASS | Theme packaged as derivation with fixed `src`; assets from nix store; `nix flake check` gates merge |
| III. Module Boundaries | ✓ PASS | New `modules/sigil-plymouth.nix` with single responsibility; `services.sigil-plymouth.enable` option declared with type + description |
| IV. Hardware Abstraction | ✓ PASS | `i915` KMS config goes in `hardware/mbp-2017.nix`, not the Plymouth module; module works unmodified across configs |
| V. Daemon Integration | ✓ N/A | No sigild interaction |
| VI. Security by Default | ✓ PASS | Plymouth adds no network surface; `quiet` reduces boot-time info leakage |
| VII. Minimal Surface Area | ✓ PASS | Plymouth is justified for branded UX; no dev tools added to runtime; ISO size impact is the Plymouth binary + theme PNG only |

No violations. No Complexity Tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/006-plymouth-boot-splash/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── spec.md
└── tasks.md             ← /speckit.tasks output (not yet created)
```

### Source Code (repository root)

```text
modules/
└── sigil-plymouth.nix        ← new NixOS module (enable option + boot.plymouth config)

pkgs/
└── sigil-plymouth/
    ├── default.nix            ← stdenvNoCC derivation
    └── theme/
        ├── sigil.plymouth     ← Plymouth INI descriptor
        ├── sigil.script       ← animation script (pulse loop)
        └── logo.png           ← copied from sigilos_site/sigil_logo.png

hardware/
└── mbp-2017.nix               ← add i915 to initrd.kernelModules + quiet to kernelParams

flake.nix                      ← add sigil-plymouth module to sigil + sigil-iso configs
                                  (sigil-vm intentionally excluded)
```

**Structure Decision**: New `pkgs/` directory follows nixpkgs conventions for in-repo package derivations. The Plymouth module is a peer of other `modules/` files. No new top-level directories beyond `pkgs/` which is a standard NixOS pattern.

---

## Phase 0: Research ✓ Complete

See [research.md](research.md). All decisions resolved:

- Plymouth `script` plugin for custom animation
- `boot.initrd.systemd.enable = true` for early splash start
- `i915` in `boot.initrd.kernelModules` for full-resolution KMS
- Sine-wave pulse animation via `Plymouth.SetRefreshFunction`
- `quiet` + `udev.log_level=3` kernel params for silent boot
- greetd handoff is automatic — no changes to Hyprland module

---

## Phase 1: Design

### Theme Files

#### `pkgs/sigil-plymouth/theme/sigil.plymouth`

```ini
[Plymouth Theme]
Name=Sigil
Description=Sigil OS boot splash with pulsing logo
ModuleName=script

[script]
ImageDir=/usr/share/plymouth/themes/sigil
ScriptFile=/usr/share/plymouth/themes/sigil/sigil.script
```

The `substituteInPlace` in the derivation's `installPhase` replaces `/usr/` with `$out/`.

#### `pkgs/sigil-plymouth/theme/sigil.script`

```script
# Background: solid black matching Sigil shell dark theme
Window.SetBackgroundTopColor(0.05, 0.05, 0.05);
Window.SetBackgroundBottomColor(0, 0, 0);

# Load and center the Sigil logo
logo_image = Image("logo.png");
logo_sprite = Sprite(logo_image);
logo_sprite.SetX((Window.GetWidth()  / 2) - (logo_image.GetWidth()  / 2));
logo_sprite.SetY((Window.GetHeight() / 2) - (logo_image.GetHeight() / 2));
logo_sprite.SetZ(1);

# Pulse animation — sine wave, 0.5–1.0 opacity, ~2s cycle at 50 Hz
frame = 0;
fun refresh_callback () {
    opacity = 0.75 + 0.25 * Math.Sin(frame * 2 * Math.Pi / 100);
    logo_sprite.SetOpacity(opacity);
    frame++;
}
Plymouth.SetRefreshFunction(refresh_callback);
```

The `logo.png` is copied from `sigilos_site/sigil_logo.png` during the derivation's `installPhase`.

#### `pkgs/sigil-plymouth/default.nix`

```nix
{ stdenvNoCC, lib }:

stdenvNoCC.mkDerivation {
  pname = "sigil-plymouth";
  version = "1.0.0";

  src = ./theme;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/share/plymouth/themes/sigil
    cp -r * $out/share/plymouth/themes/sigil/
    substituteInPlace $out/share/plymouth/themes/sigil/sigil.plymouth \
      --replace-fail "/usr/" "$out/"
    runHook postInstall
  '';

  meta = {
    description = "Sigil OS Plymouth boot splash theme";
    platforms = lib.platforms.linux;
  };
}
```

### NixOS Module

#### `modules/sigil-plymouth.nix`

```nix
{ config, pkgs, lib, ... }:

with lib;
let
  cfg = config.services.sigil-plymouth;
  themePkg = pkgs.callPackage ../pkgs/sigil-plymouth {};
in {
  options.services.sigil-plymouth = {
    enable = mkEnableOption "Sigil OS branded boot splash screen";
  };

  config = mkIf cfg.enable {
    boot.plymouth = {
      enable = true;
      theme = "sigil";
      themePackages = [ themePkg ];
    };

    boot.initrd.systemd.enable = true;

    # Suppress boot text so it doesn't show through the splash
    boot.kernelParams = [ "quiet" "udev.log_level=3" "systemd.show_status=auto" ];
    boot.consoleLogLevel = 3;
    boot.initrd.verbose = false;
  };
}
```

### Hardware Changes

In `hardware/mbp-2017.nix`, change:
```nix
boot.initrd.kernelModules = [];
```
to:
```nix
boot.initrd.kernelModules = [ "i915" ];
```

This loads the Intel GPU driver early in the initrd so Plymouth gets a full-resolution KMS framebuffer from its first frame. Hardware-specific; does not belong in the module.

### Flake Integration

In `flake.nix`, add `./modules/sigil-plymouth.nix` to the imports for the `sigil` (installed) and `sigil-iso` configurations. Enable it in `services.nix`:

```nix
services.sigil-plymouth.enable = true;
```

The `sigil-vm` configuration does not import the module — VM boots show console output by default, which is useful for development.

---

## Validation Plan

| Check | Command | Expected |
|-------|---------|----------|
| Nix eval | `nix flake check` | Passes with no errors |
| VM smoke test | `make run-vm` | VM boots (no splash — module not imported for VM) |
| ISO integration | `make build-iso` | Builds without error |
| Runtime | Reboot MBP after `make push` | Sigil logo visible with pulse animation, no boot text, clean transition to desktop |
| Disable test | Set `enable = false`, rebuild, reboot | Default boot text visible, no splash |

---

## Scope Boundaries

**In scope:**
- Custom Plymouth script theme with pulse animation
- NixOS module with single enable option
- Silent boot kernel params
- Early KMS via i915 in initrd

**Out of scope:**
- Shutdown/reboot splash (nice-to-have; Plymouth quit-on-shutdown is a known upstream issue)
- LUKS password prompt styling (project doesn't use disk encryption)
- ISO live USB splash (included via `sigil-iso` imports, but not tested separately)
- Logo scaling / resolution variants (logo.png is used as-is)

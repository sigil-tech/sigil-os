# Research: Sigil Boot Splash Screen

**Branch**: `006-plymouth-boot-splash` | **Date**: 2026-03-16

---

## Decision 1: Plymouth as the splash system

**Decision**: Use Plymouth via `boot.plymouth` NixOS options.

**Rationale**: Plymouth is the standard Linux boot splash system, has first-class NixOS module support (`boot.plymouth.enable/theme/themePackages`), integrates cleanly with systemd initrd, and handles the greetd/Hyprland handoff automatically via `After=plymouth-quit-wait.service`. No alternative (raw framebuffer, kernel quiet-only, GRUB splash) provides animation or the clean compositor handoff.

**Alternatives considered**:
- Raw EFI framebuffer logo (no animation, no handoff coordination) — rejected
- systemd-boot bitmap logo (static, no animation) — rejected
- GRUB splash (project uses systemd-boot) — not applicable

---

## Decision 2: Script-based theme (not `boot.plymouth.logo`)

**Decision**: Write a full custom script-based Plymouth theme using the `script` plugin module, packaged as a Nix derivation.

**Rationale**: `boot.plymouth.logo` only injects a PNG into the built-in `bgrt`/`spinner` themes — it provides no animation control and uses the NixOS snowflake spinner. For a custom pulsing animation with Sigil branding we need a script theme. The `script` plugin is the most general-purpose Plymouth module, supports arbitrary per-frame logic via `Plymouth.SetRefreshFunction`, and requires no compiled code.

**Alternatives considered**:
- `boot.plymouth.logo` with `spinner` theme — provides logo but not custom animation; rejected
- `two-step` plugin — two-phase animation but less flexible scripting; rejected
- `fade-throbber` plugin — predefined animation only, no custom logic; rejected

---

## Decision 3: Sine-wave pulse animation

**Decision**: Animate the logo opacity using a sine wave: `opacity = 0.75 + 0.25 * Math.Sin(frame * 2 * Math.Pi / 100)`, giving a 0.5–1.0 range over a ~2 second cycle at 50 Hz.

**Rationale**: Plymouth's `SetRefreshFunction` fires at up to 50 Hz. A sine-wave pulse avoids the visual harshness of a linear fade (which has abrupt direction changes at 0 and 1). The 0.5 floor ensures the logo never fully disappears. The 2-second cycle is slow enough to feel calm rather than urgent. No trig tables or external math libraries needed — Plymouth's script language includes `Math.Sin` and `Math.Pi`.

**Alternatives considered**:
- Linear fade loop — simpler but visually harsh at endpoints; rejected
- Static logo (no animation) — does not meet FR-002; rejected
- Multi-frame sprite sequence — requires generating PNG frames; unnecessary complexity; rejected

---

## Decision 4: `boot.initrd.systemd.enable = true`

**Decision**: Enable the systemd initrd.

**Rationale**: Without it, Plymouth starts only in shell-script stage 1 (late, after udev finishes), making kernel messages visible before the splash. With `boot.initrd.systemd.enable = true`, Plymouth starts as a proper systemd unit (`plymouth-start.service`) during the systemd-managed initrd, before most udev activity. This is the only path to reliably suppressing boot text. The NixOS wiki and multiple community reports confirm this is required for a clean Plymouth experience. For the MBP's simple ext4/NVMe setup there are no known issues.

**Alternatives considered**:
- Shell-script initrd path — Plymouth starts late, kernel messages visible; rejected
- `boot.initrd.verbose = false` alone — reduces but does not eliminate visible text without systemd initrd; insufficient

---

## Decision 5: `i915` in `boot.initrd.kernelModules`

**Decision**: Add `i915` to `boot.initrd.kernelModules` in `hardware/mbp-2017.nix`.

**Rationale**: Without early KMS, Plymouth falls back to the EFI GOP framebuffer (often 1024×768 or the firmware-set resolution). The i915 driver supports KMS natively on Kaby Lake GT2. Adding it to `initrd.kernelModules` (not `availableKernelModules`) forces it to load during the initrd phase, before Plymouth tries to acquire the framebuffer. This guarantees full-resolution rendering from the first frame. `availableKernelModules` only makes the module available for on-demand loading — it does not force early load.

**Alternatives considered**:
- EFI GOP framebuffer only — works but resolution may be wrong and a mode-switch flash occurs when i915 takes over; rejected
- `availableKernelModules` only — udev loads i915 on demand, too late for Plymouth initrd phase; rejected

---

## Decision 6: Kernel parameters for silent boot

**Decision**: Add `quiet`, `udev.log_level=3`, `systemd.show_status=auto` to `boot.kernelParams`. Set `boot.consoleLogLevel = 3` and `boot.initrd.verbose = false`.

**Rationale**: `boot.plymouth.enable` automatically adds `splash` to kernel params but does NOT add `quiet`. Without `quiet`, kernel printk messages print over the Plymouth splash. `udev.log_level=3` suppresses udev messages in both initrd and stage 2. `systemd.show_status=auto` shows systemd status only if boot takes longer than expected. `consoleLogLevel = 3` sets the kernel log level to error-only. These are the standard NixOS wiki recommendations for a clean Plymouth boot.

**Alternatives considered**:
- `quiet` only — suppresses kernel printk but not udev noise; insufficient
- No extra params — kernel messages visible over splash; rejected

---

## Decision 7: Nix derivation structure

**Decision**: Package the theme as `pkgs/sigil-plymouth/default.nix` (a `stdenvNoCC.mkDerivation`) with theme source files co-located under `pkgs/sigil-plymouth/theme/`. The logo PNG is copied from `sigilos_site/sigil_logo.png` into the theme source at build time.

**Rationale**: `stdenvNoCC` is the correct base for a pure-data derivation (no compilation). The install phase copies theme files to `$out/share/plymouth/themes/sigil/` and patches hardcoded `/usr/` paths to `$out/` via `substituteInPlace`. This follows the exact pattern used by nixpkgs-packaged Plymouth themes (breeze, adi1090x variants). The NixOS Plymouth module scans `share/plymouth/themes/` to validate and assemble the initrd.

---

## Decision 8: Module location and enable option

**Decision**: New module at `modules/sigil-plymouth.nix`, imported in `flake.nix`. Exposes `services.sigil-plymouth.enable` (mkEnableOption). Boot config (`plymouth.*`, `initrd.*`, `kernelParams`) is scoped under `mkIf cfg.enable`. Hardware-specific parts (`i915` kernel module) go in `hardware/mbp-2017.nix`, not the Plymouth module, per the Hardware Abstraction principle.

**Rationale**: Follows the Module Boundaries principle — single-responsibility module, options declared with types and descriptions. VM configuration (`sigil-vm`) does not import this module, so the splash is off by default on VMs without needing an explicit `enable = false`. Constitution IV (Hardware Abstraction) is preserved by keeping `i915` in `hardware/`.

---

## Decision 9: greetd/Hyprland handoff — no changes needed

**Decision**: No changes to `sigil-hyprland.nix` or the greetd configuration.

**Rationale**: The NixOS Plymouth module automatically wires `plymouth-quit.service` and `plymouth-quit-wait.service` to `multi-user.target`. The NixOS-generated `greetd.service` unit already has `After=plymouth-quit-wait.service`, ensuring greetd (and therefore Hyprland) starts only after Plymouth has fully exited. This is confirmed in the generated systemd unit. No race condition, no explicit ordering required in the Hyprland module.

---

## Known risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Plymouth not showing on shutdown/reboot (nixpkgs #191620) | Medium | Acceptable — shutdown splash is a nice-to-have (FR-005). Not a boot regression. |
| Mode-switch flash between Plymouth exit and Hyprland first frame | Low | i915 early KMS minimises this. Brief black gap is normal with greetd/direct-launch. |
| `boot.initrd.systemd.enable` incompatibility with MBP NVMe | Very low | Simple ext4/NVMe with no LUKS — systemd initrd is well-tested for this setup. |

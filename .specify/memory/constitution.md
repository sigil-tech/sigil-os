# Sigil OS Constitution

## Core Principles

### I. Nix-First
All system configuration is declarative Nix. Every package, service, module, and configuration option is expressed in the Nix language and evaluated by the NixOS module system. No imperative shell scripts for system setup, no manual configuration steps that aren't captured in Nix. If a change can't be expressed as a Nix module or overlay, it doesn't belong in this repository. The flake.nix is the single entry point for all system builds.

### II. Reproducible Builds
Every commit MUST produce a bit-for-bit reproducible system image. `nix flake check` MUST pass before any merge. ISO builds, VM builds, and deployed system configurations all derive from the same flake outputs. Pin all inputs via flake.lock. Never use `fetchurl` without a hash. The goal: any engineer can checkout any commit and build the exact same system.

### III. Module Boundaries
Each NixOS module in `modules/` has a single, well-defined responsibility. Modules communicate through NixOS option interfaces, not by reading each other's internal state. New modules MUST declare their options with types and descriptions. Module dependencies are explicit via `imports` or option references. Cross-cutting concerns (networking, users, locale) belong in `sigil-base.nix`, not scattered across feature modules.

### IV. Hardware Abstraction
Hardware-specific configuration lives exclusively in `hardware/` and `flake.nix` configuration entries. Modules MUST NOT contain hardware-specific paths, drivers, or firmware references. The same module set MUST work across all three NixOS configurations (installed MBP, live ISO, QEMU VM) without modification. Hardware differences are resolved at the configuration level, not the module level.

### V. Daemon Integration
Sigil OS exists to package and run `sigild`. The `sigild.nix` module is the integration point between the OS and the Go daemon. All daemon configuration, service management, and socket setup flows through this module. Do not duplicate daemon logic in the OS layer — defer to sigild's own configuration system (TOML config, CLI flags) wherever possible. The OS provides the environment; the daemon provides the intelligence.

### VI. Security by Default
The system MUST boot into a secure state without user intervention. Secrets are managed via `secrets.nix` and never committed in plaintext. Services run with minimal privileges (DynamicUser, PrivateNetwork, etc. where applicable). The firewall is on by default. SSH keys, not passwords. Wayland-only compositor (Hyprland) — no X11 attack surface.

### VII. Minimal Surface Area
Every package included in the system MUST justify its presence. Prefer NixOS modules over raw packages. Prefer single-purpose tools over feature-rich alternatives. The live ISO must remain small enough for USB deployment. Do not include development tools, compilers, or build dependencies in the runtime system image — those belong in dev shells (`nix develop`).

## Infrastructure Constraints

- **Build system**: Nix flakes exclusively. No legacy `nix-build` or `nix-env`.
- **Configurations**: Three NixOS configurations — `sigil` (installed), `sigil-iso` (live USB), `sigil-vm` (QEMU testing).
- **Hardware target**: 2017 MacBook Pro (`hardware/mbp-2017.nix`). Future hardware via additional `hardware/*.nix` files.
- **Compositor**: Hyprland (Wayland). No X11, no GNOME, no KDE.
- **Shell frontend**: Tauri-based Sigil Shell (`shell/`). Webview-native, not Electron.
- **Inference**: Local llama.cpp via `sigil-inference.nix`. Model management through Nix store.
- **Validation**: `nix flake check` for syntax/eval, `make build-iso` for full integration, `make run-vm` for runtime testing.

## Development Workflow

- **Spec-driven**: Features follow the `/speckit.specify` -> `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement` workflow. No implementation without a spec.
- **Feature branches**: Named `NNN-short-name` (e.g., `001-bluetooth-audio`). One branch per spec.
- **Testing strategy**: `nix flake check` for fast validation (~5s), QEMU VM for runtime testing, ISO rebuild for integration. Batch changes before ISO rebuilds — they are slow.
- **Deploy**: `make deploy` for installed MBP, `make build-iso` for USB installer, `make run-vm` for local testing.

## Governance

This constitution governs all changes to the Sigil OS NixOS configuration, modules, and system integration. It supersedes ad-hoc decisions. Amendments require updating this document and noting the change.

**Version**: 1.0.0 | **Ratified**: 2026-03-14 | **Last Amended**: 2026-03-14

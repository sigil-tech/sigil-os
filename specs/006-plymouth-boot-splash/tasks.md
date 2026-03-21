# Tasks: Sigil Boot Splash Screen

**Input**: Design documents from `/specs/006-plymouth-boot-splash/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓

**Repos affected**: `~/workspace/sigil-os` only

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase
- **[Story]**: US1=Branded boot experience, US2=Module enable/disable
- Tests are **not** included (not requested in spec)

---

## Phase 1: Setup

**Purpose**: Create the directory structure and source the logo asset before any Nix code is written.

- [X] T001 Create `pkgs/sigil-plymouth/theme/` directory and copy `sigil_logo.png` from `../sigilos_site/sigil_logo.png` into it as `logo.png`; create empty placeholder `pkgs/sigil-plymouth/default.nix`

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: Hardware KMS configuration must land in `hardware/mbp-2017.nix` before the Plymouth module is wired up — without early `i915` load, Plymouth cannot acquire a full-resolution framebuffer during the initrd phase regardless of module config.

**⚠️ CRITICAL**: The splash will silently fall back to a low-resolution or missing framebuffer if this phase is skipped.

- [X] T002 Update `hardware/mbp-2017.nix`: change `boot.initrd.kernelModules = []` to `[ "i915" ]`; append `"quiet"`, `"udev.log_level=3"`, `"systemd.show_status=auto"` to the existing `boot.kernelParams` list (which already contains `"hid_apple.fnmode=2"`)

**Checkpoint**: `nix flake check` must still pass after this change before proceeding.

---

## Phase 3: User Story 1 — Branded Boot Experience (Priority: P1)

**Goal**: The MBP shows the Sigil logo with a pulsing animation from display-on to desktop-ready. No boot text visible.

**Independent Test**: Run `make push`, reboot the MBP. The Sigil logo appears centered on a dark background with a visible pulse animation. No kernel messages or boot text visible. Animation stops and desktop appears cleanly.

- [X] T003 [P] [US1] Write `pkgs/sigil-plymouth/theme/sigil.plymouth` — INI descriptor with `[Plymouth Theme]` section (`Name=Sigil`, `Description=Sigil OS boot splash with pulsing logo`, `ModuleName=script`) and `[script]` section (`ImageDir=/usr/share/plymouth/themes/sigil`, `ScriptFile=/usr/share/plymouth/themes/sigil/sigil.script`)
- [X] T004 [P] [US1] Write `pkgs/sigil-plymouth/theme/sigil.script` — set black background via `Window.SetBackgroundTopColor(0.05, 0.05, 0.05)` and `Window.SetBackgroundBottomColor(0, 0, 0)`; load `logo.png` with `Image()`; create centered `Sprite`; implement sine-wave pulse via `Plymouth.SetRefreshFunction` with `opacity = 0.75 + 0.25 * Math.Sin(frame * 2 * Math.Pi / 100)` incrementing a `frame` counter each tick
- [X] T005 [US1] Write `pkgs/sigil-plymouth/default.nix` — `stdenvNoCC.mkDerivation` with `src = ./theme`, `dontBuild = true`, `installPhase` that copies all theme files to `$out/share/plymouth/themes/sigil/` and runs `substituteInPlace` on `sigil.plymouth` replacing `/usr/` with `$out/` (depends on T003, T004)
- [X] T006 [US1] Write `modules/sigil-plymouth.nix` — `with lib` module declaring `options.services.sigil-plymouth.enable = mkEnableOption "Sigil OS branded boot splash screen"`; under `config = mkIf cfg.enable` set `boot.plymouth.enable = true`, `boot.plymouth.theme = "sigil"`, `boot.plymouth.themePackages = [ (pkgs.callPackage ../pkgs/sigil-plymouth {}) ]`, `boot.initrd.systemd.enable = true`, `boot.consoleLogLevel = 3`, `boot.initrd.verbose = false` (depends on T005)
- [X] T007 [US1] Update `flake.nix` to import `./modules/sigil-plymouth.nix` in the `sigil` (installed) and `sigil-iso` module lists; confirm `sigil-vm` does NOT import it
- [X] T008 [US1] Add `services.sigil-plymouth.enable = true` to `services.nix` (depends on T006, T007)

**Checkpoint**: `nix flake check` passes. `make push` + reboot shows branded splash.

---

## Phase 4: User Story 2 — Module Enable/Disable (Priority: P2)

**Goal**: A single boolean option controls the splash. VM config is unaffected. Toggling off restores default boot behavior exactly.

**Independent Test**: Set `services.sigil-plymouth.enable = false` in `services.nix`, run `nix flake check` — all three configs evaluate cleanly. `make run-vm` boots the VM with no splash and normal console output.

- [X] T009 [US2] Run `nix flake check` and confirm all three NixOS configurations (`sigil`, `sigil-iso`, `sigil-vm`) evaluate without errors; the VM config must evaluate cleanly without the Plymouth module
- [X] T010 [US2] Run `make run-vm` and confirm the VM boots normally with console output visible (no splash — module not imported for sigil-vm)

**Checkpoint**: All three configs evaluate. VM boots clean. Toggle confirmed working.

---

## Phase 5: Polish & Validation

**Purpose**: End-to-end validation on real hardware.

- [ ] T011 Deploy to MBP with `make push MBP_HOST=nick@<ip>`, reboot, and verify: (1) Sigil logo visible with pulse within 1s of display activation, (2) no boot text visible, (3) clean transition to Hyprland desktop, (4) time-to-desktop not measurably increased vs baseline

---

## Dependency Graph

```
T001 (setup) → T003, T004 (parallel theme files)
T002 (hardware KMS) → required before T011 (runtime test)
T003 + T004 → T005 (derivation)
T005 → T006 (module)
T006 → T007 (flake import)
T007 → T008 (enable in services.nix)
T008 → T009 (eval check)
T009 → T010 (VM boot test)
T010 → T011 (hardware deploy)
```

**Parallel opportunities**:
- T003 and T004 are fully parallel (different files, no dependency between them)
- T009 and T010 can overlap (flake check is fast; VM boot can start while check runs)

---

## Implementation Strategy

### MVP Scope (US1 only — 8 tasks)

1. Phase 1: T001 (setup)
2. Phase 2: T002 (hardware KMS) + `nix flake check`
3. Phase 3: T003 + T004 in parallel → T005 → T006 → T007 → T008
4. **Validate**: `nix flake check` + `make push` + reboot

US2 (T009–T010) adds the disable/VM validation on top and takes ~10 minutes.

### Total Task Count: 11 tasks
- Phase 1 (Setup): 1 task
- Phase 2 (Foundational): 1 task
- Phase 3 (US1): 6 tasks
- Phase 4 (US2): 2 tasks
- Phase 5 (Polish): 1 task

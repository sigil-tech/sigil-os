# Feature Specification: Sigil Boot Splash Screen

**Feature Branch**: `006-plymouth-boot-splash`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "Now that sigil-os always boots to the latest NixOS generation, replace the default NixOS boot screen with an animated Sigil logo splash screen. The splash should display the Sigil logo with a simple animation (e.g. fade or pulse) during the boot interstitial — from kernel start until the desktop environment is ready. Assets (sigil_logo.png, sigil_with_name.png) already exist in the sigilos_site repo. The feature should be packaged as a NixOS module so it can be enabled/disabled cleanly."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Branded Boot Experience (Priority: P1)

When a Sigil OS machine powers on or reboots, the user sees the Sigil logo with a smooth animation rather than text scrolling or a generic OS boot screen. The experience lasts from when the display is first available until the desktop environment is ready to use.

**Why this priority**: This is the entire feature. Every boot is an impression — replacing the generic NixOS screen with a branded animation makes the OS feel intentional and polished. All other stories are refinements on top of this.

**Independent Test**: Reboot the machine. From the moment the display activates, the Sigil logo appears centered on a dark background with a visible animation. No boot text is visible. The splash disappears cleanly when the desktop appears.

**Acceptance Scenarios**:

1. **Given** the machine is powering on, **When** the display activates, **Then** the Sigil logo is shown centered on a dark background with an animation running.
2. **Given** the splash is active, **When** the desktop environment finishes loading, **Then** the splash fades out and the desktop appears without a visual flash or black gap.
3. **Given** the machine is rebooting, **When** the shutdown sequence begins, **Then** the splash also appears during shutdown for a consistent experience.

---

### User Story 2 - Module Enable/Disable (Priority: P2)

A developer can toggle the splash screen on or off via a single NixOS configuration option, without modifying multiple files or understanding the internals of the splash system.

**Why this priority**: Required for testability and rollback safety. If the splash breaks on new hardware or a future kernel, it must be trivially disableable. The VM configuration should also have the splash off by default.

**Independent Test**: Set the option to `false`, rebuild, reboot — default boot text appears. Set to `true`, rebuild, reboot — branded splash appears. No other changes required in either direction.

**Acceptance Scenarios**:

1. **Given** the splash module option is set to `false`, **When** the system boots, **Then** the default NixOS boot behavior is unchanged.
2. **Given** the splash module option is set to `true`, **When** the system boots, **Then** the branded splash is shown.
3. **Given** the option is toggled, **When** the system is rebuilt and rebooted, **Then** the change takes effect without additional manual steps.

---

### Edge Cases

- What if the display is not available early enough for the splash to render (e.g., GPU init delay on certain monitors)? Boot must complete normally — splash failure must not block or delay boot.
- What if the splash assets are missing from the build? The build should fail with a clear error rather than producing a broken splash at runtime.
- Does the splash appear in the VM configuration? No — VMs benefit from visible console output during development and should default to splash disabled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display the Sigil logo centered on a dark background as soon as the display is available during boot.
- **FR-002**: The logo MUST be animated with a continuous looping effect (fade, pulse, or equivalent) for the full duration of the splash.
- **FR-003**: The splash MUST cover the entire screen — no boot text, kernel messages, or progress bars must be visible behind it.
- **FR-004**: The splash MUST disappear cleanly when the desktop environment is ready, with no black flash or abrupt cut.
- **FR-005**: The splash MUST also appear during system shutdown and reboot for a consistent experience.
- **FR-006**: The feature MUST be packaged as a self-contained NixOS module toggleable with a single boolean option.
- **FR-007**: The splash MUST use the existing Sigil logo assets from the sigilos_site repo without requiring new design work.
- **FR-008**: Disabling the splash MUST restore default boot behavior exactly, with no side effects on kernel output or display initialisation.
- **FR-009**: The splash MUST NOT increase time-to-desktop — it renders over the normal boot process without adding sequential steps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On every boot and reboot, the Sigil logo is visible within 1 second of the display activating.
- **SC-002**: The animation runs without visible stutter or dropped frames for the full duration of the splash.
- **SC-003**: Zero boot text or kernel messages are visible to the user during a normal boot with the splash enabled.
- **SC-004**: Toggling the feature off and rebuilding requires no more than changing one configuration value.
- **SC-005**: Time-to-desktop with the splash enabled is within 2 seconds of time-to-desktop with it disabled (no meaningful boot regression).

## Assumptions

- The target hardware (MBP 2017, Intel GPU) supports kernel mode setting early enough for the splash to render at full resolution. If hardware init is too late, the splash degrades gracefully rather than blocking boot.
- The VM configuration (`sigil-vm`) will have the splash disabled by default — the module default is `false` (opt-in).
- Animation is a single looping effect on one logo image — no multi-frame spritesheet or video encoding required.
- Dark background color is near-black, consistent with the Sigil shell UI aesthetic.
- The splash covers both the early kernel boot phase and the systemd service startup phase, through to desktop ready.

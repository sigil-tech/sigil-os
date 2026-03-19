# Feature Specification: Shell Font Update

**Feature Branch**: `003-shell-font-update`
**Created**: 2026-03-15
**Status**: Draft
**Input**: User description: "Update sigil-shell and Hyprland terminal font to Fira Code 14pt with Consolas and Courier New fallbacks. Current text is too hard to read."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Readable Text in Sigil Shell (Priority: P1)

As an engineer using Sigil OS, I want all text in the Sigil Shell (terminal, editor, browser bar, input bar, overlays, and all UI chrome) to render in Fira Code at 14pt so that code and interface elements are easy to read at a comfortable distance.

**Why this priority**: The shell is the primary interaction surface. If text is hard to read, every task is impacted.

**Independent Test**: Open Sigil Shell and visually confirm all UI text renders in Fira Code at 14pt. If Fira Code is unavailable, text falls back to Consolas, then Courier New, then the system monospace font.

**Acceptance Scenarios**:

1. **Given** a fresh Sigil OS boot, **When** the user opens Sigil Shell, **Then** all text in the terminal view, editor view, browser URL bar, input bar, suggestion bar, command palette, AI overlay, and status indicators renders in Fira Code at 14pt.
2. **Given** Fira Code is not installed on the system, **When** the user opens Sigil Shell, **Then** text falls back to Consolas, then Courier New, then the system default monospace font.
3. **Given** the shell is open, **When** the user switches between views (terminal, editor, browser, git, containers, insights), **Then** the font family and size remain consistent across all views.

---

### User Story 2 - Readable Text in Hyprland Terminal (Priority: P1)

As an engineer using Sigil OS, I want the standalone Hyprland terminal emulator (foot) and the Waybar status bar to also use Fira Code at 14pt so that the reading experience is consistent whether I'm inside or outside the shell.

**Why this priority**: Engineers frequently pop out terminals or glance at the status bar. Inconsistent or small fonts break the experience.

**Independent Test**: Open a foot terminal from the Hyprland keybinding and confirm it renders in Fira Code 14pt. Confirm the Waybar text also uses Fira Code 14pt.

**Acceptance Scenarios**:

1. **Given** the user is on the Hyprland desktop, **When** they open a standalone terminal (foot), **Then** text renders in Fira Code at 14pt with bold variant for bold text.
2. **Given** the user is on the Hyprland desktop, **When** they look at the Waybar status bar, **Then** bar text renders in Fira Code at 14pt.

---

### User Story 3 - Font Availability at OS Level (Priority: P1)

As a Sigil OS user, I want Fira Code to be bundled with the OS so that the font is always available without manual installation.

**Why this priority**: If the font isn't present, Stories 1 and 2 silently degrade to a fallback, defeating the purpose.

**Independent Test**: Boot a fresh Sigil OS installation and confirm Fira Code is listed in the system font cache. Confirm it is the default monospace font.

**Acceptance Scenarios**:

1. **Given** a fresh Sigil OS installation, **When** the system boots, **Then** Fira Code is available in the system font cache.
2. **Given** Fira Code is installed, **When** the system resolves the default monospace font, **Then** Fira Code is the first choice, followed by DejaVu Sans Mono as a fallback.

---

### Edge Cases

- What happens when Fira Code font files are corrupted or missing from the package store? The system should gracefully fall back to the next font in the stack (Consolas, Courier New, system monospace) without rendering errors.
- What happens on a display with very high or very low DPI? The 14pt size should appear proportionally correct regardless of display scaling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST bundle Fira Code as a system font available to all applications.
- **FR-002**: The system MUST configure Fira Code as the default monospace font in the system font configuration.
- **FR-003**: The Sigil Shell MUST use the font stack "Fira Code, Consolas, Courier New, monospace" for all text rendering (terminal, editor, browser chrome, input bar, suggestion bar, command palette, AI overlay, and all other UI elements).
- **FR-004**: The Sigil Shell MUST render text at 14pt across all views and UI components.
- **FR-005**: The standalone terminal emulator MUST use Fira Code at 14pt for regular text and Fira Code Bold at 14pt for bold text.
- **FR-006**: The desktop status bar MUST use Fira Code at 14pt.
- **FR-007**: The Sigil Shell theme configuration module MUST default to the Fira Code font stack and 14pt size, allowing override through the theming system.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of text-rendering surfaces in Sigil Shell display Fira Code at 14pt on a fresh boot with no remnants of the previous font or size.
- **SC-002**: The standalone terminal and status bar match the shell's font and size, providing a visually consistent experience across the entire desktop.
- **SC-003**: Text is comfortably readable at normal viewing distance (arm's length from a laptop display) without squinting, as validated by the requesting user.
- **SC-004**: Font fallback works correctly; removing Fira Code from the system results in text rendering in the next available font in the stack rather than missing-glyph placeholders.

## Assumptions

- The target display is a 2017 MacBook Pro (Retina, ~220 PPI). At 14pt with HiDPI scaling, text should be comfortable.
- Fira Code is available in the OS package repository.
- "14pt" in the shell CSS context means 14px, which is standard for web-rendered UIs. In terminal and status bar config, 14 refers to point size as interpreted by the font system.
- Consolas may not be available on the target OS (it is a Microsoft font). The font stack is ordered by preference; the system will skip unavailable fonts gracefully.

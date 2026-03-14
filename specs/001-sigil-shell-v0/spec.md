# Feature Specification: Sigil Shell v0

**Feature Branch**: `001-sigil-shell-v0`
**Created**: 2026-03-14
**Status**: Draft
**Input**: User description: "Phase 2: Tauri app full-screen on Hyprland. All six tool views. Daemon socket connection. Live suggestion bar. AI mode input. 20+ socket API methods for shell integration."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unified Tool Navigation (Priority: P1)

A developer launches Sigil OS and is presented with a single full-screen application containing six integrated tool views: Terminal, Editor, Browser, Git, Containers, and Insights. They switch between views instantly using keyboard shortcuts (Ctrl+1 through Ctrl+6) or by clicking icons in the left rail. Each view preserves its state when switching away and back — a running terminal session, an open Neovim file, or a browser page all remain exactly as left.

**Why this priority**: The shell is the primary interface for all developer work. Without reliable tool switching and state preservation, no other feature matters.

**Independent Test**: Can be tested by launching the shell, opening each of the six views in sequence, performing an action in each (run a command, open a file, navigate to a URL, view git log, list containers, view insights), then cycling back through all views to confirm state is preserved.

**Acceptance Scenarios**:

1. **Given** the shell is running full-screen on Hyprland, **When** the developer presses Ctrl+1, **Then** the Terminal view is displayed with a live PTY session.
2. **Given** the developer has typed a command in the Terminal view, **When** they press Ctrl+2 to switch to Editor then Ctrl+1 to return, **Then** the terminal shows the same session with command output intact.
3. **Given** the developer clicks the Git icon in the left rail, **When** the Git view loads, **Then** it displays the current branch, file statuses, and recent commit log for the active repository.
4. **Given** the developer is in any view, **When** they press Ctrl+Shift+O, **Then** the current tool pops out to a floating Hyprland window.

---

### User Story 2 - Terminal & Editor with PTY (Priority: P1)

A developer uses the Terminal view as their primary shell, running commands, viewing output, and navigating directories. They switch to the Editor view to open files in Neovim. Both views use real PTY connections, supporting full terminal emulation including colors, cursor movement, and interactive programs.

**Why this priority**: Terminal and editor are the most-used tools. PTY fidelity is essential for professional use.

**Independent Test**: Can be tested by spawning a terminal, running an interactive program (e.g., htop or vim), confirming it renders correctly, then switching to Editor view and opening a file in Neovim with syntax highlighting.

**Acceptance Scenarios**:

1. **Given** the Terminal view is active, **When** the developer types a command and presses Enter, **Then** the command executes in the PTY and output renders with correct ANSI colors and formatting.
2. **Given** the Terminal view is active, **When** the developer resizes the window or split pane, **Then** the PTY dimensions update and programs reflow correctly.
3. **Given** the Editor view is active, **When** the developer opens a file, **Then** Neovim launches in an embedded PTY with syntax highlighting and full keyboard support.

---

### User Story 3 - Daemon Socket Connection & Status (Priority: P1)

The shell maintains a persistent connection to the sigild daemon via Unix socket. The left rail displays a live health indicator (green dot when connected, red when disconnected). The shell automatically reconnects if the daemon restarts. Daemon status (memory usage, inference mode, uptime) is visible at a glance.

**Why this priority**: The daemon connection is the backbone for suggestions, AI queries, insights, and all intelligent features. Without it, the shell is just a tool switcher.

**Independent Test**: Can be tested by starting the shell with sigild running, confirming green status dot, stopping sigild, confirming red dot appears, restarting sigild, and confirming the shell reconnects and shows green again.

**Acceptance Scenarios**:

1. **Given** sigild is running, **When** the shell starts, **Then** it connects to the daemon socket and displays a green health indicator within 2 seconds.
2. **Given** the shell is connected, **When** sigild is stopped, **Then** the health indicator turns red and the shell degrades gracefully (tool views still work, daemon-dependent features show "disconnected" state).
3. **Given** the shell shows a disconnected state, **When** sigild restarts, **Then** the shell reconnects automatically within 5 seconds and restores full functionality.
4. **Given** the shell is connected, **When** the developer views the left rail, **Then** they see current memory usage (MB), inference mode (local/hybrid/cloud), and daemon version.

---

### User Story 4 - Live Suggestion Bar (Priority: P2)

As the developer works, the daemon pushes contextual suggestions to the shell via a real-time subscription. Suggestions appear in a compact bar between the content area and the input bar. The developer can accept a suggestion with Tab (which may execute an action) or dismiss it with Esc. Multiple suggestions queue and rotate every 8 seconds.

**Why this priority**: The suggestion bar is the primary surface for the daemon's intelligence — it's how the system communicates patterns and actionable insights without interrupting flow.

**Independent Test**: Can be tested by performing repetitive actions that trigger daemon heuristics (e.g., editing a file then running tests repeatedly), then observing that a relevant suggestion appears in the bar, pressing Tab to accept it, and confirming the feedback is recorded.

**Acceptance Scenarios**:

1. **Given** the daemon detects a workflow pattern, **When** it pushes a suggestion, **Then** the suggestion bar slides into view showing the title and description text.
2. **Given** a suggestion is displayed, **When** the developer presses Tab, **Then** the suggestion is marked as accepted, feedback is sent to the daemon, and any associated action command executes.
3. **Given** a suggestion is displayed, **When** the developer presses Esc, **Then** the suggestion is dismissed, feedback is sent to the daemon, and the next queued suggestion (if any) appears.
4. **Given** multiple suggestions are queued, **When** 8 seconds elapse, **Then** the bar rotates to display the next suggestion.
5. **Given** no suggestions are pending, **When** the developer looks at the shell, **Then** the suggestion bar is hidden (zero height) and does not consume screen space.

---

### User Story 5 - AI Mode Input (Priority: P2)

The developer toggles the input bar between Shell mode ($) and AI mode (✦) using Alt+Tab. In AI mode, they type natural language queries that are routed through the daemon's inference engine. Responses render as a markdown overlay on the content pane, showing whether the response was routed locally or to the cloud.

**Why this priority**: AI mode is the conversational intelligence interface — it turns the shell from a tool switcher into an AI-assisted development environment.

**Independent Test**: Can be tested by pressing Alt+Tab to enter AI mode, typing a question (e.g., "What files did I edit most today?"), pressing Enter, and confirming a markdown response appears with routing information.

**Acceptance Scenarios**:

1. **Given** the input bar is in Shell mode, **When** the developer presses Alt+Tab, **Then** the mode indicator changes from "$" to "✦" and the placeholder text updates to indicate AI mode.
2. **Given** the input bar is in AI mode, **When** the developer types a query and presses Enter, **Then** a loading spinner appears on the mode indicator while the query is processed.
3. **Given** an AI query has been submitted, **When** the daemon returns a response, **Then** a markdown-rendered overlay appears on the content pane showing the response and a routing badge (local/cloud).
4. **Given** the AI overlay is visible, **When** the developer presses Esc or switches views, **Then** the overlay dismisses and the underlying view is fully visible.
5. **Given** the input bar is in AI mode, **When** the developer presses Alt+Tab again, **Then** the mode returns to Shell mode and input is routed to the active PTY.

---

### User Story 6 - Socket API for Shell Integration (Priority: P2)

The daemon exposes 20+ socket API methods that the shell and external tools (sigilctl, shell hooks) use to query state, push events, control notifications, and manage the system. The API uses a newline-delimited JSON protocol over Unix socket, supporting both request/response and push subscription modes.

**Why this priority**: The socket API is the integration contract between the daemon and all clients. It must be comprehensive enough that the shell, CLI, and future integrations can all operate fully.

**Independent Test**: Can be tested by connecting to the daemon socket with a raw client (e.g., socat or sigilctl) and exercising each API method, confirming correct JSON responses for: status, config, events, ingest, suggestions, patterns, feedback, trigger-summary, files, commands, sessions, set-level, ai-query, actions, undo, view-changed, purge, fleet-preview, fleet-opt-out, fleet-policy, and both subscription topics.

**Acceptance Scenarios**:

1. **Given** the daemon is running, **When** a client sends `{"method":"status","payload":null}`, **Then** the daemon responds with version, uptime, memory usage, notification level, and keybinding profile.
2. **Given** the daemon is running, **When** a client sends `{"method":"ingest","payload":{"cmd":"go test","exit_code":0,"cwd":"/home/user/project"}}`, **Then** the daemon stores the terminal event and responds with `{"ok":true}`.
3. **Given** the daemon is running, **When** a client sends `{"method":"subscribe","payload":{"topic":"suggestions"}}`, **Then** the connection upgrades to a push channel and receives suggestion events as they are generated.
4. **Given** the daemon is running, **When** a client sends `{"method":"ai-query","payload":{"query":"What am I working on?"}}`, **Then** the daemon routes the query through inference and responds with a text answer, routing indicator, and latency.

---

### User Story 7 - Browser, Git, Containers & Insights Views (Priority: P3)

The developer uses the Browser view to navigate web pages via an embedded WebView with URL bar and navigation controls. The Git view shows current branch, file status (modified/staged/untracked/deleted), commit log, and file diffs. The Containers view lists Docker containers with start/stop/restart controls and log viewing. The Insights view provides tabbed access to recent events, detected patterns, AI history, LLM prompts, and fleet metrics.

**Why this priority**: These views complete the "six tools in one shell" promise but are less frequently used than terminal/editor and can function with reduced fidelity initially.

**Independent Test**: Can be tested independently per view: navigate to a URL in Browser, view a git diff in Git, start/stop a container in Containers, and browse pattern history in Insights.

**Acceptance Scenarios**:

1. **Given** the Browser view is active, **When** the developer enters a URL and presses Enter, **Then** the page loads in the embedded WebView with back/forward/reload controls functional.
2. **Given** the Git view is active with a repository detected, **When** the developer selects a modified file, **Then** a unified diff is displayed in the right panel.
3. **Given** the Containers view is active, **When** the developer clicks "Stop" on a running container, **Then** the container stops and its status updates to reflect the stopped state.
4. **Given** the Insights view is active, **When** the developer selects the "Patterns" tab, **Then** detected workflow patterns are displayed with confidence scores.

---

### User Story 8 - Split Pane & Workspace Management (Priority: P3)

The developer can split the content area horizontally (Ctrl+\) or vertically (Ctrl+Shift+\) to view two tools side by side. They switch focus between panes with Ctrl+[ and Ctrl+]. Each pane independently selects which tool view to display. The command palette (Ctrl+K) provides fuzzy search across tool switches, sigilctl commands, and recent files.

**Why this priority**: Split panes enhance productivity but are not essential for core workflows. The command palette is a power-user accelerator.

**Independent Test**: Can be tested by pressing Ctrl+\ to split, selecting different views in each pane, confirming both render correctly, and using Ctrl+[ / Ctrl+] to switch focus.

**Acceptance Scenarios**:

1. **Given** the shell is in single-view mode, **When** the developer presses Ctrl+\, **Then** the content area splits horizontally showing two panes.
2. **Given** the shell is in split mode, **When** the developer presses Ctrl+], **Then** focus moves to the secondary pane and its border highlights.
3. **Given** the shell is in split mode, **When** the developer presses Ctrl+\ again, **Then** the split closes and returns to single-view mode.
4. **Given** the developer presses Ctrl+K, **When** they type a search term, **Then** the command palette shows fuzzy-matched results from tools, commands, and recent files.

---

### Edge Cases

- What happens when the daemon socket does not exist at startup? The shell launches in degraded mode with all tool views functional but daemon-dependent features (suggestions, AI, insights) showing a "daemon unavailable" message. The shell retries connection every 5 seconds.
- What happens when Docker is not installed or the socket is missing? The Containers view shows "Docker unavailable" with no errors or crashes.
- What happens when the developer submits an AI query but inference is unavailable? The input bar shows an error state and displays a user-friendly message ("Inference unavailable — check daemon configuration").
- What happens when PTY spawn fails? The Terminal/Editor view shows an error message with the failure reason rather than a blank screen.
- What happens when multiple suggestion push events arrive simultaneously? They queue in order and the bar rotates through them at the 8-second interval.
- What happens when the developer accepts a suggestion with an action command that fails? The failure is reported in the suggestion bar and the action is logged for debugging.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render as a single full-screen, undecorated window on the Hyprland compositor via Wayland.
- **FR-002**: System MUST provide six integrated tool views: Terminal, Editor, Browser, Git, Containers, and Insights.
- **FR-003**: System MUST preserve the state of all views when switching between them (keep-alive pattern — all views mounted, shown/hidden via CSS).
- **FR-004**: System MUST connect to the sigild daemon via Unix domain socket using newline-delimited JSON protocol.
- **FR-005**: System MUST display a live daemon health indicator (connected/disconnected) in the left rail, updated at minimum every 30 seconds.
- **FR-006**: System MUST auto-reconnect to the daemon with exponential backoff (2-second base, up to 10 attempts) when the connection drops.
- **FR-007**: System MUST spawn real PTY sessions for Terminal and Editor views using a portable PTY abstraction.
- **FR-008**: System MUST support PTY resize when the view dimensions change.
- **FR-009**: System MUST embed Neovim in the Editor view via a PTY connection.
- **FR-010**: System MUST provide an embedded WebView in the Browser view with URL bar, back, forward, and reload controls.
- **FR-011**: System MUST display current branch, file statuses, commit log (last 20 commits), and unified diffs in the Git view.
- **FR-012**: System MUST list Docker containers with status, controls (start/stop/restart), and log viewing in the Containers view.
- **FR-013**: System MUST provide an Insights view with tabs for Events, Patterns, AI History, Prompts, and Team Insights.
- **FR-014**: System MUST implement a suggestion bar that receives push events from the daemon subscription and displays them with accept (Tab) and dismiss (Esc) actions.
- **FR-015**: System MUST send feedback (accepted/dismissed with suggestion ID) back to the daemon when the user interacts with a suggestion.
- **FR-016**: System MUST implement a dual-mode input bar toggled by Alt+Tab: Shell mode ($) routes to the active PTY, AI mode (✦) routes to the daemon's inference engine.
- **FR-017**: System MUST render AI responses as markdown in an overlay on the content pane, with a routing badge indicating local or cloud inference.
- **FR-018**: System MUST support horizontal split (Ctrl+\) and vertical split (Ctrl+Shift+\) with focus switching (Ctrl+[, Ctrl+]).
- **FR-019**: System MUST provide a command palette (Ctrl+K) with fuzzy search across tools, commands, and recent files.
- **FR-020**: System MUST support popping out any tool view to a floating Hyprland window via Ctrl+Shift+O.
- **FR-021**: System MUST maintain command history (up to 1000 entries) navigable with ArrowUp/ArrowDown in the input bar.
- **FR-022**: System MUST support undo of the last daemon action via Ctrl+Z when the input bar is empty.
- **FR-023**: The daemon MUST expose at minimum 20 socket API methods including: status, config, events, ingest, suggestions, patterns, feedback, trigger-summary, files, commands, sessions, set-level, ai-query, actions, undo, view-changed, purge, fleet-preview, fleet-opt-out, and fleet-policy.
- **FR-024**: The daemon MUST support push subscription channels for "suggestions" and "actuations" topics.
- **FR-025**: System MUST inject theme CSS from the NixOS configuration at startup, using CSS custom properties for all colors and fonts.
- **FR-026**: System MUST use IBM Plex Mono as the primary font throughout the interface.
- **FR-027**: System MUST degrade gracefully when external dependencies are unavailable (daemon offline, Docker missing, no git repository).

### Key Entities

- **View**: One of six tool views (Terminal, Editor, Browser, Git, Containers, Insights) with an active/inactive state and preserved internal state.
- **PTY Session**: A pseudo-terminal connection between the shell and a process (shell or Neovim), identified by a unique ID, with read/write/resize capabilities.
- **Suggestion**: A daemon-generated recommendation with ID, category (pattern/insight/ai_discovery), confidence score, title, body text, optional action command, and lifecycle status (new/shown/accepted/dismissed).
- **Socket Method**: A named daemon API endpoint accepting a JSON payload and returning a JSON response, operating over the Unix domain socket.
- **Subscription**: A long-lived push channel on the daemon socket that streams events for a given topic (suggestions, actuations) to the shell.
- **Split State**: The content pane layout configuration — mode (none/horizontal/vertical), primary view, secondary view, and which pane has focus.
- **Input Mode**: The current mode of the input bar — Shell ($) for PTY commands or AI (✦) for natural language queries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developer can switch between all six tool views in under 200 milliseconds with no visible flicker or state loss.
- **SC-002**: Terminal view supports full interactive programs (vim, htop, ssh) with correct rendering of ANSI escape sequences, colors, and cursor positioning.
- **SC-003**: Shell maintains daemon connection uptime of 99%+ during normal operation, reconnecting within 5 seconds after daemon restart.
- **SC-004**: Suggestions from daemon appear in the suggestion bar within 1 second of being generated.
- **SC-005**: AI mode queries return rendered responses within 5 seconds for local inference and 10 seconds for cloud inference.
- **SC-006**: All 20+ socket API methods return correct JSON responses as documented, with error responses for invalid inputs.
- **SC-007**: Total memory footprint of the shell application stays under 200MB during typical use (six views active, one PTY session, daemon connected).
- **SC-008**: Split pane mode renders both views simultaneously with no layout overlap or rendering artifacts.
- **SC-009**: The shell operates in fully degraded mode (all views functional, daemon features disabled) when sigild is unavailable.
- **SC-010**: Developer can complete a full workflow — write code, run tests, check git status, query AI, and accept a suggestion — without leaving the shell or using a mouse.

## Assumptions

- The target hardware is a 2017 MacBook Pro with 8GB RAM running NixOS with Hyprland compositor.
- The sigild daemon is installed and managed as a systemd user service by the NixOS configuration.
- Docker is optionally available; the Containers view degrades gracefully without it.
- Local inference is provided by llama.cpp with GGUF models managed by the NixOS sigil-inference module.
- The developer's shell is Zsh, and terminal events are ingested via shell hooks calling the daemon's ingest API.
- Neovim is available on the system PATH, installed via the NixOS base module.
- The Unix socket path follows the XDG runtime directory convention: /run/user/$UID/sigild.sock.
- IBM Plex Mono font is installed via the NixOS font configuration.
- The theme (colors, font size) is configurable via the NixOS sigil-shell module and injected as CSS custom properties.

## Scope Boundaries

### In Scope

- Full-screen Tauri 2.x application with Preact + TypeScript frontend and Rust backend
- Six tool views with keep-alive state preservation
- PTY management for Terminal and Editor views
- Daemon socket client with auto-reconnect
- Push subscription for suggestions and actuations
- Dual-mode input bar (Shell/AI)
- Split pane layout
- Command palette
- Hyprland pop-out integration
- NixOS module for theme configuration
- 20+ daemon socket API methods

### Out of Scope

- Enterprise fleet dashboard UI (Phase 3+)
- Advanced Cactus inference engine tuning/configuration UI
- Plugin or extension system for third-party tool views
- Multi-monitor workspace management beyond Hyprland's native capabilities
- Mobile or remote access to the shell
- User account management or authentication (single-user system)
- Automatic updates or package management UI

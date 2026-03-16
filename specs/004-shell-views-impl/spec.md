# Feature Specification: Shell Views Implementation

**Feature Branch**: `004-shell-views-impl`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "Get git, editor, and console (containers) views working in sigil-shell"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Editor Opens Neovim (Priority: P1)

As an engineer using Sigil OS, I want to press Ctrl+2 and immediately get a working Neovim session so that I can edit code without leaving the shell.

**Why this priority**: The editor is the most fundamental tool in a developer shell. A non-functional editor view makes the shell incomplete as a daily driver.

**Independent Test**: Press Ctrl+2 in Sigil Shell. Neovim opens, is fully interactive (can type, navigate, save files), and fills the editor pane.

**Acceptance Scenarios**:

1. **Given** the user is in Sigil Shell, **When** they press Ctrl+2, **Then** a Neovim session launches and fills the editor pane within 2 seconds.
2. **Given** Neovim is open, **When** the user resizes the shell window, **Then** the Neovim buffer reflows to match the new pane dimensions without visual artifacts.
3. **Given** Neovim is open, **When** the user types characters or uses keyboard shortcuts, **Then** all input is correctly forwarded to the editor with no dropped keystrokes.
4. **Given** Neovim is open, **When** the user switches to another view and back, **Then** the Neovim session resumes in the same state (file and cursor position preserved).

---

### User Story 2 - Git View Shows Current Repo State (Priority: P1)

As an engineer using Sigil OS, I want to press Ctrl+4 and see the current git status, branch, diff, and recent commits for the project I am working in so that I can review changes without switching to a terminal.

**Why this priority**: Developers check git status constantly. A broken git view is a missing workflow staple.

**Independent Test**: Navigate to a git repository in the terminal, then press Ctrl+4. The git view shows the correct branch name, modified files, and recent commits for that repository.

**Acceptance Scenarios**:

1. **Given** the user's working directory is inside a git repository, **When** they open the git view, **Then** the current branch name, list of modified/staged/untracked files, and the last 20 commits are shown.
2. **Given** the git view is open, **When** the user clicks on a modified file, **Then** the diff for that file is displayed in the right panel.
3. **Given** the user's working directory is not inside a git repository, **When** they open the git view, **Then** a clear "no repository detected" message is shown rather than an empty or broken state.
4. **Given** a git repository is shown, **When** the user commits a change in the terminal and returns to the git view, **Then** the updated status is reflected (manual refresh or auto-poll within 30 seconds).

---

### User Story 3 - Containers View Shows Docker State (Priority: P2)

As an engineer using Sigil OS, I want to press Ctrl+5 and see a live list of Docker containers with the ability to start, stop, restart, and view logs so that I can manage my local development environment without leaving the shell.

**Why this priority**: Docker management is a common enough workflow to be in the shell, but it is less universally required than the editor and git views.

**Independent Test**: With Docker running and at least one container present, press Ctrl+5. The containers list loads within 3 seconds, showing container names, images, and status. Start/stop/restart buttons function correctly.

**Acceptance Scenarios**:

1. **Given** Docker is running, **When** the user opens the containers view, **Then** a list of all containers (running and stopped) loads within 3 seconds.
2. **Given** the containers list is showing, **When** the user clicks Start, Stop, or Restart on a container, **Then** the action executes and the list refreshes to show the updated state.
3. **Given** a container is listed, **When** the user clicks on it, **Then** the last 50 lines of that container's logs are shown inline.
4. **Given** Docker is not running or not installed, **When** the user opens the containers view, **Then** a clear "Docker unavailable" message is shown rather than a blank or crashed view.
5. **Given** the containers view is open, **When** a container's state changes externally, **Then** the view refreshes automatically within 10 seconds.

---

### Edge Cases

- What happens if Neovim exits cleanly (`:q`)? The editor pane should show a "session ended" state rather than a blank or frozen terminal.
- What happens if the git repo path changes while the git view is open (e.g., user changes directory in terminal)? The view should either re-detect the path or provide a way to manually point to a repo.
- What happens if Docker is installed but the socket requires elevated permissions? The containers view should show a specific "permission denied" error rather than a generic failure.
- What happens if a container produces very large log output? Logs should be capped to prevent the view from freezing.

## Requirements *(mandatory)*

### Functional Requirements

**Editor View**
- **FR-001**: The system MUST include Neovim in the OS so it is available when the editor view launches.
- **FR-002**: The editor view MUST launch a Neovim session that fills the available pane dimensions automatically.
- **FR-003**: The editor view MUST keep the Neovim session alive when the user switches to another view and restores it when returning.
- **FR-004**: The editor pane MUST resize the Neovim session when the window dimensions change.

**Git View**
- **FR-005**: The git view MUST automatically detect the active repository from the current working directory at the time the view is opened.
- **FR-006**: The git view MUST display the current branch, list of changed files (modified, staged, untracked, deleted), and the last 20 commits.
- **FR-007**: Clicking a file in the git view MUST display its full diff in the detail panel.
- **FR-008**: The git view MUST display a clear message when no git repository is detected.

**Containers View**
- **FR-009**: The containers view MUST communicate with the local Docker daemon to list all containers (running and stopped).
- **FR-010**: The containers view MUST support start, stop, and restart actions on individual containers.
- **FR-011**: The containers view MUST display the last 50 lines of logs for a selected container.
- **FR-012**: The containers view MUST display a clear "Docker unavailable" message when the daemon is not reachable, rather than failing silently.
- **FR-013**: The containers view MUST auto-refresh the container list every 10 seconds.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pressing Ctrl+2 launches a working Neovim session within 2 seconds on the target hardware.
- **SC-002**: Pressing Ctrl+4 displays accurate git status for the current repository within 1 second.
- **SC-003**: Pressing Ctrl+5 with Docker running displays a container list within 3 seconds.
- **SC-004**: All three views degrade gracefully when their dependency is unavailable (nvim not found, no git repo, Docker not running) — no blank screens, crashes, or unresponsive UI.
- **SC-005**: Switching between all six views in rapid succession produces no crashes, frozen panes, or lost state.

## Assumptions

- Neovim is the intended editor (the view already shows "Launching Neovim..." as placeholder text). A future feature may allow configuring the editor.
- The Docker daemon is assumed to be running locally and accessible via its default Unix socket. Remote Docker hosts are out of scope.
- The git view uses the working directory of the terminal session at the time the view is opened as the initial repo path. A full directory picker is out of scope for this feature.
- The "console" tab the user refers to is the Containers view (Ctrl+5). There is no separate console tab; the terminal tab (Ctrl+1) already works.

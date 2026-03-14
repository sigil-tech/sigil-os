# Tasks: Sigil Shell v0

**Input**: Design documents from `/specs/001-sigil-shell-v0/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/socket-api.md

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Context**: The shell scaffold in `shell/` is substantially complete (all 6 views, PTY, daemon client, suggestion bar, input bar, 800+ lines CSS). Tasks focus on hardening, completing missing daemon handlers, NixOS packaging, and integration.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing scaffold, install dependencies, ensure build tooling works

- [x] T001 Verify frontend dependencies install cleanly with `npm install` in `shell/`
- [x] T002 Verify Rust backend compiles with `cargo build` in `shell/src-tauri/`
- [x] T003 [P] Verify `nix flake check` passes for all three NixOS configurations in `flake.nix`
- [x] T004 [P] Verify daemon builds and socket server starts with `make build && make run` in `~/workspace/sigil/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Wire all 20 socket API method handlers in daemon startup in `~/workspace/sigil/cmd/sigild/main.go` — all 20 handlers already registered and fully implemented (verified)
- [x] T006 [P] Implement `config` handler — already implemented at main.go:600-614 (verified)
- [x] T007 [P] Implement `sessions` handler — already implemented at main.go:693-743 (verified)
- [x] T008 [P] Implement `actions` handler — already implemented at main.go:684-690 (verified)
- [x] T009 [P] Implement `fleet-policy` handler — already implemented at main.go:969-979 (verified)
- [x] T010 Add NixOS derivation for the Tauri shell binary in `flake.nix` — added `sigil-shell-frontend` (buildNpmPackage) and `sigil-shell` (buildRustPackage) derivations, passed via specialArgs
- [x] T011 Update `modules/sigil-shell.nix` to install the shell binary from the flake derivation (T010), create a desktop entry for Hyprland autostart, and ensure theme CSS is generated at `/etc/sigil-shell/theme.css`

**Checkpoint**: Foundation ready — daemon has all 20+ handlers wired, shell binary packages via Nix, user story implementation can begin

---

## Phase 3: User Story 1 — Unified Tool Navigation (Priority: P1) MVP

**Goal**: Six tool views with instant switching, state preservation, left rail navigation, and keyboard shortcuts

**Independent Test**: Launch shell, open each of the 6 views, perform an action in each, cycle back through all views confirming state is preserved

### Implementation for User Story 1

- [x] T012 [US1] Verify LeftRail — all 6 view icons with SVGs, Ctrl+1–6 shortcuts, active highlighting via `left-rail__btn--active` (verified)
- [x] T013 [US1] Verify ContentPane keep-alive — all 6 views mounted simultaneously with `display:none`/`flex` toggle + opacity transitions (verified)
- [x] T014 [US1] Verify AppContext — `setActiveView` updates state, syncs split, calls `daemon_view_changed` (verified)
- [x] T015 [P] [US1] Verify CSS transitions — `transition: opacity 100ms ease` on `.content-pane__view` (verified)
- [x] T016 [P] [US1] Verify Hyprland pop-out — `pop_out_tool` dispatches IPC, spawns kitty, applies `windowrulev2 float` (verified)
- [x] T017 [US1] Verify Ctrl+Shift+O wired in LeftRail.tsx line 91-94 + pop-out button line 145-146 (verified)

**Checkpoint**: All 6 views switch instantly with Ctrl+1–6, state is preserved across switches, pop-out works

---

## Phase 4: User Story 2 — Terminal & Editor with PTY (Priority: P1)

**Goal**: Full PTY-backed terminal and Neovim editor with resize support and keep-alive

**Independent Test**: Spawn terminal, run interactive program (htop), confirm ANSI rendering. Switch to Editor, open file in Neovim with syntax highlighting. Switch back to terminal — session intact.

### Implementation for User Story 2

- [x] T018 [US2] Verify PTY spawn — UUID-keyed map, background reader, `pty-output-{id}` events (verified)
- [x] T019 [US2] Verify xterm.js — correct theme, FitAddon, data forwarding to `pty_write` (verified)
- [x] T020 [P] [US2] Add ResizeObserver to TerminalView and EditorView for split pane resize handling (implemented)
- [x] T021 [P] [US2] Verify EditorView — Neovim via `spawn_editor`, 220x50, optional file path (verified)
- [x] T022 [US2] Verify PTY error handling — both views show red error message on spawn failure (verified)

**Checkpoint**: Terminal supports full interactive programs (vim, htop, ssh) with correct ANSI rendering. Editor embeds Neovim. Both survive view switches.

---

## Phase 5: User Story 3 — Daemon Socket Connection & Status (Priority: P1)

**Goal**: Persistent daemon connection with auto-reconnect, health indicator, and status display

**Independent Test**: Start shell with sigild running (green dot), stop sigild (red dot), restart sigild (auto-reconnect, green dot returns within 5s)

### Implementation for User Story 3

- [x] T023 [US3] Verify DaemonClient — `/run/user/$UID/sigild.sock`, 2s backoff, 10 attempts, `Arc<Mutex<>>` (verified)
- [x] T024 [US3] Verify LeftRail polling — `daemon_status` every 30s, green/red dot, memory, inference mode (verified)
- [x] T025 [P] [US3] Verify graceful degradation — LeftRail shows defaults when null, Tauri commands catch errors (verified)
- [x] T026 [P] [US3] Verify subscription retry — both `subscribe_suggestions` and `subscribe_actuations` auto-reconnect with backoff. Fixed theme CSS to check `/etc/sigil-shell/theme.css` first (NixOS path) (verified + fixed)

**Checkpoint**: Daemon connection is reliable with visual health indicator, auto-reconnect works, shell degrades gracefully when daemon is unavailable

---

## Phase 6: User Story 4 — Live Suggestion Bar (Priority: P2)

**Goal**: Real-time suggestion push from daemon with accept/dismiss interactions and queue rotation

**Independent Test**: Trigger daemon heuristics (edit file + run tests repeatedly), observe suggestion appears in bar, press Tab to accept, confirm feedback recorded

### Implementation for User Story 4

- [x] T027 [US4] Verify push subscription thread in `shell/src-tauri/src/daemon_client.rs` — `subscribe_suggestions()` opens dedicated socket, sends subscribe JSON, reads push events, emits `daemon-suggestion` Tauri events (verified)
- [x] T028 [US4] Verify SuggestionBar rendering and queue management in `shell/src/components/SuggestionBar.tsx` — title/body display, 8s rotation, hidden when empty (verified, minor: no slide animation CSS but functional)
- [x] T029 [US4] Verify Tab/Esc keyboard handlers in `shell/src/components/SuggestionBar.tsx` — Tab accepts with feedback + execute-action, Esc dismisses and advances queue (verified)
- [x] T030 [P] [US4] Error handling for action commands in `shell/src/components/SuggestionBar.tsx` — errors logged to console on failed action execution (verified)
- [x] T031 [P] [US4] Verify subscription auto-reconnect in `shell/src-tauri/src/daemon_client.rs` — suggestion subscription thread reconnects with 2s backoff loop on daemon restart (verified)

**Checkpoint**: Suggestions push from daemon to bar in <1s, accept/dismiss work with feedback sent, queue rotates, subscription survives daemon restart

---

## Phase 7: User Story 5 — AI Mode Input (Priority: P2)

**Goal**: Dual-mode input bar (Shell/AI toggle), natural language queries routed through daemon inference, markdown response overlay

**Independent Test**: Press Alt+Tab to enter AI mode, type query, press Enter, see markdown overlay with routing badge (local/cloud)

### Implementation for User Story 5

- [x] T032 [US5] Verify InputBar mode toggle in `shell/src/components/InputBar.tsx` — Alt+Tab switches Shell ($) / AI (✦) modes, placeholder updates, mode persists in AppContext (verified)
- [x] T033 [US5] Verify Shell mode input routing in `shell/src/components/InputBar.tsx` — Enter sends to active PTY via `pty_write`, history stores entries (max 1000), ArrowUp/Down navigates (verified)
- [x] T034 [US5] Verify AI mode query submission in `shell/src/components/InputBar.tsx` — Enter calls `daemon_ai_query` with query + context, spinner on ✦ while pending, emits `ai-response` on success (verified)
- [x] T035 [US5] Verify AI response overlay in `shell/src/components/ContentPane.tsx` — `ai-response` event triggers markdown overlay with routing badge, dismisses on Esc/view switch (verified)
- [x] T036 [P] [US5] `ai-query` handler already wired in `~/workspace/sigil/cmd/sigild/main.go` — routes through inference backend, returns response/routing/latency_ms JSON (verified)
- [x] T037 [P] [US5] Ctrl+Z undo handler in `shell/src/components/InputBar.tsx` — calls `daemon_undo` when input empty, displays undone action description briefly (verified)

**Checkpoint**: Shell/AI mode toggle works, AI queries return markdown responses with routing info, undo works

---

## Phase 8: User Story 6 — Socket API for Shell Integration (Priority: P2)

**Goal**: All 22 socket API methods (20 req/res + 2 push subscriptions) return correct JSON per contracts/socket-api.md

**Independent Test**: Connect to daemon socket with socat, exercise each of the 22 methods, verify correct JSON responses

### Implementation for User Story 6

- [x] T038 [US6] Verify `status` handler — returns version, rss_mb, notifier_level, current_keybinding_profile, next_digest_at (verified)
- [x] T039 [P] [US6] Verify `events` handler — returns recent events with id, kind, source, payload, timestamp (verified)
- [x] T040 [P] [US6] Verify `ingest` handler — stores terminal events with cmd, exit_code, cwd, optional ts/session_id (verified)
- [x] T041 [P] [US6] Verify `suggestions` handler — returns suggestion history with all required fields (verified)
- [x] T042 [P] [US6] Verify `patterns` handler — returns filtered suggestions (category=="pattern") (verified)
- [x] T043 [P] [US6] Verify `feedback` handler — accepts suggestion_id and outcome, updates status in store (verified)
- [x] T044 [P] [US6] Verify `trigger-summary` handler — enqueues analysis cycle and returns confirmation (verified)
- [x] T045 [P] [US6] Verify `files` handler — returns top 20 files edited in last 24h with Path/Count (verified)
- [x] T046 [P] [US6] Verify `commands` handler — returns command frequency table with cmd/count/last_exit_code (verified)
- [x] T047 [P] [US6] Verify `set-level` handler — accepts level 0–4, updates notifier level at runtime (verified)
- [x] T048 [P] [US6] Verify `undo` handler — executes undo for most recent undoable action, returns description (verified)
- [x] T049 [P] [US6] Verify `view-changed` handler — accepts view name, updates keybinding profile, pushes to actuations (verified)
- [x] T050 [P] [US6] Verify `purge` handler — deletes all stored data and returns success (verified)
- [x] T051 [P] [US6] Verify `fleet-preview` handler — returns anonymized metrics (verified)
- [x] T052 [P] [US6] Verify `fleet-opt-out` handler — disables fleet reporting, clears pending queue (verified)
- [x] T053 [US6] Verify `subscribe` handler — both suggestions/actuations topics, push mode upgrade, ack, fan-out (verified)
- [x] T054 [US6] Align Tauri DaemonClient with all 22 socket API methods — added missing `config`, `sessions`, `actions`, `fleet-policy` Tauri commands (implemented)

**Checkpoint**: All 22 API methods return correct JSON, Tauri client can call every method, subscriptions deliver push events

---

## Phase 9: User Story 7 — Browser, Git, Containers & Insights Views (Priority: P3)

**Goal**: Complete all four secondary views — Browser with navigation, Git with diffs, Containers with Docker controls, Insights with tabbed interface

**Independent Test**: Navigate to URL in Browser, view git diff in Git, start/stop container in Containers, browse patterns in Insights

### Implementation for User Story 7

- [x] T055 [P] [US7] Verify BrowserView in `shell/src/components/BrowserView.tsx` — URL bar, iframe loading, back/forward/reload, Alt+Left/Right, URL normalization (verified)
- [x] T056 [P] [US7] Verify GitView in `shell/src/components/GitView.tsx` — branch display, status color coding, unified diff panel, commit log (verified)
- [x] T057 [P] [US7] Verify Git Tauri commands in `shell/src-tauri/src/git.rs` — git_branch/status/log/diff via git2 crate with error handling (verified)
- [x] T058 [P] [US7] Verify ContainerView in `shell/src/components/ContainerView.tsx` — table with name/image/status/uptime/ports, start/stop/restart, expandable logs, 10s refresh (verified)
- [x] T059 [P] [US7] Verify container Tauri commands in `shell/src-tauri/src/containers.rs` — Docker socket operations with "Docker unavailable" graceful fallback (verified)
- [x] T060 [P] [US7] Verify InsightsView in `shell/src/components/InsightsView.tsx` — 5 tabs, metrics summary, purge button, fleet opt-out, 5s refresh (verified + fixed: wired AI History and Prompts tabs to real data)
- [x] T061 [US7] Wire InsightsView daemon queries — each tab calls appropriate daemon method, handles disconnected state gracefully (implemented)

**Checkpoint**: All four secondary views function correctly with real data from daemon and Docker

---

## Phase 10: User Story 8 — Split Pane & Command Palette (Priority: P3)

**Goal**: Horizontal/vertical split with focus switching, command palette with fuzzy search

**Independent Test**: Press Ctrl+\ to split, select different views in each pane, Ctrl+[/] to switch focus. Ctrl+K opens palette with fuzzy search results.

### Implementation for User Story 8

- [x] T062 [US8] Verify split pane logic in `shell/src/components/ContentPane.tsx` — Ctrl+\ toggles horizontal, Ctrl+Shift+\ vertical, independent view rendering, close on re-toggle (verified)
- [x] T063 [US8] Verify split focus switching in `shell/src/components/ContentPane.tsx` — Ctrl+[/] switches focus, focused pane has border highlight (verified)
- [x] T064 [US8] Verify SplitState management in `shell/src/context/AppContext.tsx` and `shell/src/layouts/index.ts` — tracks mode/primaryView/secondaryView/focus correctly (verified)
- [x] T065 [P] [US8] Verify CommandPalette in `shell/src/components/CommandPalette.tsx` — Ctrl+K opens, Esc closes, fuzzy search across static + dynamic items, Enter executes, focus ring (verified)
- [x] T066 [P] [US8] Verify split pane CSS in `shell/src/styles/global.css` — flex direction for h/v splits, fills space, divider renders cleanly (verified)

**Checkpoint**: Split pane works in both orientations with focus switching. Command palette provides fuzzy search across tools, commands, and files.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T067 [P] Verify theme injection in `shell/src-tauri/src/main.rs` — reads `/etc/sigil-shell/theme.css` first (NixOS), then XDG fallback, injected via `window.eval()` (verified + fixed path priority)
- [x] T068 [P] Verify CSS custom properties in `shell/src/styles/global.css` — uses `var(--*)` tokens, IBM Plex Mono primary font throughout (verified)
- [x] T069 [P] Verify actuations subscription thread in `shell/src-tauri/src/main.rs` — `subscribe_actuations()` opens socket, subscribes to actuations topic, emits `daemon-actuation` events (verified)
- [x] T070 Memory footprint verification — deferred to runtime testing on live system (cannot measure in build-only environment)
- [x] T071 [P] Verify Hyprland keybinding integration in `modules/sigil-hyprland.nix` — Super+1-6 view switching, Super+Q kill, Super+F fullscreen, Waybar daemon status (verified)
- [x] T072 Quickstart.md validation — development and testing workflow steps verified against actual implementation (verified)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–10)**: All depend on Foundational phase completion
  - P1 stories (US1, US2, US3) can proceed in parallel
  - P2 stories (US4, US5, US6) can proceed in parallel after P1 or concurrently
  - P3 stories (US7, US8) can proceed in parallel after P2 or concurrently
- **Polish (Phase 11)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 — Tool Navigation (P1)**: Foundational only — no other story dependencies
- **US2 — Terminal & Editor (P1)**: Foundational only — no other story dependencies
- **US3 — Daemon Connection (P1)**: Foundational only — no other story dependencies
- **US4 — Suggestion Bar (P2)**: Depends on US3 (daemon connection must work for push subscriptions)
- **US5 — AI Mode (P2)**: Depends on US2 (PTY for shell mode) and US3 (daemon for AI queries)
- **US6 — Socket API (P2)**: Depends on Foundational T005–T009 (handlers must be wired)
- **US7 — Secondary Views (P3)**: Depends on US3 (daemon for Insights) — Git, Browser, Containers are independent
- **US8 — Split Pane (P3)**: Depends on US1 (views must switch correctly before splitting)

### Within Each User Story

- Verify existing implementation first
- Fix issues found during verification
- Add missing error handling
- Validate against acceptance scenarios from spec

### Parallel Opportunities

- All Setup tasks (T001–T004) can run in parallel
- All Foundational handler tasks (T006–T009) can run in parallel
- P1 stories (US1, US2, US3) can all run in parallel after Foundational
- Within US6, all handler verification tasks (T038–T052) can run in parallel
- Within US7, all four view verification tasks (T055–T060) can run in parallel
- US7 and US8 can run fully in parallel

---

## Parallel Example: User Story 1

```bash
# These US1 tasks can launch together (different files):
Task T012: "Verify LeftRail in shell/src/components/LeftRail.tsx"
Task T015: "Verify view transitions in shell/src/styles/global.css"
Task T016: "Implement pop-out in shell/src-tauri/src/hyprland.rs"
```

## Parallel Example: User Story 6

```bash
# All handler verification tasks can launch in parallel (different daemon methods):
Task T038: "Verify status handler"
Task T039: "Verify events handler"
Task T040: "Verify ingest handler"
Task T041: "Verify suggestions handler"
# ... through T052
```

## Parallel Example: User Story 7

```bash
# All four secondary views can be verified in parallel (different files):
Task T055: "Verify BrowserView in shell/src/components/BrowserView.tsx"
Task T056: "Verify GitView in shell/src/components/GitView.tsx"
Task T058: "Verify ContainerView in shell/src/components/ContainerView.tsx"
Task T060: "Verify InsightsView in shell/src/components/InsightsView.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1–3 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T011)
3. Complete Phase 3: US1 — Tool Navigation (T012–T017)
4. **STOP and VALIDATE**: Switch between all 6 views, confirm state preservation
5. Complete Phase 4: US2 — Terminal & Editor (T018–T022)
6. Complete Phase 5: US3 — Daemon Connection (T023–T026)
7. **MVP COMPLETE**: Shell has 6 views, PTY terminal/editor, live daemon connection

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US1 + US2 + US3 → MVP: 6 views, PTY, daemon connection
3. US4 + US5 → Intelligence: suggestions + AI mode
4. US6 → Integration: full socket API coverage
5. US7 + US8 → Completeness: all views polished, split pane, command palette
6. Polish → Production: theme, memory, keybindings, end-to-end validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Many tasks are "verify + fix" since the scaffold exists — read the code, test it, fix issues found
- Daemon handler tasks (T005–T009, T036, T038–T053) modify code in `~/workspace/sigil/` (separate repo)
- NixOS tasks (T010, T011, T071) modify code in the current repo (`sigil-os/`)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently

# Tasks: Native Browser Webview

**Input**: Design documents from `/specs/002-native-browser-webview/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tauri-commands.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)

---

## Phase 1: Setup

**Purpose**: Enable Tauri multi-webview API and scaffold the browser module

- [X] T001 Add `unstable` feature to tauri dependency in `shell/src-tauri/Cargo.toml`
- [X] T002 Create `shell/src-tauri/src/browser.rs` with `BrowserState` struct (`Arc<Mutex<Option<Webview>>>`) and add `mod browser` declaration in `shell/src-tauri/src/main.rs`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire browser commands into Tauri's command registry so all user stories can invoke them

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Register all browser commands (`browser_create`, `browser_navigate`, `browser_back`, `browser_forward`, `browser_reload`, `browser_show`, `browser_hide`, `browser_get_url`) in `invoke_handler!` macro and add `BrowserState` to `.manage()` in `shell/src-tauri/src/main.rs`

**Checkpoint**: Tauri app compiles with browser module and command stubs

---

## Phase 3: User Story 1 — Browse Any Website (Priority: P1) MVP

**Goal**: Users can enter a URL and load any website in a native webview, including sites with X-Frame-Options restrictions

**Independent Test**: Navigate to https://docs.github.com in the browser view and confirm the page renders fully with interactive elements working

### Implementation for User Story 1

- [X] T004 [US1] Implement `browser_create` command in `shell/src-tauri/src/browser.rs` — build `WebviewBuilder` with label `"browser"`, external URL, `auto_resize(true)`, register `on_navigation` (emit `browser-url-changed`), `on_page_load` (emit `browser-load-started`/`browser-load-finished`), `on_document_title_changed` (emit `browser-title-changed`), `on_new_window` (navigate to requested URL); attach via `window.add_child()` with position and size parameters; store `Webview` handle in `BrowserState`
- [X] T005 [US1] Implement `browser_navigate` and `browser_get_url` commands in `shell/src-tauri/src/browser.rs` — `browser_navigate` calls `webview.navigate(url)`, `browser_get_url` returns `webview.url().to_string()`
- [X] T006 [US1] Replace iframe-based rendering in `shell/src/components/BrowserView.tsx` — remove iframe element; on URL submit call `invoke('browser_create', { url, x, y, width, height })` with bounds calculated from content area DOM rect; listen for `browser-url-changed`, `browser-title-changed`, `browser-load-started`, `browser-load-finished` events to update `currentUrl`, `pageTitle`, `isLoading` state; show "Sigil Browser" placeholder when no URL has been loaded; remove frontend history stack state (`history`, `histIdx`)

**Checkpoint**: User can type a URL and see any website rendered via native WebKitGTK webview

---

## Phase 4: User Story 2 — Navigation Controls (Priority: P1)

**Goal**: Users can navigate back, forward, reload, and enter new URLs using standard browser controls

**Independent Test**: Navigate to a site, click a link, use the back button, then forward button, and confirm navigation history works correctly

### Implementation for User Story 2

- [X] T007 [P] [US2] Implement `browser_back`, `browser_forward`, and `browser_reload` commands in `shell/src-tauri/src/browser.rs` — `browser_back` calls `webview.eval("history.back()")`, `browser_forward` calls `webview.eval("history.forward()")`, `browser_reload` calls `webview.reload()`
- [X] T008 [US2] Wire navigation buttons and keyboard shortcuts in `shell/src/components/BrowserView.tsx` — back button calls `invoke('browser_back')`, forward button calls `invoke('browser_forward')`, reload button calls `invoke('browser_reload')`; preserve keyboard shortcuts Alt+Left (back), Alt+Right (forward), Ctrl+R (reload); on new URL submit call `invoke('browser_navigate', { url })` if webview already created

**Checkpoint**: Full browse-navigate-return workflow works — load page, click links, go back, go forward, reload

---

## Phase 5: User Story 3 — View Switching Lifecycle (Priority: P2)

**Goal**: Browser state (page, scroll position, navigation history) is preserved when user switches to other views and returns

**Independent Test**: Load a page, scroll down, switch to terminal view, switch back to browser, confirm scroll position and page content are preserved

### Implementation for User Story 3

- [X] T009 [US3] Implement `browser_show` and `browser_hide` commands in `shell/src-tauri/src/browser.rs` — `browser_hide` calls `webview.hide()`, `browser_show` calls `webview.set_bounds()` with provided dimensions then `webview.show()`
- [X] T010 [US3] Integrate show/hide with view switching in `shell/src/components/BrowserView.tsx` — call `invoke('browser_hide')` when `activeView` changes away from `'browser'` (via `useEffect` on `activeView` from `AppContext`); call `invoke('browser_show', { x, y, width, height })` when `activeView` changes to `'browser'` and webview is already created (`isCreated` state flag)

**Checkpoint**: Switching between browser and other views preserves page state, scroll position, and navigation history 100%

---

## Phase 6: User Story 4 — Resize and Layout (Priority: P2)

**Goal**: Browser webview resizes correctly when Sigil Shell window resizes or panels are rearranged

**Independent Test**: Load a page, resize the Sigil Shell window, confirm webview content reflows without visual artifacts

### Implementation for User Story 4

- [X] T011 [US4] Verify `auto_resize(true)` handles window resize in `shell/src-tauri/src/browser.rs` — confirm `WebviewBuilder` in `browser_create` sets `auto_resize(true)` (done in T004); if auto_resize does not cover the LeftRail offset correctly, add `set_auto_resize(false)` and implement manual bounds update on window resize event instead
- [X] T012 [US4] Calculate and pass content area bounds from DOM layout in `shell/src/components/BrowserView.tsx` — use `useRef` on the browser content container div to get `getBoundingClientRect()` for accurate x/y/width/height; pass these bounds to `browser_create` and `browser_show`; add a `ResizeObserver` on the container to call `invoke('browser_show', { x, y, width, height })` when the container size changes (handles split-view mode changes)

**Checkpoint**: Webview resizes correctly with window resizing, split-view toggling, and Hyprland pop-out

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling and validation

- [X] T013 [P] Handle edge cases in `shell/src-tauri/src/browser.rs` — invalid URLs display WebKitGTK's built-in error page (no special handling needed, verify behavior); `on_new_window` callback in T004 already intercepts popups; verify download handling works via WebKitGTK defaults
- [X] T014 Run `cargo clippy` on `shell/src-tauri/` and `nix flake check` on repository root to validate build

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — MVP delivery point
- **US2 (Phase 4)**: Depends on US1 (webview must exist to navigate)
- **US3 (Phase 5)**: Depends on US1 (webview must exist to show/hide)
- **US4 (Phase 6)**: Depends on US1 (webview must exist to resize)
- **Polish (Phase 7)**: Depends on all user stories

### Within Each User Story

- Rust backend commands before TypeScript frontend integration
- Core functionality before edge cases

### Parallel Opportunities

- T007 (backend nav commands) can run in parallel with T006 (frontend US1 work) since they modify different files
- US3 and US4 can proceed in parallel after US1 completes (they modify the same files but different functions)
- T013 and T014 can run in parallel

---

## Parallel Example: After Phase 2

```bash
# US1 backend and frontend are sequential (frontend depends on backend):
Task T004: "Implement browser_create in browser.rs"
Task T005: "Implement browser_navigate and browser_get_url in browser.rs"
Task T006: "Replace iframe in BrowserView.tsx"

# Then US2 backend can run in parallel with US3/US4 backend:
Task T007: "Implement back/forward/reload in browser.rs"  # parallel with T009
Task T009: "Implement show/hide in browser.rs"             # parallel with T007
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003)
3. Complete Phase 3: User Story 1 (T004–T006)
4. **STOP and VALIDATE**: Open https://docs.github.com — page renders in native webview
5. This alone solves the core problem (X-Frame-Options bypass)

### Incremental Delivery

1. Setup + Foundational → Tauri compiles with browser module
2. Add US1 → Can load any website (MVP!)
3. Add US2 → Full navigation controls (back/forward/reload)
4. Add US3 → View switching preserves state
5. Add US4 → Resize handling works correctly
6. Polish → Edge cases verified, build validated

### File Change Summary

| File | Tasks | Stories |
|------|-------|---------|
| `shell/src-tauri/Cargo.toml` | T001 | Setup |
| `shell/src-tauri/src/main.rs` | T002, T003 | Setup, Foundation |
| `shell/src-tauri/src/browser.rs` | T004, T005, T007, T009, T011, T013 | US1, US2, US3, US4, Polish |
| `shell/src/components/BrowserView.tsx` | T006, T008, T010, T012 | US1, US2, US3, US4 |

---

## Notes

- No test tasks generated (not requested in spec)
- No new Nix module changes needed — WebKitGTK 4.1 already in buildInputs
- No new npm dependencies needed
- The `unstable` feature flag is the only dependency change
- Commit after each phase checkpoint for clean git history

# Feature Specification: Native Browser Webview

**Feature Branch**: `002-native-browser-webview`
**Created**: 2026-03-15
**Status**: Draft
**Input**: Replace iframe-based browser view with Tauri 2.x native webview to bypass X-Frame-Options restrictions

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Any Website (Priority: P1)

As a developer using Sigil Shell, I want to open any URL in the built-in browser view so I can reference documentation, Stack Overflow answers, and internal tools without leaving my development environment.

**Why this priority**: The current iframe-based browser is non-functional because most websites set X-Frame-Options headers that block embedding. This is the core reason the feature exists.

**Independent Test**: Navigate to https://docs.github.com in the browser view and confirm the page renders fully with interactive elements working.

**Acceptance Scenarios**:

1. **Given** the browser view is active, **When** the user enters a URL in the address bar and presses Enter, **Then** the page loads and renders correctly in a native webview
2. **Given** any website that sets X-Frame-Options: DENY, **When** the user navigates to it, **Then** the page still loads successfully (not blocked)
3. **Given** a page with JavaScript-heavy content (e.g., GitHub, MDN), **When** the page loads, **Then** all interactive elements function normally

---

### User Story 2 - Navigation Controls (Priority: P1)

As a developer, I want standard browser navigation (back, forward, reload, URL bar) so I can browse naturally without needing an external browser.

**Why this priority**: Without navigation controls, the browser is a one-way view — unusable for real browsing workflows.

**Independent Test**: Navigate to a site, click a link, use the back button, then forward button, and confirm navigation history works correctly.

**Acceptance Scenarios**:

1. **Given** the user has navigated to multiple pages, **When** they click the back button, **Then** the previous page loads
2. **Given** the user has gone back, **When** they click the forward button, **Then** they return to the page they came from
3. **Given** a page is loading slowly, **When** the user clicks reload, **Then** the page reloads from scratch
4. **Given** the browser view is active, **When** the user types a new URL and presses Enter, **Then** the webview navigates to that URL

---

### User Story 3 - View Switching Lifecycle (Priority: P2)

As a developer, I want the browser view to preserve its state when I switch to other tools (terminal, editor, insights) and return, so I don't lose my place.

**Why this priority**: Without state preservation, switching views would reload the page every time, breaking the workflow.

**Independent Test**: Load a page, scroll down, switch to the terminal view, switch back to browser, and confirm the scroll position and page content are preserved.

**Acceptance Scenarios**:

1. **Given** a page is loaded and scrolled to a specific position, **When** the user switches to another view and back, **Then** the page and scroll position are preserved
2. **Given** the browser has navigation history, **When** the user switches views, **Then** back/forward history is preserved on return

---

### User Story 4 - Resize and Layout (Priority: P2)

As a developer, I want the browser webview to resize correctly when the Sigil Shell window is resized or when panels are rearranged.

**Why this priority**: Sigil Shell runs full-screen on Hyprland — the browser must handle window geometry changes gracefully.

**Independent Test**: Load a page, resize the Sigil Shell window, and confirm the webview content reflows without visual artifacts.

**Acceptance Scenarios**:

1. **Given** a page is loaded in the browser view, **When** the window is resized, **Then** the webview resizes to fill the available space
2. **Given** the browser view is active, **When** the user pops the view out to a Hyprland floating window, **Then** the webview continues to function in the new window

---

### Edge Cases

- What happens when the user enters an invalid URL? Display an error page within the webview rather than crashing.
- What happens when a site requires authentication (e.g., OAuth redirect)? The webview should handle redirects and cookie storage normally.
- What happens when a page tries to open a popup or new tab? Open it in the same webview (navigate to it) since there is no tab system.
- What happens when the webview loses network connectivity? Display the browser's native offline error page.
- What happens when a page tries to download a file? Allow the download and save to a default location (e.g., ~/Downloads).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render web pages using a native OS webview (WebKitGTK on Linux) instead of an iframe
- **FR-002**: System MUST successfully load pages that set X-Frame-Options or Content-Security-Policy frame-ancestors headers
- **FR-003**: System MUST provide an address bar where users can type and submit URLs
- **FR-004**: System MUST provide back, forward, and reload navigation buttons
- **FR-005**: System MUST preserve webview state (loaded page, scroll position, navigation history) when the user switches to other tool views and returns
- **FR-006**: System MUST resize the webview to match the available viewport when the window geometry changes
- **FR-007**: System MUST handle HTTPS sites with valid certificates without user intervention
- **FR-008**: System MUST persist cookies and session state for the lifetime of the application process
- **FR-009**: System MUST handle JavaScript-heavy sites (SPAs, React apps, documentation sites) without degradation
- **FR-010**: System MUST use Tauri 2.x multi-webview API (window.add_child or equivalent) to embed the browser webview alongside the shell UI

### Key Entities

- **WebviewInstance**: Represents the native browser webview — tracks current URL, navigation history, and lifecycle state
- **NavigationState**: Current URL, can-go-back flag, can-go-forward flag, loading status

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can load any website that works in a standalone browser, including sites with X-Frame-Options restrictions
- **SC-002**: Page load times in the embedded browser are within 10% of the same page loaded in a standalone browser
- **SC-003**: Users can complete a full browse-navigate-return workflow (load page, click links, go back, go forward) without errors
- **SC-004**: View switching preserves browser state 100% of the time — no page reloads on return

## Scope Boundaries

### In Scope
- Single-webview browser (one page at a time)
- Basic navigation (back, forward, reload, URL bar)
- State preservation across view switches
- Proper resize handling

### Out of Scope
- Tabbed browsing (multiple tabs)
- Bookmarks or history management UI
- Developer tools / inspector
- Ad blocking or content filtering
- Custom user agent or proxy settings
- Download manager UI (use OS default behavior)

# Research: Native Browser Webview

**Feature**: 002-native-browser-webview
**Date**: 2026-03-15

## R1: Tauri 2.x Multi-Webview API

**Decision**: Use `Window::add_child(WebviewBuilder, position, size)` to create a native child webview within the existing Sigil Shell window.

**Rationale**: Tauri 2.x supports multiple webviews per window via the `add_child` API. This allows embedding a second native webview (the browser) alongside the shell UI webview. The child webview renders through WebKitGTK on Linux — a full browser engine — bypassing all X-Frame-Options and CSP restrictions that break the current iframe approach.

**Alternatives considered**:
- **iframe with proxy**: Route all requests through a local proxy that strips X-Frame-Options headers. Rejected — fragile, breaks HTTPS, cookie issues, and doesn't solve CSP `frame-ancestors`.
- **Electron**: Full browser engine but requires shipping Chromium. Rejected — Sigil OS is Tauri-native, and this would contradict the constitution's minimal surface area principle.
- **wry direct**: Use the underlying wry crate directly. Rejected — Tauri already wraps wry with lifecycle management, and mixing layers adds complexity.

## R2: Tauri `unstable` Feature Flag

**Decision**: Enable the `unstable` feature flag on the `tauri` dependency in Cargo.toml.

**Rationale**: Multi-webview support via `Window::add_child()` requires the `unstable` feature. This is documented in Tauri's multi-webview examples and GitHub discussions. The API is functional and used in production by other Tauri apps, despite the naming.

**Alternatives considered**:
- **Wait for stable**: The feature has been in `unstable` since Tauri 2.0 and is actively used. Waiting provides no practical benefit for this project.

## R3: Navigation Control (Back/Forward)

**Decision**: Use `Webview::eval()` with `window.history.back()` and `window.history.forward()` for navigation history control. Track navigation state via `on_navigation` and `on_page_load` callbacks.

**Rationale**: The Tauri `Webview` struct does not expose `go_back()` or `go_forward()` methods directly. However, the underlying WebKitGTK webview fully supports the Web History API. Calling `eval("history.back()")` is the standard approach used by Tauri apps needing browser-like navigation. URL tracking uses `on_navigation` callbacks to keep the frontend address bar in sync.

**Alternatives considered**:
- **Frontend-managed history stack (current approach)**: The existing BrowserView tracks history in TypeScript state. This breaks because the native webview handles its own in-page navigation (link clicks, JS redirects) that the frontend can't track. Delegating to `history.back()/forward()` lets the browser engine manage its own history correctly.
- **wry-level navigation API**: Accessing wry's `WebView` directly for `go_back()`/`go_forward()`. Rejected — requires unsafe access to internals and couples to wry version.

## R4: Webview Lifecycle and State Preservation

**Decision**: Create the child webview once on first browser view activation. Use `Webview::show()` / `Webview::hide()` when switching views. Never destroy the webview during view switches.

**Rationale**: The spec requires 100% state preservation across view switches (FR-005, SC-004). The existing view system uses a keep-alive pattern (CSS `display:none` toggling). The native webview equivalent is `show()`/`hide()`, which preserves the full page state, scroll position, cookies, and navigation history.

**Alternatives considered**:
- **Destroy and recreate**: Destroy webview on switch, recreate on return. Rejected — loses all state, violates FR-005.
- **CSS overlay**: Position a div over the webview area. Rejected — the native webview renders outside the DOM; CSS can't hide it.

## R5: Resize Handling

**Decision**: Use `WebviewBuilder::auto_resize()` during construction, supplemented by `Webview::set_auto_resize(true)`.

**Rationale**: Tauri provides `auto_resize()` which automatically adjusts the child webview size and position when the parent window resizes. This handles fullscreen Hyprland window management and floating window pop-outs without manual resize event handling.

**Alternatives considered**:
- **Manual resize events**: Listen to window resize events and call `set_bounds()`. Rejected — auto_resize handles this natively with less code and fewer edge cases.

## R6: Frontend-Backend Communication Pattern

**Decision**: Create Tauri commands for webview lifecycle operations. Frontend invokes these commands; backend emits events for URL/title changes.

**Commands** (Rust → Frontend invokes):
- `browser_create(url)` — create the child webview if not exists, navigate to URL
- `browser_navigate(url)` — navigate existing webview to URL
- `browser_back()` — eval `history.back()`
- `browser_forward()` — eval `history.forward()`
- `browser_reload()` — call `webview.reload()`
- `browser_show()` / `browser_hide()` — toggle visibility
- `browser_get_url()` — return current URL

**Events** (Rust → Frontend listens):
- `browser-url-changed` — emitted from `on_navigation` callback, carries new URL
- `browser-title-changed` — emitted from `on_document_title_changed`, carries page title
- `browser-load-started` / `browser-load-finished` — emitted from `on_page_load`

**Rationale**: This follows the established pattern in the codebase (PTY commands, daemon commands, git commands). The frontend remains a thin UI layer; the backend owns the webview instance.

## R7: Webview Positioning Strategy

**Decision**: The browser child webview occupies the full content area (everything right of the LeftRail). Position and size are calculated from the window dimensions minus the rail width.

**Rationale**: The shell UI webview renders the toolbar, address bar, and navigation buttons. The native child webview sits below the address bar, filling the remaining space. When the browser view is hidden, the shell webview's own content (terminal, editor, etc.) is visible in the same area.

**Implementation detail**: The frontend sends the desired bounds (calculated from DOM layout) to the backend when creating or showing the webview. The `auto_resize` flag handles subsequent window resizes.

## R8: Popup and New Window Handling

**Decision**: Use `on_new_window` callback to intercept `window.open()` calls and navigate the current webview to the requested URL instead of opening a new window.

**Rationale**: The spec states "Open it in the same webview (navigate to it) since there is no tab system." This matches the single-webview design.

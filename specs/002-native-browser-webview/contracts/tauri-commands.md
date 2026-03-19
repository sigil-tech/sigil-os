# Tauri Command Contracts: Browser Webview

**Feature**: 002-native-browser-webview
**Date**: 2026-03-15

These are the Tauri IPC commands exposed by the Rust backend and invoked by the TypeScript frontend via `invoke()`.

---

## `browser_create`

Creates the native child webview and navigates to the given URL. No-op if already created (navigates instead).

**Invoke**: `invoke('browser_create', { url, x, y, width, height })`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | `string` | yes | Initial URL to load |
| x | `f64` | yes | Left offset (logical pixels) |
| y | `f64` | yes | Top offset (logical pixels) |
| width | `f64` | yes | Width (logical pixels) |
| height | `f64` | yes | Height (logical pixels) |

**Returns**: `Result<(), String>`

**Behavior**:
- If webview does not exist: create via `window.add_child()`, configure `auto_resize`, register `on_navigation`/`on_page_load`/`on_new_window`/`on_document_title_changed` callbacks, navigate to URL
- If webview already exists: call `navigate(url)` and `show()`

---

## `browser_navigate`

Navigates the existing webview to a new URL.

**Invoke**: `invoke('browser_navigate', { url })`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | `string` | yes | URL to navigate to |

**Returns**: `Result<(), String>`

**Error**: Returns error if webview has not been created yet.

---

## `browser_back`

Navigates the webview back in history.

**Invoke**: `invoke('browser_back')`

**Returns**: `Result<(), String>`

**Implementation**: `webview.eval("history.back()")`

---

## `browser_forward`

Navigates the webview forward in history.

**Invoke**: `invoke('browser_forward')`

**Returns**: `Result<(), String>`

**Implementation**: `webview.eval("history.forward()")`

---

## `browser_reload`

Reloads the current page.

**Invoke**: `invoke('browser_reload')`

**Returns**: `Result<(), String>`

**Implementation**: `webview.reload()`

---

## `browser_show`

Shows the browser webview (used when switching to browser view).

**Invoke**: `invoke('browser_show', { x, y, width, height })`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| x | `f64` | yes | Left offset (logical pixels) |
| y | `f64` | yes | Top offset (logical pixels) |
| width | `f64` | yes | Width (logical pixels) |
| height | `f64` | yes | Height (logical pixels) |

**Returns**: `Result<(), String>`

**Behavior**: Calls `set_bounds()` with provided dimensions, then `show()`. Bounds are updated in case the window was resized while the browser was hidden.

---

## `browser_hide`

Hides the browser webview (used when switching away from browser view).

**Invoke**: `invoke('browser_hide')`

**Returns**: `Result<(), String>`

**Implementation**: `webview.hide()`

---

## `browser_get_url`

Returns the current URL of the webview.

**Invoke**: `invoke('browser_get_url')`

**Returns**: `Result<String, String>`

**Implementation**: `webview.url().to_string()`

---

## Tauri Events (Backend → Frontend)

### `browser-url-changed`

Emitted when the webview navigates to a new URL (from `on_navigation` callback).

**Payload**: `{ url: string }`

### `browser-title-changed`

Emitted when the page title changes (from `on_document_title_changed` callback).

**Payload**: `{ title: string }`

### `browser-load-started`

Emitted when a page starts loading (from `on_page_load` with `PageLoadEvent::Started`).

**Payload**: `{ url: string }`

### `browser-load-finished`

Emitted when a page finishes loading (from `on_page_load` with `PageLoadEvent::Finished`).

**Payload**: `{ url: string }`

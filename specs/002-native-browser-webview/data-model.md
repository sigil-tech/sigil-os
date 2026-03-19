# Data Model: Native Browser Webview

**Feature**: 002-native-browser-webview
**Date**: 2026-03-15

## Entities

### BrowserWebview (Rust backend — managed state)

The native webview instance, held as `Arc<Mutex<Option<Webview>>>` in the Tauri app state. Created lazily on first browser activation.

| Field | Type | Description |
|-------|------|-------------|
| webview | `Option<tauri::Webview>` | The native child webview handle, `None` until first creation |

**Lifecycle**:
- `None` → `Some(webview)`: Created via `browser_create` command
- `Some(webview)` with `show()`/`hide()`: Toggled on view switches
- Never destroyed during normal operation (preserved for app lifetime)

### NavigationState (TypeScript frontend — component state)

Tracks the current navigation state for UI rendering. Updated via Tauri events from the backend.

| Field | Type | Description |
|-------|------|-------------|
| currentUrl | `string` | Current URL displayed in address bar |
| pageTitle | `string` | Current page title (from `browser-title-changed` event) |
| isLoading | `boolean` | Whether a page is currently loading |
| isCreated | `boolean` | Whether the native webview has been created |

**Notes**:
- Navigation history (back/forward) is managed entirely by the native webview's browser engine
- The frontend does NOT maintain a history stack — it delegates to `history.back()`/`history.forward()` via backend commands
- `currentUrl` is updated reactively from `browser-url-changed` events, not from local state

### BrowserBounds (shared concept)

Describes the position and size of the browser webview relative to the application window.

| Field | Type | Description |
|-------|------|-------------|
| x | `f64` | Left offset from window origin (pixels) |
| y | `f64` | Top offset from window origin (pixels) |
| width | `f64` | Width in logical pixels |
| height | `f64` | Height in logical pixels |

**Calculation**: `x` = LeftRail width, `y` = address bar height, `width` = window width - rail width, `height` = window height - bar height - bottom bar height.

## State Transitions

```
[No Webview] --browser_create--> [Created + Visible]
[Created + Visible] --browser_hide--> [Created + Hidden]
[Created + Hidden] --browser_show--> [Created + Visible]
[Created + Visible] --browser_navigate--> [Created + Visible, new URL]
```

## Relationships

```
Tauri Window (1) ──has──> Shell UI Webview (1)   [existing, renders Preact app]
Tauri Window (1) ──has──> Browser Webview (0..1) [new, native child for browsing]
BrowserView.tsx (1) ──controls──> Browser Webview (0..1) [via invoke commands]
Browser Webview (1) ──emits──> NavigationState updates [via Tauri events]
```

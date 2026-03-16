# Research: Shell Views Implementation

## Issue 1 — Editor View: neovim binary not found

**Problem**: `spawn_editor` calls `open_pty` with `"nvim"` as the command. On the running Sigil OS system, the binary is not in PATH because `neovim` is not declared in `modules/sigil-shell.nix` (or any other loaded module).

**Decision**: Add `pkgs.neovim` to `environment.systemPackages` in `modules/sigil-shell.nix`.

**Rationale**: This is the canonical NixOS pattern. The neovim package in nixpkgs ships the `nvim` binary. Adding it to `sigil-shell.nix` keeps shell tooling co-located and satisfies Constitution Principle I (Nix-First) and VII (Minimal Surface Area — neovim is justified as the editor view's runtime dependency).

**Alternatives considered**:
- Add to `sigil-base.nix` — rejected; neovim is a shell-specific tool, not a base system requirement.
- Use `programs.neovim.enable = true` module — also valid, but heavier (generates config files). Plain package addition is minimal and sufficient since the editor view doesn't need NixOS-managed neovim config.

---

## Issue 2 — Git View: cwd detection returns undefined

**Problem**: `GitView.tsx` reads `window.__TAURI_INTERNALS__?.metadata?.currentDir`. In Tauri 2.x this internal object does not expose `currentDir` — the field is undefined at runtime, so the repo path falls back to `/home`, which contains no git repo.

**Decision**: Add a `get_cwd` Tauri command (new `shell/src-tauri/src/cwd.rs` module) that returns `std::env::current_dir()`. Update `GitView.tsx` to call `invoke<string>('get_cwd')` on mount.

**Rationale**: `std::env::current_dir()` returns the working directory of the Tauri process at launch time, which is the user's home directory or the directory from which `sigil-shell` was started. This is a reliable, non-internal API. The terminal session's live cwd (as the user navigates with `cd`) is a separate, more complex problem (requires OSC 7 shell integration) that is out of scope for this feature.

**Alternatives considered**:
- Read `/proc/self/cwd` — equivalent to `std::env::current_dir()` on Linux, less portable, no advantage.
- OSC 7 shell integration — tracks terminal cwd accurately but requires shell config changes and a PTY output parser. Out of scope; noted for a future spec.
- Keep `__TAURI_INTERNALS__` with a polyfill — fragile; internal API not guaranteed to exist.

---

## Issue 3 — Containers View: reqwest cannot connect to Docker Unix socket

**Problem**: `containers.rs` builds URLs of the form `http+unix://%2Fvar%2Frun%2Fdocker.sock/containers/json`. `reqwest 0.12` requires the `unix-socket` feature flag to support this URL scheme. Without it, the underlying hyper connector does not register the `http+unix` scheme and every request fails immediately with a connection error.

**Decision**: Add `unix-socket` to `reqwest` features in `shell/src-tauri/Cargo.toml`:
```toml
reqwest = { version = "0.12", features = ["json", "unix-socket"] }
```

**Rationale**: This is the documented reqwest approach for Unix socket communication. It requires no new crates and no code changes beyond the feature flag — the URL construction in `containers.rs` is already correct.

**Alternatives considered**:
- `hyperlocal` crate — third-party, adds a dependency, not needed since reqwest has built-in support.
- `bollard` Docker client crate — full-featured but heavyweight; overkill for list/start/stop/logs. Current containers.rs implementation is sufficient.
- HTTP over TCP to Docker daemon — requires Docker to expose a TCP port, which is a security risk and non-default config.

---

## No-change confirmation: Editor keepalive (FR-003)

The editor PTY session is already kept alive between view switches because `EditorView.tsx` creates the xterm Terminal and spawns the PTY in a `useEffect` with no view-visibility dependency. The `ContentPane.tsx` likely uses CSS visibility/display to hide inactive views rather than unmounting them. This means the PTY persists as long as the parent component is mounted. **No changes needed for FR-003**.

## No-change confirmation: Neovim resize (FR-004)

`EditorView.tsx` already has a `ResizeObserver` that calls `fitAddon.fit()` and `invoke('pty_resize', ...)` on size changes. **No changes needed for FR-004**.

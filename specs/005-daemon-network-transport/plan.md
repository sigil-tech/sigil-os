# Implementation Plan: Daemon Network Transport

**Branch**: `005-daemon-network-transport` | **Date**: 2026-03-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-daemon-network-transport/spec.md`

## Summary

Add an opt-in, secure TCP listener to sigild so that sigil-shell running natively on a host machine (macOS, Windows, Linux) can connect to the daemon inside a headless sigil-os VM. Security model: TLS 1.3 with a self-signed server cert (ECDSA P-256) plus a bearer token sent as the first message after the TLS handshake. MITM is prevented by SPKI fingerprint pinning on the client — the fingerprint is baked into the credential file that gets transferred out-of-band. Credential revocation is hot (no daemon restart) via an in-memory token map. The Unix socket is completely unchanged.

This spans two repos: `sigil` (Go daemon — most of the work) and `sigil-os` (NixOS module update + Tauri shell TLS client).

## Technical Context

**Language/Version**: Go 1.24 (daemon), Rust 2021 / Tauri 2.x (sigil-shell)
**Primary Dependencies (Go)**: `crypto/tls`, `crypto/x509`, `crypto/ecdsa`, `crypto/rand` — all stdlib; no new external deps
**Primary Dependencies (Rust)**: `rustls 0.23`, `tokio-rustls 0.26`, `rustls-pemfile 2` — rustls and tokio-rustls are already transitive; rustls-pemfile needs explicit declaration
**Storage**: Credential store — JSON file at `$XDG_DATA_HOME/sigil/credentials.json`; TLS cert/key at `$XDG_DATA_HOME/sigil/server-{cert,key}.pem`
**Testing**: `go test ./internal/...` + `go test ./cmd/...`; `cargo check` for Rust; manual end-to-end with VM
**Target Platform**: Linux (daemon inside sigil-os VM); macOS + Windows (sigil-shell client)
**Project Type**: Daemon extension + desktop app client update
**Performance Goals**: Connection + auth handshake under 300ms on local network; no degradation to existing Unix socket throughput
**Constraints**: Zero new Go external dependencies; minimal new Rust dependencies (rustls already transitive); Unix socket behavior 100% unchanged

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Nix-First | PASS | `sigild.nix` module updated with declarative `network.*` options; no imperative config |
| II. Reproducible Builds | PASS | No new Go deps; Rust deps already in lock file or added explicitly; `nix flake check` must pass |
| III. Module Boundaries | PASS | New `internal/network` package added to the sigil DAG in the correct position; `socket` package unchanged |
| IV. Hardware Abstraction | PASS | No hardware-specific paths; network listener is purely config-driven |
| V. Daemon Integration | PASS | Feature is an extension of sigild; no sigil-os layer logic duplicated in the daemon |
| VI. Security by Default | PASS | Network listener is **disabled by default**; refuses to start without credentials; TLS 1.3 minimum; no plaintext fallback |
| VII. Minimal Surface Area | PASS | Zero new packages in NixOS system; no new system services; just a new listener mode on an existing daemon |

**Verdict**: All gates pass. Proceed.

## Project Structure

### Documentation (this feature)

```text
specs/005-daemon-network-transport/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── auth-wire-protocol.md    # TCP auth handshake
│   └── credential-file.md       # Credential JSON schema
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (changed files)

**Repo: `sigil` (Go daemon)**
```text
internal/
├── config/
│   └── config.go                 # Add NetworkConfig + Network field to Config
└── network/                      # New package
    ├── certs.go                  # TLS cert gen/load (self-signed ECDSA P-256)
    ├── credentials.go            # Credential store: token map + JSON file + hot revocation
    └── listener.go               # Auth net.Listener wrapper (reads auth token before dispatch)

internal/socket/
└── server.go                     # Add ServeListener(ctx, net.Listener) method

cmd/sigild/
└── main.go                       # Wire up network listener when config.Network.Enabled

cmd/sigilctl/
└── main.go                       # Add `credential add/list/revoke` subcommands (call new socket methods)

SECURITY.md                       # Update: note new TCP listener surface
PRIVACY.md                        # No change needed (no new data collected)
```

**Repo: `sigil-os` (NixOS + Tauri shell)**
```text
modules/
└── sigild.nix                    # Add network.enable / network.bind / network.port options

shell/src-tauri/
├── Cargo.toml                    # Add rustls-pemfile = "2"; sha2 = "0.10" explicitly
└── src/
    ├── daemon_client.rs          # Add transport abstraction + TLS client path
    └── settings.rs               # New: load connection settings from config file
```

**Structure Decision**: Dual-repo change — daemon changes go on a branch in `sigil`, shell/NixOS changes go on `005-daemon-network-transport` in `sigil-os`. The two sets of changes are independently deployable: daemon can run with network listener before the Rust client supports TLS, and vice versa (the Rust client falls back to Unix socket when not configured for TCP).

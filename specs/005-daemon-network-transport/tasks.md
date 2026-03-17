# Tasks: Daemon Network Transport

**Input**: Design documents from `/specs/005-daemon-network-transport/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Repos affected**: `~/workspace/sigil` (Go daemon), `~/workspace/sigil-os` (NixOS + Tauri shell)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase
- **[Story]**: US1=Remote connection, US2=Secure auth, US3=Config/listener, US4=Credential bootstrap
- Tests are **not** included (not requested in spec)

---

## Phase 1: Setup

**Purpose**: Add new dependencies and config scaffolding in both repos before any logic is written.

- [ ] T001 Add `NetworkConfig` struct to `~/workspace/sigil/internal/config/config.go` with fields: `Enabled bool`, `Bind string`, `Port int`, `AllowedCredentials []string`; add `Network NetworkConfig` field to `Config` struct; add `[network]` section to `dev.toml` with `enabled = false`
- [ ] T002 [P] Create `~/workspace/sigil/internal/network/` package directory with empty `certs.go`, `credentials.go`, `listener.go` files containing only package declarations
- [ ] T003 [P] Add `rustls-pemfile = "2"` and `sha2 = "0.10"` to explicit dependencies in `~/workspace/sigil-os/shell/src-tauri/Cargo.toml`; run `cargo check` to confirm they resolve from the existing lock file
- [ ] T004 [P] Create `~/workspace/sigil-os/shell/src-tauri/src/settings.rs` with a `DaemonSettings` struct (`transport: Transport`, `unix_socket_path: Option<String>`, `tcp_credential_path: Option<String>`, `tcp_addr_override: Option<String>`) and a `Transport` enum (`Unix`, `Tcp`); add `serde` derives; add `mod settings;` to `main.rs`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: TLS cert management, credential store, and `ServeListener` on the socket server. All user story phases depend on this phase being complete.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T005 Implement TLS cert lifecycle in `~/workspace/sigil/internal/network/certs.go`: `LoadOrGenerate(dir string) (tls.Certificate, error)` — checks for `server-cert.pem` + `server-key.pem` in `dir`; if absent, generates a self-signed ECDSA P-256 cert (1-year validity, localhost + 127.0.0.1 SANs) and writes both PEM files; returns the loaded cert. Also export `SPKIFingerprint(cert *x509.Certificate) string` that returns `"sha256/<base64>"` of `cert.RawSubjectPublicKeyInfo`.
- [ ] T006 Implement `CredentialStore` in `~/workspace/sigil/internal/network/credentials.go`: struct with `sync.RWMutex`-guarded `map[string]*Credential` (keyed by token); `Credential` has fields matching data-model.md (`ID`, `TokenHash`, `CreatedAt`, `Revoked`, `RevokedAt`); methods: `Add(id, token string) error`, `Validate(token string) (bool, *Credential)`, `Revoke(id string) error`, `List() []*Credential`; `LoadFromFile(path string) error` and `SaveToFile(path string) error` for JSON persistence; store only `token_hash` (SHA-256 hex) on disk, never plaintext
- [ ] T007 Implement auth `net.Listener` wrapper in `~/workspace/sigil/internal/network/listener.go`: `NewAuthListener(inner net.Listener, store *CredentialStore) net.Listener` — returns a `net.Listener` whose `Accept()` calls the inner listener, reads the first JSON line from the returned conn, validates the auth message `{"method":"auth","payload":{"token":"..."}}` against the store, writes success/failure response, and returns the conn (positioned after the auth exchange) on success or closes and retries on failure. Generate a `session_id` (UUID v4) on success and include it in the response payload.
- [ ] T008 Add `ServeListener(ctx context.Context, ln net.Listener) error` method to `~/workspace/sigil/internal/socket/server.go` — runs the existing `acceptLoop` logic against the provided `ln` instead of creating its own listener; the Unix socket `Start()` method is unchanged; `ServeListener` returns immediately (accept loop runs in background goroutine)

**Checkpoint**: Cert management, credential store, auth listener, and ServeListener are complete. The daemon can now be wired up in Phase 3.

---

## Phase 3: User Story 3 + User Story 2 — Secure TCP Listener (Priority: P2 + P1)

**Goal**: sigild starts a secure, authenticated TCP listener when `network.enabled = true`. Unauthorized connections are rejected before any daemon data is exchanged.

**Independent Test**: Set `[network] enabled = true` in `dev.toml`. Start sigild. Confirm it listens on the configured port. Use `openssl s_client` to verify TLS handshake completes. Send an auth message with a valid token and confirm the normal `status` method responds. Send an invalid token and confirm the connection is closed with `{"ok":false,"error":"unauthorized"}`.

- [ ] T009 [US3] [US2] Wire up network listener startup in `~/workspace/sigil/cmd/sigild/main.go`: after starting the Unix socket server, if `cfg.Network.Enabled`, call `network.LoadOrGenerate(dataDir)` to get the TLS cert; build `tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS13}`; call `tls.Listen("tcp", addr, tlsConfig)`; wrap with `network.NewAuthListener(ln, credStore)`; call `server.ServeListener(ctx, authLn)`; log listener address and SPKI fingerprint at startup
- [ ] T010 [US3] [US2] Initialize `CredentialStore` in `~/workspace/sigil/cmd/sigild/main.go`: determine credentials file path (`$XDG_DATA_HOME/sigil/credentials.json`); call `credStore.LoadFromFile(path)` (ignore error if file absent — first run); pass `credStore` to `network.NewAuthListener`; register new socket methods `credential.add`, `credential.list`, `credential.revoke` that delegate to `credStore` methods and call `credStore.SaveToFile` after mutations
- [ ] T011 [US3] Register `credential.add`, `credential.list`, `credential.revoke` handler functions in `~/workspace/sigil/cmd/sigild/main.go` as `socket.HandlerFunc` values: `credential.add` receives `{"id":"..."}`, generates a random token (`sghl_` + 40 hex chars via `crypto/rand`), calls `credStore.Add`, returns the full credential bundle JSON including `server_cert_spki` from the loaded cert; `credential.list` returns sanitized list (no token values); `credential.revoke` receives `{"id":"..."}`, calls `credStore.Revoke`, closes any active sessions using that credential
- [ ] T012 [US3] Add `credential add/list/revoke` subcommands to `~/workspace/sigil/cmd/sigilctl/main.go`: each subcommand connects to the Unix socket and calls the corresponding `credential.*` method; `credential add <name>` pretty-prints the full JSON response (the credential bundle) and adds a warning comment that the file is secret; `credential list` renders a table; `credential revoke <name>` confirms success

---

## Phase 4: User Story 1 — sigil-shell TCP+TLS Client (Priority: P1)

**Goal**: sigil-shell can be configured to connect to a remote daemon over TCP+TLS using a credential file. All views function identically to a local connection.

**Independent Test**: Generate a credential on the daemon, copy the JSON to a file, set `daemon-settings.json` to `"transport":"tcp"` pointing at the credential file. Launch sigil-shell. The daemon status view shows "Connected (remote)" and displays live data. Switch between all views (terminal, git, containers, insights) — each functions correctly. Kill the network connection briefly and confirm sigil-shell shows a disconnected state, then reconnects automatically.

- [ ] T013 [US1] Implement `Transport` enum and TLS connection path in `~/workspace/sigil-os/shell/src-tauri/src/daemon_client.rs`: add `enum Transport { Unix(std::os::unix::net::UnixStream), Tcp(rustls::StreamOwned<rustls::ClientConnection, std::net::TcpStream>) }`; change `DaemonClient.stream: Option<UnixStream>` to `stream: Option<Transport>`; update `write_all` / read logic in `do_call()` to dispatch to the correct variant via a match; eliminate `try_clone()` by sequencing write then read on the same mutable borrow
- [ ] T014 [US1] Implement `DaemonClient::connect_tcp(addr: &str, credential_path: &str) -> Result<(), String>` in `~/workspace/sigil-os/shell/src-tauri/src/daemon_client.rs`: load credential JSON from file; extract `server_cert_spki` and `token`; build `rustls::ClientConfig` with a custom `ServerCertVerifier` that verifies SHA-256 fingerprint of the server's DER cert matches the pinned `server_cert_spki`; open `TcpStream`; perform TLS handshake via `rustls::ClientConnection`; send auth message `{"method":"auth","payload":{"token":"..."}}` followed by newline; read auth response and return error on `ok: false`
- [ ] T015 [US1] [P] Update `subscribe_suggestions` and `subscribe_actuations` in `~/workspace/sigil-os/shell/src-tauri/src/daemon_client.rs` to accept a `transport` parameter (`"unix"` or `"tcp"`) and credential path; for TCP subscriptions, perform the full TLS+auth handshake before sending the subscribe message; use the same `ServerCertVerifier` fingerprint logic as T014
- [ ] T016 [US1] Implement settings loading in `~/workspace/sigil-os/shell/src-tauri/src/settings.rs`: `DaemonSettings::load() -> DaemonSettings` reads `$XDG_CONFIG_HOME/sigil-shell/daemon-settings.json` (falls back to defaults: `transport = Unix` if file absent or parse fails); `DaemonSettings::default()` returns Unix transport with auto-detected socket path
- [ ] T017 [US1] Update `~/workspace/sigil-os/shell/src-tauri/src/main.rs` to load `DaemonSettings` at startup and construct `DaemonClient` accordingly: if `transport = Unix` use existing `DaemonClient::new()` / `with_path()`; if `transport = Tcp` call `DaemonClient::connect_tcp(addr, cred_path)`; pass the resolved socket path (or signal TCP mode) to `subscribe_suggestions` and `subscribe_actuations`; remove the duplicate socket path computation that currently exists on line 56

---

## Phase 5: User Story 4 — Connection Status + Credential Bootstrap UX (Priority: P2)

**Goal**: sigil-shell shows a clear connection status indicator (local vs remote, healthy vs disconnected). `sigilctl credential add` produces a ready-to-use credential file.

**Independent Test**: With a TCP connection active, the status bar shows "remote" and a connected indicator. Disconnect the network — indicator changes to "disconnected". Reconnect — indicator returns to "connected". Run `sigilctl credential add test` and confirm JSON output contains all required fields per the credential-file contract.

- [ ] T018 [US4] Add a Tauri command `get_connection_status` in `~/workspace/sigil-os/shell/src-tauri/src/daemon_client.rs` that returns a struct `{ transport: "unix" | "tcp", connected: bool, remote_addr: Option<String> }`; expose via `tauri::generate_handler!` in `main.rs`
- [ ] T019 [US4] [P] Add a connection status indicator to `~/workspace/sigil-os/shell/src/components/LeftRail.tsx` (or equivalent status bar component): call `invoke('get_connection_status')` on mount and on a 5-second interval; show a small dot — green for connected local, blue for connected remote, red for disconnected — with a tooltip showing transport type and remote address
- [ ] T020 [US4] Add auto-reconnect loop in `~/workspace/sigil-os/shell/src-tauri/src/daemon_client.rs`: if `connect_tcp` fails or connection drops (detected by `do_call` returning a connection error), schedule a reconnect attempt after 2s, 4s, 8s, 16s, 30s (cap); emit a Tauri event `daemon-connection-changed` with the new status so the frontend indicator updates without polling

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: NixOS module options, SECURITY.md update, and end-to-end validation.

- [ ] T021 Add `services.sigild.network` option group to `~/workspace/sigil-os/modules/sigild.nix`: `enable` (mkEnableOption), `bind` (types.str, default "0.0.0.0"), `port` (types.port, default 7773); pass these as `[network]` TOML values in the generated sigild config file; run `nix flake check` to confirm eval passes
- [ ] T022 [P] Update `~/workspace/sigil/SECURITY.md`: add a section documenting the new TCP listener surface — that it is disabled by default, what port it uses, what auth model is used (TLS 1.3 + bearer token), and how credentials are revoked
- [ ] T023 [P] Update `~/workspace/sigil/config.example.toml` with a commented-out `[network]` section showing all available options with descriptions

---

## Dependency Graph

```
T001 → T002 → T005 → T007 → T009 → T011 → T018
T001 → T002 → T006 → T007 → T010 → T012
              T007 → T008 → T009
T003 → T013 → T014 → T017
T003 → T015
T004 → T016 → T017 → T018 → T019
                              T020
T009 complete → T013 (can begin in parallel)
T021 → nix flake check (final gate)
```

**Parallel opportunities within phases**:
- Phase 1: T002, T003, T004 are all parallel (different files/repos)
- Phase 3: T009+T010 sequence; T012 can start as soon as T011 is done
- Phase 4: T015 is parallel to T013+T014 (different function scope); T016 parallel to T013
- Phase 5: T019 and T020 are parallel (frontend vs backend of same feature)
- Phase 6: T022 and T023 are fully parallel (different files)

---

## Implementation Strategy

### MVP Scope (User Stories 1 + 2 + 3 together — they are inseparable)

The minimal end-to-end proof requires completing:
- **All of Phase 1** (setup)
- **All of Phase 2** (foundational)
- **Phase 3, T009–T011** (listener starts with TLS + auth; skip sigilctl commands T012 for MVP)
- **Phase 4, T013–T017** (sigil-shell connects over TCP+TLS)

This gives a working remote connection with security. T012 (sigilctl CLI), T018–T020 (status indicator + reconnect), and Phase 6 (NixOS module) are all additive on top.

### Story Independence

| Story | Can be done without | Blocked by |
|-------|---------------------|------------|
| US3 (listener config) | US1, US4 | Phase 2 complete |
| US2 (secure auth) | US1, US4 | Phase 2 + US3 listener running |
| US1 (remote shell) | US4 | Phase 2 + US2/US3 complete |
| US4 (bootstrap UX) | nothing | US2 (needs credential.add socket method) |

### Total Task Count: 23 tasks
- Phase 1 (Setup): 4 tasks
- Phase 2 (Foundational): 4 tasks
- Phase 3 (US3+US2): 4 tasks
- Phase 4 (US1): 5 tasks
- Phase 5 (US4): 3 tasks
- Phase 6 (Polish): 3 tasks

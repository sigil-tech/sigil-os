# Feature Specification: Daemon Network Transport

**Feature Branch**: `005-daemon-network-transport`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "Add a network transport to sigild so it can accept connections over TCP in addition to its existing Unix socket. Engineers running sigil-os as a headless VM should be able to connect sigil-shell running natively on their host macOS or Windows machine to the daemon over the network. The transport must be secure — authenticated and encrypted. The Unix socket path stays unchanged for local use. Configuration should allow enabling the network listener with an optional bind address and port, and optionally restricting to specific client identities."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remote Shell Connects to VM Daemon (Priority: P1)

As an engineer running sigil-os as a headless VM on my macOS or Windows machine, I want to open sigil-shell on my host and have it connect to the sigild daemon running inside the VM, so that I get the full Sigil workbench experience without needing a graphical display in the VM.

**Why this priority**: This is the entire point of the feature. Everything else (auth, config, key management) exists to enable this connection. Without a working remote connection, no other story delivers value.

**Independent Test**: Start sigil-os as a headless VM. Open sigil-shell on the host. Configure it to point to the VM's IP and port. The shell connects, shows daemon status, and all views (terminal, git, containers, insights) function as they do locally.

**Acceptance Scenarios**:

1. **Given** sigild is running in a VM with the network listener enabled, **When** sigil-shell on the host is pointed at the VM's address and port, **Then** the shell connects and shows live daemon data within 3 seconds.
2. **Given** a connected sigil-shell session, **When** the VM's network becomes temporarily unavailable, **Then** sigil-shell shows a clear "disconnected" state and automatically reconnects when the network is restored.
3. **Given** a connected sigil-shell session, **When** the engineer closes sigil-shell, **Then** the daemon continues running and all state (active sessions, collected events) is preserved.
4. **Given** sigild is not yet running in the VM, **When** sigil-shell attempts to connect, **Then** it shows a clear "daemon unavailable" message rather than hanging or crashing.

---

### User Story 2 - Secure Connection with Identity Verification (Priority: P1)

As an engineer, I want the connection between sigil-shell and a remote sigild to be encrypted and authenticated, so that my development activity, code context, and AI interactions are not exposed on the local network.

**Why this priority**: Security is a prerequisite for the feature being usable at all. An unauthenticated plaintext connection would be rejected outright by security-conscious engineers and enterprises.

**Independent Test**: With sigild's network listener running, attempt to connect with an invalid credential. Verify the connection is rejected. Verify that traffic captured on the local network interface is not readable plaintext.

**Acceptance Scenarios**:

1. **Given** sigild is running with a network listener, **When** a client presents a valid credential, **Then** the connection is accepted and the session is established.
2. **Given** sigild is running with a network listener, **When** a client presents an invalid or absent credential, **Then** the connection is rejected immediately with a clear error.
3. **Given** an established connection, **When** traffic is inspected at the network layer, **Then** the content of messages is not readable without the session keys.
4. **Given** sigild is configured with an allowlist of client identities, **When** a client with a valid credential but an identity not on the allowlist connects, **Then** the connection is rejected.

---

### User Story 3 - Enable and Configure the Network Listener (Priority: P2)

As an engineer or system administrator, I want to enable sigild's network listener through its configuration file, specifying the bind address and port, so that I can control which network interface the daemon listens on without recompiling or patching the binary.

**Why this priority**: Configuration flexibility is needed for real-world deployments (loopback-only, LAN, specific VM network interface) but defaults can be assumed for the P1 stories.

**Independent Test**: Add a `[network]` section to sigild's config file with `enabled = true`, a bind address, and a port. Restart sigild. Verify the daemon is listening on the specified address and port. Change the bind address and restart. Verify the listener moves.

**Acceptance Scenarios**:

1. **Given** the network listener is not configured, **When** sigild starts, **Then** it only listens on the Unix socket (existing behavior is unchanged).
2. **Given** the network listener is configured with `enabled = true` and a port, **When** sigild starts, **Then** it listens on both the Unix socket and the configured TCP address.
3. **Given** an invalid bind address is specified in config, **When** sigild starts, **Then** it logs a clear error identifying the misconfiguration and falls back to Unix-socket-only mode rather than crashing.
4. **Given** the network listener is enabled with a specific bind address (e.g., loopback only), **When** a connection is attempted from a non-matching interface, **Then** the connection is refused at the network level.

---

### User Story 4 - Credential Bootstrap for New Workbench (Priority: P2)

As an engineer setting up a new sigil-os VM, I want a simple way to generate and distribute connection credentials so that I can pair sigil-shell on my host with the daemon in under 5 minutes without reading cryptography documentation.

**Why this priority**: Even a perfectly implemented secure transport is useless if credential setup takes 30 minutes or requires manual certificate signing. The onboarding experience determines adoption.

**Independent Test**: On a fresh sigil-os VM, run a single command that outputs a connection string (or credential file). Copy that string/file to the host machine, configure sigil-shell to use it, and connect. Entire process should take under 5 minutes.

**Acceptance Scenarios**:

1. **Given** a fresh sigil-os installation, **When** the engineer runs a credential generation command, **Then** a credential file is produced that can be transferred to the host machine.
2. **Given** a credential file on the host, **When** the engineer configures sigil-shell with it and connects, **Then** the connection is accepted without any additional manual steps.
3. **Given** a credential that has been revoked on the daemon side, **When** sigil-shell attempts to connect with it, **Then** the connection is rejected with a message indicating the credential is no longer valid.

---

### Edge Cases

- What happens if two sigil-shell instances connect to the same daemon simultaneously? Each should get an independent session; the daemon must handle multiple concurrent remote connections.
- What happens if the configured port is already in use when sigild starts? The daemon should log a clear error and continue with Unix-socket-only mode rather than failing to start entirely.
- What happens if the VM's IP address changes (DHCP reassignment)? The engineer must reconfigure sigil-shell's connection address; dynamic discovery is out of scope for this feature.
- What happens if a client stays connected but goes idle for an extended period? The connection should remain open; there is no idle timeout by default. A configurable keepalive may be added but is not required.
- What happens if the network listener is enabled but no credentials have been generated? The daemon should refuse to start the listener and log an actionable error rather than starting an unauthenticated endpoint.

## Requirements *(mandatory)*

### Functional Requirements

**Network Listener**
- **FR-001**: The daemon MUST support an opt-in network listener that is disabled by default; the Unix socket MUST remain the only transport when the listener is not explicitly enabled.
- **FR-002**: The network listener MUST be configurable with a bind address (defaulting to all interfaces) and a port (defaulting to a fixed well-known port).
- **FR-003**: The daemon MUST accept multiple simultaneous remote connections.
- **FR-004**: The daemon MUST log listener startup, each accepted connection (with client identity), and each disconnection.

**Security**
- **FR-005**: All traffic over the network transport MUST be encrypted end-to-end.
- **FR-006**: Every remote connection MUST be authenticated; unauthenticated connections MUST be rejected before any daemon data is exchanged.
- **FR-007**: The daemon MUST support an optional allowlist of authorized client identities; when configured, only listed identities are accepted.
- **FR-008**: The daemon MUST refuse to start the network listener if no credentials exist, rather than starting an open unauthenticated endpoint.

**Credential Management**
- **FR-009**: The daemon MUST provide a command or sub-command to generate a credential that can be transferred to a remote sigil-shell instance.
- **FR-010**: The daemon MUST support revoking a previously issued credential without restarting the daemon.

**Client (sigil-shell)**
- **FR-011**: sigil-shell MUST support configuring a remote daemon address (host + port) and credential in place of the default Unix socket path.
- **FR-012**: sigil-shell MUST display a clear connection status indicator showing whether it is connected to a local or remote daemon, and whether the connection is healthy.
- **FR-013**: sigil-shell MUST automatically attempt to reconnect to a remote daemon after a connection loss, with exponential backoff, without requiring a restart.

### Key Entities

- **Network Listener Config**: The configuration block that enables the TCP listener — bind address, port, enabled flag.
- **Client Credential**: A portable secret that proves a sigil-shell instance's identity to a remote daemon. Has an identifier, a creation timestamp, and a revoked flag.
- **Remote Session**: An active authenticated connection from a remote sigil-shell to the daemon. Has a client identity, connection timestamp, and remote address.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An engineer can go from a fresh sigil-os VM to a working remote sigil-shell connection in under 5 minutes following the quickstart guide.
- **SC-002**: Remote sigil-shell connects to the daemon and displays live status within 3 seconds of a successful credential handshake on a local network.
- **SC-003**: An unauthorized connection attempt (wrong or missing credential) is rejected in under 1 second with no daemon data leaked.
- **SC-004**: Enabling the network transport does not degrade local Unix-socket performance — existing local sigil-shell sessions are unaffected.
- **SC-005**: After a network interruption, sigil-shell reconnects and resumes without requiring the engineer to manually restart either application.
- **SC-006**: All existing sigil-shell functionality (terminal, git view, containers view, insights, AI suggestions) works identically over a remote connection as it does locally.

## Assumptions

- The network transport is intended for local network use (VM-to-host on the same machine or same LAN). WAN/internet exposure is not a design target for this feature, though the security model should not preclude it.
- A single credential per engineer workstation is sufficient for this feature. Multi-device credential management (e.g., engineer's laptop + desktop) is a future concern.
- The default well-known port is 7773 (one above sigild's existing default of 7772, if applicable; otherwise a distinct port in the 7770–7779 range).
- sigil-shell's connection target (local socket vs. remote address) is configured in sigil-shell's own settings, not in the daemon config.
- Credential generation is done on the daemon side (inside the VM) and the resulting credential file is transferred to the host manually (e.g., via `scp` or shared clipboard). Automated pairing (QR code, mDNS discovery) is out of scope.

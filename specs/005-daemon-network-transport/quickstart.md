# Quickstart: Daemon Network Transport

## Setup: VM → Host Connection (under 5 minutes)

### Step 1 — Enable the listener in sigild config

On the VM (or MBP with sigil-os installed), add to `~/.config/sigil/config.toml`:

```toml
[network]
enabled = true
bind    = "0.0.0.0"
port    = 7773
```

Restart sigild (`systemctl --user restart sigild` or via NixOS module option).

On first start with `network.enabled = true`, sigild generates a self-signed TLS cert at `~/.local/share/sigil/server-cert.pem`.

### Step 2 — Generate a credential

```bash
sigilctl credential add macbook-pro
```

Output (copy this entire JSON):
```json
{
  "id": "macbook-pro",
  "token": "sghl_a1b2c3d4...",
  "server_addr": "192.168.64.3:7773",
  "server_cert_spki": "sha256/nRWr...",
  "generated_at": "2026-03-16T14:23:45Z"
}
```

### Step 3 — Transfer credential to host

Copy the JSON to the host machine. Save as:
```
~/.config/sigil-shell/daemon-credential.json
```
Set permissions: `chmod 600 ~/.config/sigil-shell/daemon-credential.json`

### Step 4 — Configure sigil-shell to use TCP

Edit (or create) `~/.config/sigil-shell/daemon-settings.json`:
```json
{
  "transport": "tcp",
  "tcp_credential_path": "/home/yourname/.config/sigil-shell/daemon-credential.json"
}
```

### Step 5 — Launch sigil-shell

Open sigil-shell on the host. The connection status indicator should show "Connected (remote)" within 3 seconds.

---

## Revoking a Credential

On the VM:
```bash
sigilctl credential revoke macbook-pro
```

Effect is immediate. The `macbook-pro` sigil-shell instance will show "Disconnected" and fail to reconnect. Delete the credential file on the host.

---

## Listing Active Credentials

```bash
sigilctl credential list
```
```
ID               CREATED              REVOKED
macbook-pro      2026-03-16 14:23     no
desktop-win      2026-03-17 09:11     no
old-laptop       2026-03-10 08:00     yes
```

---

## Troubleshooting

**"Docker unavailable" or similar errors after connecting**: The remote session is working; individual views may have their own dependencies (Docker, git repo) that need to be present in the VM.

**"TLS fingerprint mismatch"**: The daemon's TLS cert was regenerated (e.g., after a cert expiry or OS reinstall). Run `sigilctl credential add macbook-pro` to generate a new credential with the new fingerprint. Delete and replace the old credential file on the host.

**"Unauthorized"**: The token was revoked or the credential file is corrupted. Generate a new credential.

**sigil-shell stuck on "Connecting..."**: Check that port 7773 is reachable from the host to the VM. On OrbStack/UTM the VM is on a local virtual network; on VirtualBox/QEMU you may need a port forward.

---

## Validation (developer testing)

```bash
# Confirm daemon is listening
ss -tlnp | grep 7773

# Manual TLS connection test (shows cert fingerprint)
openssl s_client -connect 192.168.64.3:7773 < /dev/null 2>&1 | grep -E "subject|SHA"

# Send a manual auth + status request
echo '{"method":"auth","payload":{"token":"sghl_..."}}
{"method":"status"}' | openssl s_client -connect 192.168.64.3:7773 -quiet 2>/dev/null

# Credential management
sigilctl credential add test-cred
sigilctl credential list
sigilctl credential revoke test-cred
```

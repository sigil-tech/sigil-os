# Socket API Contract: sigild ↔ Sigil Shell

**Feature**: 001-sigil-shell-v0
**Date**: 2026-03-14
**Protocol**: Newline-delimited JSON over Unix domain socket
**Socket path**: `/run/user/$UID/sigild.sock`

## Wire Protocol

### Request format
```json
{"method": "<method_name>", "payload": <object_or_null>}\n
```

### Response format
```json
{"ok": true, "payload": <object_or_null>, "error": ""}\n
```

### Push event format (subscription mode)
```json
{"event": "<topic>", "payload": <object>}\n
```

### Connection modes
1. **Request/response**: Send request, receive response. Connection supports multiple exchanges.
2. **Subscribe**: First message is `{"method":"subscribe","payload":{"topic":"<name>"}}`. Server acknowledges, then pushes events on the same connection indefinitely.

---

## Methods (20+)

### Status & Configuration

#### `status`
Quick health check.

**Request**: `{"method":"status","payload":null}`

**Response payload**:
```json
{
  "status": "ok",
  "version": "0.1.0-dev",
  "notifier_level": 2,
  "rss_mb": 45,
  "current_keybinding_profile": "terminal",
  "next_digest_at": "2026-03-15T09:00:00Z"
}
```

#### `config`
Get resolved runtime configuration (API keys masked).

**Request**: `{"method":"config","payload":null}`

**Response payload**:
```json
{
  "db_path": "/home/engineer/.local/share/sigild/data.db",
  "socket_path": "/run/user/1000/sigild.sock",
  "inference_mode": "localfirst",
  "watch_paths": ["/home/engineer"],
  "repo_paths": ["/home/engineer"],
  "analyze_every": "1h0m0s",
  "notifier_level": 2,
  "log_level": "info",
  "digest_time": "09:00",
  "raw_event_days": 7
}
```

---

### Event Collection

#### `events`
Get recent raw events from the store.

**Request**: `{"method":"events","payload":null}`

**Response payload**: Array of Event objects.
```json
[
  {
    "id": 1234,
    "kind": "file",
    "source": "files",
    "payload": {"path": "/home/engineer/main.go", "op": "write"},
    "timestamp": "2026-03-14T10:30:45Z"
  }
]
```

**Event kinds**: `file`, `process`, `hyprland`, `git`, `terminal`, `ai`

#### `ingest`
Push a terminal event (called by shell hooks).

**Request**:
```json
{"method":"ingest","payload":{
  "cmd": "go test ./...",
  "exit_code": 0,
  "cwd": "/home/engineer/project",
  "ts": 1710419445,
  "session_id": "sess-abc123"
}}
```

`ts` and `session_id` are optional.

**Response**: `{"ok":true,"payload":null,"error":""}`

---

### Suggestions & Patterns

#### `suggestions`
Get suggestion history with lifecycle status.

**Request**: `{"method":"suggestions","payload":null}`

**Response payload**:
```json
[
  {
    "id": 42,
    "category": "pattern",
    "confidence": 0.85,
    "title": "Edit-then-test pattern detected",
    "body": "You run tests after 75% of edits in /home/engineer/src",
    "action_cmd": "",
    "status": "new",
    "created_at": "2026-03-14T10:00:00Z"
  }
]
```

#### `patterns`
Get detected patterns (filtered suggestions where category=="pattern").

**Request**: `{"method":"patterns","payload":null}`

**Response**: Same shape as `suggestions`, filtered to pattern category.

#### `feedback`
Record user acceptance/dismissal of a suggestion.

**Request**:
```json
{"method":"feedback","payload":{
  "suggestion_id": 42,
  "outcome": "accepted"
}}
```

`outcome` must be `"accepted"` or `"dismissed"`.

**Response**: `{"ok":true,"payload":null,"error":""}`

---

### Analysis

#### `trigger-summary`
Immediately enqueue an analysis cycle.

**Request**: `{"method":"trigger-summary","payload":null}`

**Response**: `{"ok":true,"payload":{"message":"analysis cycle queued"},"error":""}`

---

### Data Aggregation

#### `files`
Top 20 files edited in last 24 hours.

**Request**: `{"method":"files","payload":null}`

**Response payload**:
```json
[
  {"Path": "/home/engineer/main.go", "Count": 47},
  {"Path": "/home/engineer/util.go", "Count": 23}
]
```

#### `commands`
Command frequency table for last 24 hours.

**Request**: `{"method":"commands","payload":null}`

**Response payload**:
```json
[
  {"cmd": "go test ./...", "count": 12, "last_exit_code": 0},
  {"cmd": "git commit -m", "count": 8, "last_exit_code": 0}
]
```

#### `sessions`
Terminal session summaries (last 24h).

**Request**: `{"method":"sessions","payload":null}`

**Response payload**:
```json
[
  {
    "session_id": "sess-abc123",
    "cmd_count": 42,
    "first_ts": 1710376800,
    "last_ts": 1710419445,
    "last_cwd": "/home/engineer/project"
  }
]
```

---

### Notification Control

#### `set-level`
Change notification level at runtime.

**Request**: `{"method":"set-level","payload":{"level":0}}`

**Levels**:
- `0` = Silent (store only)
- `1` = Digest (daily summary)
- `2` = Ambient (real-time toasts) — default
- `3` = Conversational (toasts with actions)
- `4` = Autonomous (auto-execute high-confidence)

**Response**: `{"ok":true,"payload":{"level":0},"error":""}`

---

### AI & Inference

#### `ai-query`
Route a natural-language query through the inference engine.

**Request**:
```json
{"method":"ai-query","payload":{
  "query": "How do I fix this build error?",
  "context": "debug"
}}
```

`context` is optional, one of: `code_gen`, `debug`, `docs`, `refactor`.

**Response payload**:
```json
{
  "response": "The issue is in line 42 where...",
  "routing": "local",
  "latency_ms": 245
}
```

---

### Actions & Undo

#### `actions`
Get recent undoable actions (30-second undo window).

**Request**: `{"method":"actions","payload":null}`

**Response payload**:
```json
[
  {
    "id": "action-uuid-1",
    "description": "Opened split pane",
    "undo_cmd": "hyprctl dispatch killactive",
    "expires_at": "2026-03-14T10:35:45Z"
  }
]
```

#### `undo`
Execute the undo command for the most recent undoable action.

**Request**: `{"method":"undo","payload":null}`

**Response**: `{"ok":true,"payload":{"undone":"Opened split pane"},"error":""}` or error if no undoable action.

#### `view-changed`
Notify daemon when active tool view changes.

**Request**: `{"method":"view-changed","payload":{"view":"terminal"}}`

**Response**: `{"ok":true,"payload":null,"error":""}`

Side effect: Updates keybinding profile, pushes to "actuations" topic.

---

### Data Management

#### `purge`
Delete all stored data and remove database file.

**Request**: `{"method":"purge","payload":null}`

**Response**: `{"ok":true,"payload":null,"error":""}`

Note: Daemon must be restarted after purge.

---

### Fleet Reporting

#### `fleet-preview`
Preview anonymized metrics that will be sent.

**Request**: `{"method":"fleet-preview","payload":null}`

**Response payload**:
```json
{
  "node_id": "12345678-1234-1234-1234-123456789abc",
  "timestamp": "2026-03-14T10:30:00Z",
  "ai_query_counts": {"debug": 5, "code_gen": 3},
  "suggestion_accept_rate": 0.72,
  "adoption_tier": 2,
  "local_routing_ratio": 0.6,
  "build_success_rate": 0.85,
  "total_events": 3421
}
```

#### `fleet-opt-out`
Disable fleet reporting and clear pending queue.

**Request**: `{"method":"fleet-opt-out","payload":null}`

**Response**: `{"ok":true,"payload":null,"error":""}`

#### `fleet-policy`
Get current routing policy from fleet layer.

**Request**: `{"method":"fleet-policy","payload":null}`

**Response payload**:
```json
{
  "routing_mode": "hybrid",
  "allowed_providers": ["openai", "anthropic"],
  "allowed_model_ids": ["claude-opus", "gpt-4"],
  "enforced_at": "2026-03-14T10:00:00Z"
}
```

---

## Push Subscription Topics

### `suggestions`
Emitted when a suggestion passes confidence gate and is ready to surface.

**Subscribe**: `{"method":"subscribe","payload":{"topic":"suggestions"}}`

**Ack**: `{"ok":true,"payload":{"subscribed":true},"error":""}`

**Push events**:
```json
{"event":"suggestions","payload":{
  "id": 43,
  "title": "Edit-test-fail loop detected",
  "text": "Possible stuck on file",
  "confidence": 0.8,
  "action_cmd": ""
}}
```

### `actuations`
Emitted when daemon-driven actions are triggered.

**Subscribe**: `{"method":"subscribe","payload":{"topic":"actuations"}}`

**Push events**:
```json
{"event":"actuations","payload":{
  "type": "split-pane",
  "id": "action-uuid",
  "description": "Open split for test output",
  "undo_cmd": "...",
  "reason": "build_split_pane"
}}
```

---

## Error Handling

All methods return errors in the standard response format:
```json
{"ok":false,"payload":null,"error":"description of what went wrong"}
```

Common errors:
- Unknown method: `"unknown method: foo"`
- Invalid JSON: `"invalid request JSON"`
- Missing required field: `"missing required field: suggestion_id"`
- Daemon internal error: `"store error: ..."`

## Method Summary (22 total)

| # | Method | Direction | Purpose |
|---|--------|-----------|---------|
| 1 | `status` | req/res | Health check |
| 2 | `config` | req/res | Runtime configuration |
| 3 | `events` | req/res | Recent raw events |
| 4 | `ingest` | req/res | Push terminal event |
| 5 | `suggestions` | req/res | Suggestion history |
| 6 | `patterns` | req/res | Detected patterns |
| 7 | `feedback` | req/res | Accept/dismiss suggestion |
| 8 | `trigger-summary` | req/res | Enqueue analysis |
| 9 | `files` | req/res | Top edited files |
| 10 | `commands` | req/res | Command frequency |
| 11 | `sessions` | req/res | Session summaries |
| 12 | `set-level` | req/res | Change notification level |
| 13 | `ai-query` | req/res | Natural language query |
| 14 | `actions` | req/res | Recent undoable actions |
| 15 | `undo` | req/res | Undo last action |
| 16 | `view-changed` | req/res | Notify view switch |
| 17 | `purge` | req/res | Delete all data |
| 18 | `fleet-preview` | req/res | Preview fleet metrics |
| 19 | `fleet-opt-out` | req/res | Opt out of fleet |
| 20 | `fleet-policy` | req/res | Get routing policy |
| 21 | `subscribe(suggestions)` | push | Suggestion stream |
| 22 | `subscribe(actuations)` | push | Actuation stream |

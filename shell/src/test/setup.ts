/// <reference types="vitest/globals" />
import '@testing-library/jest-dom'

// Mock Tauri invoke API for all tests
const mockResponses: Record<string, any> = {
  get_cwd: '/home/user/workspace',
  daemon_status: { status: 'ok', version: '0.1.0-dev', rss_mb: 42, notifier_level: 2, uptime_seconds: 3600, events_today: 150 },
  daemon_config: { inference_mode: 'localfirst', watch_paths: ['/home/user/workspace'], repo_paths: ['/home/user/workspace/sigil'] },
  daemon_events: [],
  daemon_suggestions: [],
  daemon_patterns: [],
  daemon_files: [{ path: '/home/user/workspace/main.go', count: 5 }],
  daemon_commands: [{ cmd: 'go test ./...', count: 3 }],
  get_connection_status: { transport: 'unix', connected: true, remote_addr: null },
  list_directory: [
    { name: 'src', path: '/home/user/workspace/src', is_dir: true },
    { name: 'main.go', path: '/home/user/workspace/main.go', is_dir: false },
  ],
  read_file: 'package main\n\nfunc main() {}\n',
  git_branch: 'main',
  git_status: [{ path: 'main.go', status: 'modified' }],
  git_log: [{ sha: 'abc12345', message: 'initial commit', author: 'nick', timestamp_unix: 1711000000 }],
  daemon_trigger_summary: { ok: true },
  daemon_set_level: { level: 2 },
  daemon_undo: { undone: 'last action' },
  daemon_purge: undefined,
  daemon_feedback: undefined,
  daemon_fleet_preview: { period: '2026-03-22', events_collected: 100 },
  daemon_fleet_opt_out: undefined,
  daemon_ai_query: { response: 'Hello from AI', routing: 'local', latency_ms: 100 },
  daemon_view_changed: undefined,
  write_file: undefined,
  load_app_config: [
    { id: 'terminal', name: 'Terminal', icon: 'terminal', command: '', args: [], window_class: null, mode: 'inline' },
    { id: 'editor', name: 'VS Code', icon: 'editor', command: '', args: [], window_class: null, mode: 'inline' },
    { id: 'git', name: 'lazygit', icon: 'git', command: 'lazygit', args: [], window_class: null, mode: 'inline' },
    { id: 'browser', name: 'Browser', icon: 'browser', command: '', args: [], window_class: null, mode: 'inline' },
    { id: 'events', name: 'Events', icon: 'events', command: '', args: [], window_class: null, mode: 'inline' },
  ],
  save_app_config: null,
  launch_app: null,
  focus_or_launch: null,
}

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, _args?: any) => {
    if (cmd in mockResponses) return mockResponses[cmd]
    return null
  }),
}))

// Mock @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event: string, _handler: any) => {
    return () => {} // unlisten function
  }),
  emit: vi.fn(async () => {}),
}))

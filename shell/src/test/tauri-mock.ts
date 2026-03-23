/** Mock Tauri invoke for Storybook and tests */
const mockResponses: Record<string, any> = {
  get_cwd: '/home/user/workspace',
  daemon_status: { status: 'ok', version: '0.1.0-dev', rss_mb: 42, notifier_level: 2, uptime_seconds: 3600, events_today: 150 },
  daemon_config: { inference_mode: 'localfirst', watch_paths: ['/home/user/workspace'] },
  daemon_events: [],
  daemon_suggestions: [],
  daemon_patterns: [],
  daemon_files: [{ path: '/home/user/workspace/main.go', count: 5 }],
  daemon_commands: [{ cmd: 'go test ./...', count: 3 }],
  get_connection_status: { transport: 'unix', connected: true, remote_addr: null },
  list_directory: [
    { name: 'src', path: '/home/user/workspace/src', is_dir: true },
    { name: 'main.go', path: '/home/user/workspace/main.go', is_dir: false },
    { name: 'README.md', path: '/home/user/workspace/README.md', is_dir: false },
  ],
  read_file: '// Hello from mock\npackage main\n\nfunc main() {\n\tfmt.Println("Hello")\n}\n',
  git_branch: 'main',
  git_status: [
    { path: 'main.go', status: 'modified' },
    { path: 'new-file.ts', status: 'untracked' },
  ],
  git_log: [
    { sha: 'abc12345', message: 'feat: initial commit', author: 'nick', timestamp_unix: 1711000000 },
    { sha: 'def67890', message: 'fix: resolve build', author: 'nick', timestamp_unix: 1710990000 },
  ],
}

export function setupTauriMocks() {
  if (typeof window !== 'undefined') {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, _args?: any) => {
        if (cmd in mockResponses) return mockResponses[cmd]
        console.warn(`[tauri-mock] unmocked command: ${cmd}`)
        return null
      },
    }
  }
}

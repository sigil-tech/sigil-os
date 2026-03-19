import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { useApp, type ViewId } from '../context/AppContext'

const VIEWS: { id: ViewId; label: string; shortcut: string; icon: () => preact.JSX.Element }[] = [
  {
    id: 'terminal',
    label: 'Terminal',
    shortcut: 'Ctrl+1',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    id: 'editor',
    label: 'Editor',
    shortcut: 'Ctrl+2',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    id: 'browser',
    label: 'Browser',
    shortcut: 'Ctrl+3',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    id: 'git',
    label: 'Git',
    shortcut: 'Ctrl+4',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" />
        <line x1="6" y1="9" x2="6" y2="21" />
      </svg>
    ),
  },
  {
    id: 'containers',
    label: 'Containers',
    shortcut: 'Ctrl+5',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
  {
    id: 'insights',
    label: 'Insights',
    shortcut: 'Ctrl+6',
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
]

interface StatusData {
  status: string
  rss_mb: number
  inference_mode?: string
}

interface ConnectionStatus {
  transport: 'unix' | 'tcp'
  connected: boolean
  remote_addr: string | null
}

export function LeftRail() {
  const { activeView, setActiveView } = useApp()
  const [daemonStatus, setDaemonStatus] = useState<StatusData | null>(null)
  const [connStatus, setConnStatus] = useState<ConnectionStatus | null>(null)

  // Keyboard shortcuts Mod+1 through Mod+6, Ctrl+Shift+O for pop-out
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'O') {
        e.preventDefault()
        invoke('pop_out_tool', { tool: activeView }).catch(() => {})
        return
      }
      if (!e.ctrlKey) return
      const n = parseInt(e.key)
      if (n >= 1 && n <= 6) {
        e.preventDefault()
        setActiveView(VIEWS[n - 1].id)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setActiveView, activeView])

  // Poll daemon status every 30 seconds
  useEffect(() => {
    async function poll() {
      try {
        const resp = await invoke<StatusData>('daemon_status')
        setDaemonStatus(resp)
      } catch {
        setDaemonStatus(null)
      }
    }
    poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [])

  // Poll connection status every 5 seconds
  useEffect(() => {
    async function pollConn() {
      try {
        const resp = await invoke<ConnectionStatus>('get_connection_status')
        setConnStatus(resp)
      } catch {
        setConnStatus(null)
      }
    }
    pollConn()
    const id = setInterval(pollConn, 5_000)
    return () => clearInterval(id)
  }, [])

  const connected = daemonStatus?.status === 'ok'
  const rssMb = daemonStatus?.rss_mb ?? 0
  const inferenceMode = daemonStatus?.inference_mode ?? 'local'

  // Connection indicator: green=local connected, blue=remote connected, red=disconnected
  const isRemote = connStatus?.transport === 'tcp'
  const isConnected = connStatus?.connected ?? connected
  const connDotClass = isConnected
    ? isRemote
      ? 'left-rail__dot left-rail__dot--remote'
      : 'left-rail__dot left-rail__dot--ok'
    : 'left-rail__dot left-rail__dot--err'
  const connTooltip = isConnected
    ? isRemote
      ? `Connected (remote: ${connStatus?.remote_addr ?? 'tcp'})`
      : 'Connected (local)'
    : 'Disconnected'

  return (
    <nav class="left-rail" aria-label="Navigation">
      <div class="left-rail__icons">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            class={`left-rail__btn${activeView === v.id ? ' left-rail__btn--active' : ''}`}
            onClick={() => setActiveView(v.id)}
            title={`${v.label} (${v.shortcut})`}
            aria-label={v.label}
            aria-current={activeView === v.id ? 'page' : undefined}
          >
            <v.icon />
          </button>
        ))}
      </div>

      <button
        class="left-rail__btn left-rail__btn--popout"
        onClick={() => invoke('pop_out_tool', { tool: activeView }).catch(() => {})}
        title="Pop out to Hyprland window (Ctrl+Shift+O)"
        aria-label="Pop out tool"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </button>

      <div class="left-rail__status">
        <span class={connDotClass} title={connTooltip} />
        <span class="left-rail__label" title="Inference mode">{inferenceMode}</span>
        <span class="left-rail__label" title="Memory usage">{rssMb}MB</span>
      </div>
    </nav>
  )
}

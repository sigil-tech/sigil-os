import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'

interface AppConfig {
  id: string
  name: string
  icon: string
  command: string
  args: string[]
  window_class: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

const LEVEL_NAMES = ['Silent', 'Digest', 'Ambient', 'Conversational', 'Autonomous']

export function SettingsPanel({ isOpen, onClose }: Props) {
  const [level, setLevel] = useState(2)
  const [connection, setConnection] = useState<any>(null)
  const [uptime, setUptime] = useState<number | null>(null)
  const [apps, setApps] = useState<AppConfig[]>([])
  const [newApp, setNewApp] = useState({ name: '', icon: '', command: '', args: '', windowClass: '' })

  useEffect(() => {
    if (!isOpen) return
    // Fetch current state
    invoke<any>('daemon_status').then(s => {
      if (s.notifier_level != null) setLevel(s.notifier_level)
      if (s.uptime_seconds != null) setUptime(s.uptime_seconds)
    }).catch(() => {})
    invoke<any>('get_connection_status').then(setConnection).catch(() => {})
    invoke<AppConfig[]>('load_app_config').then(setApps).catch(() => {})
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleLevelChange(e: Event) {
    const newLevel = parseInt((e.target as HTMLSelectElement).value, 10)
    try {
      await invoke('daemon_set_level', { level: newLevel })
      setLevel(newLevel)
    } catch {}
  }

  async function handlePurge() {
    if (!window.confirm('Purge all local data? This cannot be undone.')) return
    try {
      await invoke('daemon_purge')
    } catch {}
  }

  function formatUptime(s: number | null): string {
    if (s == null) return '--'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div class="settings-overlay" onClick={onClose}>
      <div class="settings-panel" onClick={e => e.stopPropagation()}>
        <div class="settings-panel__header">
          <span>Settings</span>
          <button class="settings-panel__close" onClick={onClose}>✕</button>
        </div>

        <div class="settings-panel__section">
          <label class="settings-panel__label">Notification Level</label>
          <select class="settings-panel__dropdown" value={level} onChange={handleLevelChange}>
            {LEVEL_NAMES.map((name, i) => (
              <option key={i} value={i}>{name} ({i})</option>
            ))}
          </select>
        </div>

        <div class="settings-panel__section">
          <label class="settings-panel__label">Connection</label>
          <div style={{ fontSize: '12px', color: '#d1d5db' }}>
            <div>Transport: {connection?.transport ?? '--'}</div>
            <div>Status: {connection?.connected ? 'Connected' : 'Disconnected'}</div>
            <div>Address: {connection?.remote_addr ?? '--'}</div>
            <div>Uptime: {formatUptime(uptime)}</div>
          </div>
        </div>

        <div class="settings-panel__section">
          <label class="settings-panel__label">Rail Apps</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {apps.map((app, i) => (
              <div key={app.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#d1d5db' }}>
                <span style={{ width: '24px', textAlign: 'center' }}>{app.icon}</span>
                <span style={{ flex: 1 }}>{app.name}</span>
                <span style={{ color: '#888', fontSize: '11px' }}>{app.command}</span>
                <button
                  style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '2px 4px' }}
                  onClick={() => {
                    const updated = apps.filter((_, j) => j !== i)
                    setApps(updated)
                    invoke('save_app_config', { apps: updated }).catch(() => {})
                  }}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                class="settings-panel__input"
                placeholder="Name"
                value={newApp.name}
                onInput={e => setNewApp({ ...newApp, name: (e.target as HTMLInputElement).value })}
                style={{ flex: 1 }}
              />
              <input
                class="settings-panel__input"
                placeholder="Icon"
                value={newApp.icon}
                onInput={e => setNewApp({ ...newApp, icon: (e.target as HTMLInputElement).value })}
                style={{ width: '50px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                class="settings-panel__input"
                placeholder="Command"
                value={newApp.command}
                onInput={e => setNewApp({ ...newApp, command: (e.target as HTMLInputElement).value })}
                style={{ flex: 1 }}
              />
              <input
                class="settings-panel__input"
                placeholder="Args (space-separated)"
                value={newApp.args}
                onInput={e => setNewApp({ ...newApp, args: (e.target as HTMLInputElement).value })}
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                class="settings-panel__input"
                placeholder="Window class (optional)"
                value={newApp.windowClass}
                onInput={e => setNewApp({ ...newApp, windowClass: (e.target as HTMLInputElement).value })}
                style={{ flex: 1 }}
              />
              <button
                class="settings-panel__add-btn"
                onClick={() => {
                  if (!newApp.name || !newApp.command) return
                  const app: AppConfig = {
                    id: newApp.name.toLowerCase().replace(/\s+/g, '-'),
                    name: newApp.name,
                    icon: newApp.icon || newApp.name[0],
                    command: newApp.command,
                    args: newApp.args ? newApp.args.split(' ').filter(Boolean) : [],
                    window_class: newApp.windowClass || null,
                  }
                  const updated = [...apps, app]
                  setApps(updated)
                  invoke('save_app_config', { apps: updated }).catch(() => {})
                  setNewApp({ name: '', icon: '', command: '', args: '', windowClass: '' })
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div class="settings-panel__section">
          <button class="settings-panel__purge-btn" onClick={handlePurge}>
            Purge All Data
          </button>
        </div>
      </div>
    </div>
  )
}

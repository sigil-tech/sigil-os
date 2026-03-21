import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const LEVEL_NAMES = ['Silent', 'Digest', 'Ambient', 'Conversational', 'Autonomous']

export function SettingsPanel({ isOpen, onClose }: Props) {
  const [level, setLevel] = useState(2)
  const [connection, setConnection] = useState<any>(null)
  const [uptime, setUptime] = useState<number | null>(null)

  useEffect(() => {
    if (!isOpen) return
    // Fetch current state
    invoke<any>('daemon_status').then(s => {
      if (s.notifier_level != null) setLevel(s.notifier_level)
      if (s.uptime_seconds != null) setUptime(s.uptime_seconds)
    }).catch(() => {})
    invoke<any>('get_connection_status').then(setConnection).catch(() => {})
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
          <button class="settings-panel__purge-btn" onClick={handlePurge}>
            Purge All Data
          </button>
        </div>
      </div>
    </div>
  )
}

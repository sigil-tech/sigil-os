import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../context/AppContext'

interface ContainerSummary {
  id: string
  name: string
  image: string
  status: string
  ports: string
  created: number
}

function statusDotClass(status: string): string {
  if (status.toLowerCase().startsWith('up')) return 'container-dot--running'
  if (status.toLowerCase().startsWith('exit') || status.toLowerCase().startsWith('stop')) return 'container-dot--stopped'
  return 'container-dot--other'
}

export function ContainerView() {
  const { activeView } = useApp()
  const [containers, setContainers] = useState<ContainerSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  async function fetchContainers() {
    try {
      const list = await invoke<ContainerSummary[]>('containers_list')
      setContainers(list)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeView !== 'containers') return
    fetchContainers()
    const id = setInterval(fetchContainers, 10_000)
    return () => clearInterval(id)
  }, [activeView])

  async function handleAction(action: 'start' | 'stop' | 'restart', id: string) {
    try {
      await invoke(`container_${action}`, { id })
      await fetchContainers()
    } catch (e) {
      console.error(`container ${action}:`, e)
    }
  }

  async function toggleLogs(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!logs[id]) {
      try {
        const logText = await invoke<string>('container_logs', { id, tail: 50 })
        setLogs((prev) => ({ ...prev, [id]: logText }))
      } catch {
        setLogs((prev) => ({ ...prev, [id]: '(logs unavailable)' }))
      }
    }
  }

  if (loading) {
    return <div class="view-placeholder">Loading containers...</div>
  }

  if (error) {
    return (
      <div class="container-view">
        <div class="container-view__unavailable">
          <div>
            <div>Docker unavailable — {error}</div>
            <button
              class="container-view__action-btn"
              style={{ marginTop: '12px' }}
              onClick={() => { setLoading(true); setError(null); fetchContainers() }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="container-view">
      <div class="container-view__table">
        <div class="container-view__header-row">
          <span>Name</span>
          <span>Image</span>
          <span>Status</span>
          <span>Uptime</span>
          <span>Ports</span>
          <span>Actions</span>
        </div>

        {containers.length === 0 && (
          <div style={{ padding: '16px', color: '#6b7280', fontSize: '12px' }}>
            No containers found
          </div>
        )}

        {containers.map((c) => (
          <>
            <div
              key={c.id}
              class="container-view__row"
              onClick={() => toggleLogs(c.id)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#9ca3af' }}>{c.image}</span>
              <span>
                <span class={`container-dot ${statusDotClass(c.status)}`} />
                {c.status.split(' ')[0]}
              </span>
              <span style={{ color: '#9ca3af' }}>{c.status.includes('Up') ? c.status.replace('Up ', '') : '—'}</span>
              <span style={{ color: '#9ca3af', fontSize: '11px' }}>{c.ports || '—'}</span>
              <div class="container-view__actions" onClick={(e) => e.stopPropagation()}>
                <button class="container-view__action-btn" onClick={() => handleAction('start', c.id)}>Start</button>
                <button class="container-view__action-btn" onClick={() => handleAction('stop', c.id)}>Stop</button>
                <button class="container-view__action-btn" onClick={() => handleAction('restart', c.id)}>Restart</button>
              </div>
            </div>
            {expandedId === c.id && (
              <div class="container-view__logs">
                {logs[c.id] ?? 'Loading logs...'}
              </div>
            )}
          </>
        ))}
      </div>
    </div>
  )
}

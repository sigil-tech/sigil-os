import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../context/AppContext'

type Tab = 'events' | 'patterns' | 'suggestions'

interface ShellEvent {
  id: number
  kind: string
  source: string
  payload: Record<string, any>
  timestamp: string
}

interface Suggestion {
  id: number
  category: string
  confidence: number
  title: string
  body: string
  action_cmd: string | null
  status: string
  created_at: string
}

export function EventsView() {
  const { activeView } = useApp()
  const [tab, setTab] = useState<Tab>('events')
  const [events, setEvents] = useState<ShellEvent[]>([])
  const [patterns, setPatterns] = useState<Suggestion[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [connected, setConnected] = useState(true)

  const isActive = activeView === 'events'

  useEffect(() => {
    if (!isActive) return

    async function refresh() {
      try {
        const evs = await invoke<ShellEvent[]>('daemon_events')
        setEvents(evs)
        setConnected(true)
      } catch {
        setConnected(false)
      }
      try { setPatterns(await invoke<Suggestion[]>('daemon_patterns')) } catch {}
      try { setSuggestions(await invoke<Suggestion[]>('daemon_suggestions')) } catch {}
    }

    refresh()
    const id = setInterval(refresh, 5_000)
    return () => clearInterval(id)
  }, [isActive])

  const accepted = suggestions.filter((s) => s.status === 'accepted').length
  const total = suggestions.length

  return (
    <div class="events-view">
      <div class="events-view__metrics">
        <div class="events-view__metric">
          <span class="events-view__metric-value">{events.length}</span>
          <span class="events-view__metric-label">Events</span>
        </div>
        <div class="events-view__metric">
          <span class="events-view__metric-value">{patterns.length}</span>
          <span class="events-view__metric-label">Patterns</span>
        </div>
        <div class="events-view__metric">
          <span class="events-view__metric-value">{total > 0 ? Math.round((accepted / total) * 100) : 0}%</span>
          <span class="events-view__metric-label">Accepted</span>
        </div>
      </div>

      {!connected && (
        <div style={{ color: '#ef4444', fontSize: '12px', padding: '0 16px 8px' }}>Daemon unavailable</div>
      )}

      <div class="events-view__tabs" role="tablist">
        {(['events', 'patterns', 'suggestions'] as Tab[]).map((t) => (
          <button
            key={t}
            class={`events-view__tab${tab === t ? ' events-view__tab--active' : ''}`}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div class="events-view__content" role="tabpanel">
        {tab === 'events' && (
          events.length === 0
            ? <div class="events-view__empty">No events yet</div>
            : events.map((e) => (
              <div key={e.id} class="events-view__item">
                <div class="events-view__item-header">
                  <span class="events-view__item-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  <span class="events-view__item-kind">{e.kind}</span>
                  <span class="events-view__item-source">{e.source}</span>
                </div>
                <div class="events-view__item-body">
                  {e.payload?.cmd ?? e.payload?.path ?? JSON.stringify(e.payload).slice(0, 120)}
                </div>
              </div>
            ))
        )}

        {tab === 'patterns' && (
          patterns.length === 0
            ? <div class="events-view__empty">No patterns detected yet</div>
            : patterns.map((p) => (
              <div key={p.id} class="events-view__item">
                <div class="events-view__item-header">
                  <span class="events-view__item-time">{Math.round(p.confidence * 100)}% confidence</span>
                  <span class="events-view__item-kind">{p.category}</span>
                </div>
                <div class="events-view__item-title">{p.title}</div>
                <div class="events-view__item-body">{p.body}</div>
              </div>
            ))
        )}

        {tab === 'suggestions' && (
          suggestions.length === 0
            ? <div class="events-view__empty">No suggestions yet</div>
            : suggestions.map((s) => (
              <div key={s.id} class="events-view__item">
                <div class="events-view__item-header">
                  <span class="events-view__item-time">{new Date(s.created_at).toLocaleTimeString()}</span>
                  <span class={`events-view__item-status events-view__item-status--${s.status}`}>{s.status}</span>
                </div>
                <div class="events-view__item-title">{s.title}</div>
                <div class="events-view__item-body">{s.body}</div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}

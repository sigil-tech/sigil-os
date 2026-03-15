import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../context/AppContext'

type InsightsTab = 'events' | 'patterns' | 'ai-history' | 'prompts' | 'team-insights'

interface ShellEvent {
  id: number
  kind: string
  source: string
  payload: Record<string, any>
  timestamp: string
}

interface Pattern {
  id: number
  category: string
  confidence: number
  title: string
  body: string
  action_cmd: string | null
  status: string
  created_at: string
}

interface Suggestion {
  id: number
  category: string
  confidence: number
  title: string
  body: string
  action_cmd: string
  status: string
  created_at: string
}

export function InsightsView() {
  const { activeView } = useApp()
  const [tab, setTab] = useState<InsightsTab>('events')
  const [events, setEvents] = useState<ShellEvent[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [metrics, setMetrics] = useState({ total: 0, localPct: 0, acceptPct: 0 })
  const [fleetPreview, setFleetPreview] = useState<any>(null)
  const [fleetEnabled, setFleetEnabled] = useState(true)
  const [connected, setConnected] = useState(true)

  const isActive = activeView === 'insights'

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
      try {
        const pats = await invoke<Pattern[]>('daemon_patterns')
        setPatterns(pats)
      } catch {}
      try {
        const sugs = await invoke<Suggestion[]>('daemon_suggestions')
        setSuggestions(sugs)
        // Compute metrics from suggestions
        const aiSugs = sugs.filter((s) => s.category === 'ai_discovery')
        const accepted = sugs.filter((s) => s.status === 'accepted').length
        const total = sugs.length
        setMetrics({
          total: aiSugs.length,
          localPct: total > 0 ? Math.round((aiSugs.length / Math.max(total, 1)) * 100) : 0,
          acceptPct: total > 0 ? Math.round((accepted / total) * 100) : 0,
        })
      } catch {}
    }

    refresh()
    const id = setInterval(refresh, 5_000)
    return () => clearInterval(id)
  }, [isActive])

  async function refreshFleetPreview() {
    try {
      const preview = await invoke('daemon_fleet_preview')
      setFleetPreview(preview)
      setFleetEnabled(true)
    } catch {
      setFleetEnabled(false)
      setFleetPreview(null)
    }
  }

  async function handleFleetOptOut() {
    if (!confirm('Disable fleet reporting? This will clear all pending data.')) return
    try {
      await invoke('daemon_fleet_opt_out')
      setFleetEnabled(false)
      setFleetPreview(null)
    } catch (e) {
      console.error('fleet opt-out:', e)
    }
  }

  async function handlePurge() {
    if (!confirm('Purge all local data? This cannot be undone.')) return
    try {
      await invoke('daemon_purge')
    } catch (e) {
      console.error('purge:', e)
    }
  }

  return (
    <div class="insights-view">
      <div class="insights-view__metrics">
        <div class="insights-view__metric">
          <span class="insights-view__metric-label">Total queries today</span>
          <span class="insights-view__metric-value">{metrics.total}</span>
        </div>
        <div class="insights-view__metric">
          <span class="insights-view__metric-label">Local %</span>
          <span class="insights-view__metric-value">{metrics.localPct}%</span>
        </div>
        <div class="insights-view__metric">
          <span class="insights-view__metric-label">Suggestion acceptance</span>
          <span class="insights-view__metric-value">{metrics.acceptPct}%</span>
        </div>
      </div>

      <div class="insights-view__tabs" role="tablist">
        {(['events', 'patterns', 'ai-history', 'prompts', 'team-insights'] as InsightsTab[]).map((t) => (
          <button
            key={t}
            class={`insights-view__tab${tab === t ? ' insights-view__tab--active' : ''}`}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t === 'ai-history' ? 'AI History' : t === 'team-insights' ? 'Team Insights' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div class="insights-view__content" role="tabpanel">
        {tab === 'events' && (
          <>
            {events.length === 0 && (
              <div style={{ color: '#6b7280', fontSize: '12px' }}>No events yet</div>
            )}
            {events.map((e) => (
              <div key={e.id} class="insights-view__item">
                <div class="insights-view__item-header">
                  <span>{new Date(e.timestamp).toLocaleTimeString()}</span>
                  <span style={{ color: '#9ca3af' }}>{e.kind}</span>
                  <span>{e.source}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#d1d5db' }}>
                  {e.payload?.cmd ?? JSON.stringify(e.payload).slice(0, 120)}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'patterns' && (
          <>
            {patterns.length === 0 && (
              <div style={{ color: '#6b7280', fontSize: '12px' }}>No patterns detected yet</div>
            )}
            {patterns.map((p) => (
              <div key={p.id} class="insights-view__item">
                <div class="insights-view__item-header">
                  <span>Confidence: {Math.round(p.confidence * 100)}%</span>
                </div>
                <div><strong>{p.title}</strong></div>
                <div style={{ color: '#9ca3af', fontSize: '11px' }}>{p.body}</div>
              </div>
            ))}
          </>
        )}

        {tab === 'ai-history' && (
          <>
            {!connected && (
              <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>Daemon unavailable</div>
            )}
            {suggestions.filter((s) => s.category === 'ai_discovery').length === 0 && (
              <div style={{ color: '#6b7280', fontSize: '12px' }}>No AI interactions yet</div>
            )}
            {suggestions.filter((s) => s.category === 'ai_discovery').map((s) => (
              <div key={s.id} class="insights-view__item">
                <div class="insights-view__item-header">
                  <span>{new Date(s.created_at).toLocaleTimeString()}</span>
                  <span style={{ color: s.status === 'accepted' ? '#22c55e' : '#9ca3af' }}>{s.status}</span>
                </div>
                <div><strong>{s.title}</strong></div>
                <div style={{ color: '#9ca3af', fontSize: '11px' }}>{s.body}</div>
              </div>
            ))}
          </>
        )}

        {tab === 'prompts' && (
          <>
            {suggestions.filter((s) => s.category === 'insight').length === 0 && (
              <div style={{ color: '#6b7280', fontSize: '12px' }}>No prompts recorded yet</div>
            )}
            {suggestions.slice(0, 5).map((s) => (
              <div key={s.id} class="insights-view__item">
                <div class="insights-view__item-header">
                  <span>{new Date(s.created_at).toLocaleTimeString()}</span>
                  <span>Confidence: {Math.round(s.confidence * 100)}%</span>
                </div>
                <div style={{ fontSize: '11px', color: '#d1d5db' }}>
                  {s.body.length > 500 ? s.body.slice(0, 500) + '...' : s.body}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'team-insights' && (
          <div>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontWeight: 'bold' }}>Status: </span>
              <span style={{
                color: fleetEnabled ? '#22c55e' : '#ef4444',
                fontWeight: 'bold',
              }}>
                {fleetEnabled ? 'Opted In' : 'Opted Out'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button onClick={refreshFleetPreview} style={{ fontSize: '12px' }}>
                Refresh Preview
              </button>
              {fleetEnabled && (
                <button onClick={handleFleetOptOut} style={{ fontSize: '12px', color: '#ef4444' }}>
                  Opt Out
                </button>
              )}
            </div>

            {fleetPreview ? (
              <pre style={{
                background: '#1e1e1e',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '11px',
                overflow: 'auto',
                maxHeight: '300px',
              }}>
                {JSON.stringify(fleetPreview, null, 2)}
              </pre>
            ) : (
              <div style={{ color: '#6b7280', fontSize: '12px' }}>
                {fleetEnabled
                  ? 'Click "Refresh Preview" to see what data will be sent.'
                  : 'Fleet reporting is disabled.'}
              </div>
            )}
          </div>
        )}
      </div>

      <button class="insights-view__purge-btn" onClick={handlePurge}>
        Purge all local data
      </button>
    </div>
  )
}

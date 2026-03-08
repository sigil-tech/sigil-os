import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../context/AppContext'

type InsightsTab = 'events' | 'patterns' | 'ai-history' | 'prompts' | 'team-insights'

interface ShellEvent {
  id: string
  timestamp: number
  command: string
  exit_code: number
  directory: string
}

interface Pattern {
  id: string
  description: string
  confidence: number
}

export function InsightsView() {
  const { activeView } = useApp()
  const [tab, setTab] = useState<InsightsTab>('events')
  const [events, setEvents] = useState<ShellEvent[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [metrics] = useState({ total: 0, localPct: 0, acceptPct: 0 })
  const [fleetPreview, setFleetPreview] = useState<any>(null)
  const [fleetEnabled, setFleetEnabled] = useState(true)

  const isActive = activeView === 'insights'

  useEffect(() => {
    if (!isActive) return

    async function refresh() {
      try {
        const evs = await invoke<ShellEvent[]>('daemon_events')
        setEvents(evs)
      } catch {}
      try {
        const pats = await invoke<Pattern[]>('daemon_patterns')
        setPatterns(pats)
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
      await invoke('daemon_feedback', { kind: 'purge', detail: null })
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
                  <span>{new Date(e.timestamp * 1000).toLocaleTimeString()}</span>
                  <span style={{ color: e.exit_code === 0 ? '#22c55e' : '#ef4444' }}>
                    exit {e.exit_code}
                  </span>
                  <span>{e.directory}</span>
                </div>
                <div>{e.command}</div>
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
                <div>{p.description}</div>
              </div>
            ))}
          </>
        )}

        {tab === 'ai-history' && (
          <div style={{ color: '#6b7280', fontSize: '12px' }}>
            AI interaction history — populated after daemon connectivity (Issue #35)
          </div>
        )}

        {tab === 'prompts' && (
          <div style={{ color: '#6b7280', fontSize: '12px' }}>
            Prompt previews — populated after Issue #35
          </div>
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

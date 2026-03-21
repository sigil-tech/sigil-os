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

interface DaemonHealth {
  rss_mb: number | null
  uptime_seconds: number | null
  events_today: number | null
  inference_mode: string | null
  notifier_level: number | null
  acceptance_rate: number | null
}

function formatUptime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export function InsightsView() {
  const { activeView } = useApp()
  const [tab, setTab] = useState<InsightsTab>('events')
  const [events, setEvents] = useState<ShellEvent[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [health, setHealth] = useState<DaemonHealth>({
    rss_mb: null,
    uptime_seconds: null,
    events_today: null,
    inference_mode: null,
    notifier_level: null,
    acceptance_rate: null,
  })
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

      let acceptanceRate: number | null = null
      try {
        const sugs = await invoke<Suggestion[]>('daemon_suggestions')
        setSuggestions(sugs)
        const accepted = sugs.filter((s) => s.status === 'accepted').length
        const total = sugs.length
        acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : null
      } catch {}

      let statusRss: number | null = null
      let statusUptime: number | null = null
      let statusEventsToday: number | null = null
      try {
        const status = await invoke<Record<string, any>>('daemon_status')
        statusRss = typeof status.rss_mb === 'number' ? status.rss_mb : null
        statusUptime = typeof status.uptime_seconds === 'number' ? status.uptime_seconds : null
        statusEventsToday = typeof status.events_today === 'number' ? status.events_today : null
      } catch {}

      let inferenceMode: string | null = null
      let notifierLevel: number | null = null
      try {
        const config = await invoke<Record<string, any>>('daemon_config')
        inferenceMode = typeof config.inference_mode === 'string' ? config.inference_mode : null
        notifierLevel = typeof config.notifier_level === 'number' ? config.notifier_level : null
      } catch {}

      setHealth({
        rss_mb: statusRss,
        uptime_seconds: statusUptime,
        events_today: statusEventsToday,
        inference_mode: inferenceMode,
        notifier_level: notifierLevel,
        acceptance_rate: acceptanceRate,
      })
    }

    refresh()
    const id = setInterval(refresh, 3_000)
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
      <div class="insights-view__health-bar">
        <div class="insights-view__health-metric">
          <div class="insights-view__health-metric-label">RSS (MB)</div>
          <div class="insights-view__health-metric-value">
            {health.rss_mb !== null ? health.rss_mb.toFixed(1) : '--'}
          </div>
        </div>
        <div class="insights-view__health-metric">
          <div class="insights-view__health-metric-label">Uptime</div>
          <div class="insights-view__health-metric-value">
            {formatUptime(health.uptime_seconds)}
          </div>
        </div>
        <div class="insights-view__health-metric">
          <div class="insights-view__health-metric-label">Inference</div>
          <div class="insights-view__health-metric-value">
            {health.inference_mode ?? '--'}
          </div>
        </div>
        <div class="insights-view__health-metric">
          <div class="insights-view__health-metric-label">Events Today</div>
          <div class="insights-view__health-metric-value">
            {health.events_today !== null ? health.events_today : '--'}
          </div>
        </div>
        <div class="insights-view__health-metric">
          <div class="insights-view__health-metric-label">Accept Rate</div>
          <div class="insights-view__health-metric-value">
            {health.acceptance_rate !== null ? `${health.acceptance_rate}%` : '--'}
          </div>
        </div>
        <div class="insights-view__health-metric">
          <div class="insights-view__health-metric-label">Notif Level</div>
          <div class="insights-view__health-metric-value">
            {health.notifier_level !== null ? health.notifier_level : '--'}
          </div>
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
                  <span class="insights-view__category-badge">{p.category}</span>
                  <span>Confidence: {Math.round(p.confidence * 100)}%</span>
                  <span>{new Date(p.created_at).toISOString()}</span>
                </div>
                <div><strong>{p.title}</strong></div>
                <div style={{ color: '#9ca3af', fontSize: '11px' }}>{p.body}</div>
                <div class="insights-view__confidence-bar">
                  <div
                    class="insights-view__confidence-fill"
                    style={{ width: `${Math.round(p.confidence * 100)}%` }}
                  />
                </div>
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
            {suggestions.filter((s) => s.category === 'ai_discovery').map((s) => {
              const statusClass =
                s.status === 'accepted' ? 'insights-view__status--accepted' :
                s.status === 'dismissed' ? 'insights-view__status--dismissed' :
                s.status === 'ignored' ? 'insights-view__status--ignored' :
                'insights-view__status--pending'
              return (
                <div key={s.id} class="insights-view__item">
                  <div class="insights-view__item-header">
                    <span>{new Date(s.created_at).toLocaleTimeString()}</span>
                    <span class={statusClass}>{s.status}</span>
                  </div>
                  <div><strong>{s.title}</strong></div>
                  <div style={{ color: '#9ca3af', fontSize: '11px' }}>{s.body}</div>
                </div>
              )
            })}
          </>
        )}

        {tab === 'prompts' && (
          <>
            {suggestions.filter((s) => s.category === 'insight').length === 0 && (
              <div style={{ color: '#6b7280', fontSize: '12px' }}>No prompts recorded yet</div>
            )}
            {suggestions.slice(0, 5).map((s) => {
              const statusClass =
                s.status === 'accepted' ? 'insights-view__status--accepted' :
                s.status === 'dismissed' ? 'insights-view__status--dismissed' :
                s.status === 'ignored' ? 'insights-view__status--ignored' :
                'insights-view__status--pending'
              return (
                <div key={s.id} class="insights-view__item">
                  <div class="insights-view__item-header">
                    <span>{new Date(s.created_at).toLocaleTimeString()}</span>
                    <span>Confidence: {Math.round(s.confidence * 100)}%</span>
                    <span class={statusClass}>{s.status}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#d1d5db' }}>
                    {s.body.length > 500 ? s.body.slice(0, 500) + '...' : s.body}
                  </div>
                </div>
              )
            })}
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

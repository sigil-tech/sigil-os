import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'

interface DaemonStatus {
  status?: string
  version?: string
  events_today?: number
  uptime_seconds?: number
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function GreetingCard() {
  const [status, setStatus] = useState<DaemonStatus | null>(null)
  const [files, setFiles] = useState<{ path: string; count: number }[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])

  useEffect(() => {
    invoke<DaemonStatus>('daemon_status').then(setStatus).catch(() => {})
    invoke<{ path: string; count: number }[]>('daemon_files').then(setFiles).catch(() => {})
    invoke<any[]>('daemon_suggestions').then(setSuggestions).catch(() => {})
  }, [])

  const greeting = getGreeting()
  const hasData = status?.events_today != null && status.events_today > 0

  return (
    <div class="greeting-card">
      <h1 class="greeting-card__title">{greeting}, Nick.</h1>
      {hasData ? (
        <div class="greeting-card__summary">
          {status!.events_today! > 0 && (
            <p>{status!.events_today} events tracked today.</p>
          )}
          {files.length > 0 && (
            <p>
              Recent files:{' '}
              {files.slice(0, 3).map((f) => f.path.split('/').pop()).join(', ')}
              {files.length > 3 && ` and ${files.length - 3} more`}
            </p>
          )}
          {suggestions.length > 0 && (
            <p>{suggestions.length} pending suggestion{suggestions.length !== 1 ? 's' : ''}.</p>
          )}
        </div>
      ) : (
        <div class="greeting-card__summary">
          <p>Welcome to Sigil. What are we working on today?</p>
        </div>
      )}
    </div>
  )
}

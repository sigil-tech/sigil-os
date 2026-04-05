import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { useApp, type ViewId } from '../context/AppContext'

interface AppConfig {
  id: string
  name: string
  icon: string
  command: string
  args: string[]
  window_class: string | null
  mode: 'inline' | 'external'
}

const ICONS: Record<string, preact.ComponentChildren> = {
  terminal: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  code: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  git: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  ),
  docker: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="10" width="20" height="10" rx="2" />
      <rect x="6" y="6" width="4" height="4" />
      <rect x="10" y="2" width="4" height="4" />
      <rect x="14" y="6" width="4" height="4" />
    </svg>
  ),
  browser: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  events: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  editor: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="9" y1="9" x2="21" y2="9" />
    </svg>
  ),
}

function AppIcon({ icon }: { icon: string }) {
  if (ICONS[icon]) return <>{ICONS[icon]}</>
  return <span style={{ fontSize: '18px' }}>{icon}</span>
}

/** Map app IDs to inline ViewIds */
const INLINE_VIEW_MAP: Record<string, ViewId> = {
  terminal: 'terminal',
  git: 'git',
  browser: 'browser',
  events: 'events',
  editor: 'editor',
}

export function AppRail() {
  const { activeView, setActiveView, cwd } = useApp()
  const [apps, setApps] = useState<AppConfig[]>([])

  useEffect(() => {
    invoke<AppConfig[]>('load_app_config').then(setApps).catch(() => {})
  }, [])

  function handleAppClick(app: AppConfig) {
    if (app.mode === 'inline') {
      const viewId = INLINE_VIEW_MAP[app.id]
      if (viewId) {
        setActiveView(viewId)
      }
    } else {
      invoke('focus_or_launch', {
        command: app.command,
        args: app.args,
        cwd: cwd || null,
        windowClass: app.window_class,
      }).catch(() => {})
    }
  }

  function isActive(app: AppConfig): boolean {
    if (app.mode === 'inline') {
      const viewId = INLINE_VIEW_MAP[app.id]
      return viewId === activeView
    }
    return false
  }

  return (
    <nav class="left-rail">
      <div class="left-rail__views">
        <button
          class={`left-rail__btn ${activeView === 'home' ? 'left-rail__btn--active' : ''}`}
          onClick={() => setActiveView('home')}
          title="Home"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>

        {apps.map((app) => (
          <button
            key={app.id}
            class={`left-rail__btn ${isActive(app) ? 'left-rail__btn--active' : ''}`}
            onClick={() => handleAppClick(app)}
            title={app.name}
          >
            <AppIcon icon={app.icon} />
          </button>
        ))}
      </div>

      <div class="left-rail__bottom">
        <button
          class="left-rail__btn"
          onClick={() => setActiveView('settings')}
          title="Settings (Ctrl+,)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </nav>
  )
}

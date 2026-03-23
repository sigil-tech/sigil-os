import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../context/AppContext'

interface PluginInfo {
  name: string
  enabled: boolean
  binary: string
  daemon: boolean
  health: string
  last_poll: string
}

interface EditorInfo {
  id: string
  name: string
  path: string
}

export function ExtensionsView() {
  const { activeView } = useApp()
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [editors, setEditors] = useState<EditorInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (activeView !== 'extensions') return

    async function load() {
      setLoading(true)
      try {
        // plugin-status is a daemon socket method, not a Tauri command yet
        // Use daemon_status to check if daemon is alive, plugins TBD
        const status: PluginInfo[] = await invoke<any>('daemon_status')
          .then(() => []) // plugin list not yet wired
          .catch(() => [])
        setPlugins(status)
      } catch {}
      try {
        const eds = await invoke<EditorInfo[]>('detect_editors')
        setEditors(eds)
      } catch {}
      setLoading(false)
    }

    load()
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [activeView])

  if (loading) {
    return <div class="view-placeholder">Loading extensions...</div>
  }

  return (
    <div class="extensions-view">
      <div class="extensions-view__section">
        <div class="extensions-view__section-title">Installed Editors</div>
        <div class="extensions-view__list">
          {editors.length === 0 && (
            <div class="extensions-view__empty">No editors detected on PATH</div>
          )}
          {editors.map((e) => (
            <div key={e.id} class="extensions-view__item">
              <div class="extensions-view__item-name">{e.name}</div>
              <div class="extensions-view__item-detail">{e.path}</div>
              <button
                class="extensions-view__item-action"
                onClick={() => invoke('launch_external_editor', { editor: e.id, path: null }).catch(() => {})}
              >
                Launch
              </button>
            </div>
          ))}
        </div>
      </div>

      <div class="extensions-view__section">
        <div class="extensions-view__section-title">Sigil Daemon Plugins</div>
        <div class="extensions-view__list">
          {plugins.length === 0 && (
            <div class="extensions-view__empty">
              No plugins installed. Plugins extend sigild with custom event sources and actions.
            </div>
          )}
          {plugins.map((p) => (
            <div key={p.name} class="extensions-view__item">
              <div class="extensions-view__item-name">
                <span
                  class={`extensions-view__dot extensions-view__dot--${p.health === 'ok' ? 'ok' : 'err'}`}
                />
                {p.name}
              </div>
              <div class="extensions-view__item-detail">
                {p.binary} {p.daemon ? '(daemon)' : '(one-shot)'}
              </div>
              <div class="extensions-view__item-detail">
                Status: {p.health} | Enabled: {p.enabled ? 'yes' : 'no'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

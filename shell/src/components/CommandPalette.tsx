import { useEffect, useRef, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'

interface PaletteItem {
  id: string
  label: string
  description?: string
  action: () => void | Promise<void>
}

/** Subsequence fuzzy match — returns score > 0 if all chars of query appear in label in order. */
function fuzzyScore(query: string, label: string): number {
  const q = query.toLowerCase()
  const l = label.toLowerCase()
  let qi = 0
  let score = 0
  for (let li = 0; li < l.length && qi < q.length; li++) {
    if (l[li] === q[qi]) {
      score += 1
      qi++
    }
  }
  return qi === q.length ? score : 0
}

interface AppConfig {
  id: string
  name: string
  icon: string
  command: string
  args: string[]
  window_class: string | null
}

export function CommandPalette() {
  const { isPaletteOpen, setIsPaletteOpen, setActiveView } = useApp()
  const { addToast } = useToast()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [dynamicItems, setDynamicItems] = useState<PaletteItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Build static items
  const staticItems: PaletteItem[] = [
    {
      id: 'view-home',
      label: 'Go Home',
      description: 'Landing screen',
      action: () => setActiveView('home'),
    },
    {
      id: 'cmd-trigger-summary',
      label: 'Trigger Analysis Cycle',
      description: 'sigilctl trigger-summary',
      action: async () => {
        try {
          await invoke('daemon_trigger_summary')
          addToast('Analysis cycle triggered', 'success')
        } catch {
          addToast('Failed to trigger analysis', 'error')
        }
      },
    },
    {
      id: 'cmd-set-level-0',
      label: 'Set Level: Silent (0)',
      description: 'Daemon autonomy level',
      action: async () => {
        try {
          await invoke('daemon_set_level', { level: 0 })
          addToast('Level set to Silent (0)', 'success')
        } catch {
          addToast('Failed to set level', 'error')
        }
      },
    },
    {
      id: 'cmd-set-level-1',
      label: 'Set Level: Digest (1)',
      description: 'Daemon autonomy level',
      action: async () => {
        try {
          await invoke('daemon_set_level', { level: 1 })
          addToast('Level set to Digest (1)', 'success')
        } catch {
          addToast('Failed to set level', 'error')
        }
      },
    },
    {
      id: 'cmd-set-level-2',
      label: 'Set Level: Ambient (2)',
      description: 'Daemon autonomy level',
      action: async () => {
        try {
          await invoke('daemon_set_level', { level: 2 })
          addToast('Level set to Ambient (2)', 'success')
        } catch {
          addToast('Failed to set level', 'error')
        }
      },
    },
    {
      id: 'cmd-set-level-3',
      label: 'Set Level: Conversational (3)',
      description: 'Daemon autonomy level',
      action: async () => {
        try {
          await invoke('daemon_set_level', { level: 3 })
          addToast('Level set to Conversational (3)', 'success')
        } catch {
          addToast('Failed to set level', 'error')
        }
      },
    },
    {
      id: 'cmd-set-level-4',
      label: 'Set Level: Autonomous (4)',
      description: 'Daemon autonomy level',
      action: async () => {
        try {
          await invoke('daemon_set_level', { level: 4 })
          addToast('Level set to Autonomous (4)', 'success')
        } catch {
          addToast('Failed to set level', 'error')
        }
      },
    },
    {
      id: 'cmd-undo',
      label: 'Undo Last Action',
      description: 'sigilctl undo',
      action: async () => {
        try {
          const result = await invoke<{ undone?: string }>('daemon_undo')
          if (result?.undone) {
            addToast(`Undone: ${result.undone}`, 'success')
          } else {
            addToast('Nothing to undo', 'info')
          }
        } catch {
          addToast('Nothing to undo', 'info')
        }
      },
    },
    {
      id: 'cmd-purge',
      label: 'Purge All Data',
      description: 'Danger: deletes all daemon data',
      action: async () => {
        if (!window.confirm('Purge all daemon data? This cannot be undone.')) return
        try {
          await invoke('daemon_purge')
          addToast('All data purged', 'success')
        } catch {
          addToast('Failed to purge data', 'error')
        }
      },
    },
    {
      id: 'cmd-view-config',
      label: 'View Daemon Config',
      description: 'Show current config',
      action: async () => {
        try {
          const config = await invoke<Record<string, unknown>>('daemon_config')
          await emit('ai-response', { text: '```json\n' + JSON.stringify(config, null, 2) + '\n```' })
          addToast('Config loaded', 'success')
        } catch {
          addToast('Failed to load config', 'error')
        }
      },
    },
    {
      id: 'cmd-view-status',
      label: 'View Daemon Status',
      description: 'Show daemon status',
      action: async () => {
        try {
          const status = await invoke<Record<string, unknown>>('daemon_status')
          await emit('ai-response', { text: '```json\n' + JSON.stringify(status, null, 2) + '\n```' })
          addToast('Status loaded', 'success')
        } catch {
          addToast('Failed to load status', 'error')
        }
      },
    },
    {
      id: 'cmd-events',
      label: 'sigilctl events',
      description: 'Show recent events',
      action: () => emit('execute-action', { cmd: 'sigilctl events' }).catch(() => {}),
    },
    {
      id: 'cmd-actions',
      label: 'sigilctl actions',
      description: 'Show undoable actions',
      action: () => emit('execute-action', { cmd: 'sigilctl actions' }).catch(() => {}),
    },
    {
      id: 'cmd-suggestions',
      label: 'View suggestions',
      description: 'sigilctl suggestions',
      action: () => emit('execute-action', { cmd: 'sigilctl suggestions' }).catch(() => {}),
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Ctrl+,',
      action: () => { emit('open-settings', {}) },
    },
  ]

  // Load dynamic items on open
  useEffect(() => {
    if (!isPaletteOpen) return
    setQuery('')
    setSelected(0)

    async function load() {
      const items: PaletteItem[] = []

      // Load configured rail apps as launchable commands
      try {
        const apps = await invoke<AppConfig[]>('load_app_config')
        for (const app of apps) {
          items.push({
            id: `app-${app.id}`,
            label: `Launch ${app.name}`,
            description: app.command,
            action: () => { invoke('focus_or_launch', {
              command: app.command, args: app.args, cwd: null, windowClass: app.window_class,
            }).catch(() => {}) },
          })
        }
      } catch { /* apps config may not exist */ }

      try {
        const files = await invoke<{ path: string; count: number }[]>('daemon_files')
        for (const f of files.slice(0, 10)) {
          items.push({
            id: `file-${f.path}`,
            label: f.path.split('/').pop() || f.path,
            description: f.path,
            action: () => emit('execute-action', { cmd: `nvim ${f.path}` }).catch(() => {}),
          })
        }
      } catch { /* daemon may be offline */ }

      try {
        const cmds = await invoke<{ cmd: string; count: number }[]>('daemon_commands')
        for (const c of cmds.slice(0, 10)) {
          items.push({
            id: `cmd-recent-${c.cmd}`,
            label: c.cmd,
            description: `Run: ${c.cmd}`,
            action: () => emit('execute-action', { cmd: c.cmd }).catch(() => {}),
          })
        }
      } catch { /* daemon may be offline */ }

      setDynamicItems(items)
    }
    load()

    // Focus input after render
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [isPaletteOpen])

  if (!isPaletteOpen) return null

  const allItems = [...staticItems, ...dynamicItems]
  const filtered = query
    ? allItems
        .map((item) => ({ item, score: fuzzyScore(query, item.label) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.item)
    : allItems

  function execute(item: PaletteItem) {
    setIsPaletteOpen(false)
    item.action()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsPaletteOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, filtered.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selected]) execute(filtered[selected])
      return
    }
  }

  return (
    <div class="palette-overlay" onClick={() => setIsPaletteOpen(false)}>
      <div class="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          class="palette__input"
          type="text"
          value={query}
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value)
            setSelected(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          autocomplete="off"
          spellcheck={false}
        />
        <div class="palette__list">
          {filtered.map((item, i) => (
            <div
              key={item.id}
              class={`palette__item${i === selected ? ' palette__item--selected' : ''}`}
              onClick={() => execute(item)}
              onMouseEnter={() => setSelected(i)}
            >
              <span class="palette__item-label">{item.label}</span>
              {item.description && (
                <span class="palette__item-desc">{item.description}</span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div class="palette__empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  )
}

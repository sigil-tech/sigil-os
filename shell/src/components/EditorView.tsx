import { useState, useEffect, useRef } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { FileTree } from './FileTree'
import { CodeEditor } from './CodeEditor'
import '@xterm/xterm/css/xterm.css'

type EditorMode = 'builtin' | 'neovim' | 'external'

interface EditorPref {
  mode: EditorMode
  externalCmd: string // 'code', 'codium', 'idea', etc.
}

interface OpenTab {
  path: string
  name: string
  content: string
  dirty: boolean
}

const STORAGE_KEY = 'sigil-editor-pref'

function loadPref(): EditorPref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { mode: 'builtin', externalCmd: 'code' }
}

function savePref(pref: EditorPref) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pref))
}

export function EditorView() {
  const [rootPath, setRootPath] = useState('')
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [pref, setPref] = useState<EditorPref>(loadPref)
  const [showPrefBar, setShowPrefBar] = useState(false)
  const [availableEditors, setAvailableEditors] = useState<{ id: string; name: string }[]>([])

  // Neovim PTY state
  const nvimContainerRef = useRef<HTMLDivElement>(null)
  const nvimTermRef = useRef<Terminal | null>(null)
  const nvimPtyIdRef = useRef<string | null>(null)
  const [nvimReady, setNvimReady] = useState(false)

  useEffect(() => {
    invoke<string>('get_cwd').then(setRootPath).catch(() => setRootPath('/home'))
    invoke<{ id: string; name: string }[]>('detect_editors')
      .then(setAvailableEditors)
      .catch(() => {})
  }, [])

  // Spawn neovim PTY when mode is neovim
  useEffect(() => {
    if (pref.mode !== 'neovim' || !nvimContainerRef.current || nvimTermRef.current) return

    const term = new Terminal({
      cursorStyle: 'block',
      fontSize: 16,
      fontFamily: '"Fira Code", Consolas, "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#6366f1',
        cursorAccent: '#0a0a0a',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(nvimContainerRef.current)
    fitAddon.fit()
    nvimTermRef.current = term

    ;(async () => {
      try {
        const ptyId = await invoke<string>('spawn_editor', { filePath: null })
        nvimPtyIdRef.current = ptyId
        await listen<string>(`pty-output-${ptyId}`, (event) => {
          term.write(event.payload)
        })
        term.onData((data) => {
          invoke('pty_write', { ptyId, data }).catch(() => {})
        })
        setNvimReady(true)
        await invoke('pty_write', { ptyId, data: '\n' }).catch(() => {})
      } catch (err) {
        term.writeln(`\x1b[31mFailed to spawn neovim: ${err}\x1b[0m`)
        setNvimReady(true)
      }
    })()

    return () => {
      term.dispose()
      nvimTermRef.current = null
      nvimPtyIdRef.current = null
      setNvimReady(false)
    }
  }, [pref.mode])

  async function openFile(path: string) {
    if (pref.mode === 'external') {
      // Launch external editor
      await invoke('launch_external_editor', { editor: pref.externalCmd, path }).catch((e: any) =>
        console.error('Failed to launch editor:', e)
      )
      return
    }

    if (pref.mode === 'neovim' && nvimPtyIdRef.current) {
      // Send :e <path> to neovim
      await invoke('pty_write', {
        ptyId: nvimPtyIdRef.current,
        data: `\x1b:e ${path}\n`,
      }).catch(() => {})
      return
    }

    // Builtin mode — CodeMirror tabs
    if (tabs.find((t) => t.path === path)) {
      setActiveTab(path)
      return
    }
    try {
      const content = await invoke<string>('read_file', { path })
      const name = path.split('/').pop() || path
      setTabs((prev) => [...prev, { path, name, content, dirty: false }])
      setActiveTab(path)
    } catch (e) {
      console.error('Failed to open file:', e)
    }
  }

  function closeTab(path: string) {
    const tab = tabs.find((t) => t.path === path)
    if (tab?.dirty && !window.confirm(`${tab.name} has unsaved changes. Close anyway?`)) return
    setTabs((prev) => prev.filter((t) => t.path !== path))
    if (activeTab === path) {
      const remaining = tabs.filter((t) => t.path !== path)
      setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1].path : null)
    }
  }

  async function saveFile(path: string, content: string) {
    try {
      await invoke('write_file', { path, content })
      setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, content, dirty: false } : t)))
    } catch (e) {
      console.error('Failed to save:', e)
    }
  }

  function changePref(mode: EditorMode, externalCmd?: string) {
    const newPref = { mode, externalCmd: externalCmd ?? pref.externalCmd }
    setPref(newPref)
    savePref(newPref)
  }

  const currentTab = tabs.find((t) => t.path === activeTab)

  return (
    <div class="editor-view">
      <div class="editor-view__sidebar">
        <div class="editor-view__pref-toggle">
          <button
            class="editor-view__pref-btn"
            onClick={() => setShowPrefBar(!showPrefBar)}
            title="Editor preference"
          >
            {pref.mode === 'builtin' ? 'Built-in' : pref.mode === 'neovim' ? 'Neovim' : pref.externalCmd}
            <span style={{ marginLeft: '4px', opacity: 0.5 }}>&#9662;</span>
          </button>
          {showPrefBar && (
            <div class="editor-view__pref-menu">
              <button
                class={`editor-view__pref-option ${pref.mode === 'builtin' ? 'editor-view__pref-option--active' : ''}`}
                onClick={() => { changePref('builtin'); setShowPrefBar(false) }}
              >
                Built-in (CodeMirror)
              </button>
              <button
                class={`editor-view__pref-option ${pref.mode === 'neovim' ? 'editor-view__pref-option--active' : ''}`}
                onClick={() => { changePref('neovim'); setShowPrefBar(false) }}
              >
                Neovim
              </button>
              {availableEditors
                .filter((e) => e.id !== 'nvim' && e.id !== 'vim')
                .map((e) => (
                  <button
                    key={e.id}
                    class={`editor-view__pref-option ${pref.mode === 'external' && pref.externalCmd === e.id ? 'editor-view__pref-option--active' : ''}`}
                    onClick={() => { changePref('external', e.id); setShowPrefBar(false) }}
                  >
                    {e.name}
                  </button>
                ))}
            </div>
          )}
        </div>
        <FileTree rootPath={rootPath} onFileSelect={openFile} />
      </div>

      <div class="editor-view__main">
        {/* Builtin mode: CodeMirror tabs */}
        {pref.mode === 'builtin' && (
          <>
            {tabs.length > 0 && (
              <div class="editor-view__tabs">
                {tabs.map((tab) => (
                  <div
                    key={tab.path}
                    class={`editor-view__tab ${tab.path === activeTab ? 'editor-view__tab--active' : ''}`}
                    onClick={() => setActiveTab(tab.path)}
                    title={tab.path}
                  >
                    <span>
                      {tab.dirty ? '● ' : ''}
                      {tab.name}
                    </span>
                    <button
                      class="editor-view__tab-close"
                      onClick={(e: Event) => {
                        e.stopPropagation()
                        closeTab(tab.path)
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div class="editor-view__content">
              {currentTab ? (
                <CodeEditor
                  key={currentTab.path}
                  content={currentTab.content}
                  filePath={currentTab.path}
                  onSave={(content: string) => saveFile(currentTab.path, content)}
                  onChange={(dirty: boolean) =>
                    setTabs((prev) =>
                      prev.map((t) => (t.path === currentTab.path ? { ...t, dirty } : t))
                    )
                  }
                />
              ) : (
                <div class="editor-view__empty">
                  <div>Open a file from the tree</div>
                  <div style={{ marginTop: '8px', opacity: 0.5 }}>Ctrl+S to save</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Neovim mode: embedded PTY */}
        {pref.mode === 'neovim' && (
          <div class="editor-view__content">
            <div
              ref={nvimContainerRef}
              class="editor-view__nvim"
              style={{ display: nvimReady ? 'block' : 'none', height: '100%' }}
            />
            {!nvimReady && <div class="view-placeholder">Starting Neovim...</div>}
          </div>
        )}

        {/* External mode: instructions */}
        {pref.mode === 'external' && (
          <div class="editor-view__content">
            <div class="editor-view__empty">
              <div>Click a file in the tree to open it in {pref.externalCmd}</div>
              <div style={{ marginTop: '8px', opacity: 0.5 }}>
                Files open in an external window
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

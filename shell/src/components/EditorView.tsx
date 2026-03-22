import { useState, useEffect } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { FileTree } from './FileTree'
import { CodeEditor } from './CodeEditor'

interface OpenTab {
  path: string
  name: string
  content: string
  dirty: boolean
}

export function EditorView() {
  const [rootPath, setRootPath] = useState('')
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)

  useEffect(() => {
    invoke<string>('get_cwd').then(setRootPath).catch(() => setRootPath('/home'))
  }, [])

  async function openFile(path: string) {
    // If already open, just switch to it
    if (tabs.find(t => t.path === path)) {
      setActiveTab(path)
      return
    }
    try {
      const content = await invoke<string>('read_file', { path })
      const name = path.split('/').pop() || path
      setTabs(prev => [...prev, { path, name, content, dirty: false }])
      setActiveTab(path)
    } catch (e) {
      console.error('Failed to open file:', e)
    }
  }

  function closeTab(path: string) {
    const tab = tabs.find(t => t.path === path)
    if (tab?.dirty && !window.confirm(`${tab.name} has unsaved changes. Close anyway?`)) return
    setTabs(prev => prev.filter(t => t.path !== path))
    if (activeTab === path) {
      const remaining = tabs.filter(t => t.path !== path)
      setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1].path : null)
    }
  }

  async function saveFile(path: string, content: string) {
    try {
      await invoke('write_file', { path, content })
      setTabs(prev => prev.map(t => t.path === path ? { ...t, content, dirty: false } : t))
    } catch (e) {
      console.error('Failed to save:', e)
    }
  }

  const currentTab = tabs.find(t => t.path === activeTab)

  return (
    <div class="editor-view">
      <div class="editor-view__sidebar">
        <FileTree rootPath={rootPath} onFileSelect={openFile} />
      </div>
      <div class="editor-view__main">
        {tabs.length > 0 && (
          <div class="editor-view__tabs">
            {tabs.map(tab => (
              <div
                key={tab.path}
                class={`editor-view__tab ${tab.path === activeTab ? 'editor-view__tab--active' : ''}`}
                onClick={() => setActiveTab(tab.path)}
                title={tab.path}
              >
                <span>{tab.dirty ? '● ' : ''}{tab.name}</span>
                <button
                  class="editor-view__tab-close"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.path) }}
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
              onChange={(dirty: boolean) => setTabs(prev =>
                prev.map(t => t.path === currentTab.path ? { ...t, dirty } : t)
              )}
            />
          ) : (
            <div class="editor-view__empty">
              <div>Open a file from the tree</div>
              <div style={{ marginTop: '8px', opacity: 0.5 }}>Ctrl+S to save</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

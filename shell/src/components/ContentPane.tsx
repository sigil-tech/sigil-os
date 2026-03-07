import { useEffect, useRef, useState } from 'preact/hooks'
import { listen } from '@tauri-apps/api/event'
import { useApp } from '../context/AppContext'
import { TerminalView } from './TerminalView'
import { EditorView } from './EditorView'
import { BrowserView } from './BrowserView'
import { GitView } from './GitView'
import { ContainerView } from './ContainerView'
import { InsightsView } from './InsightsView'

interface AIResponse {
  response: string
  routing: 'local' | 'cloud'
}

interface Props {
  onTerminalPtyReady?: (ptyId: string) => void
}

export function ContentPane({ onTerminalPtyReady }: Props) {
  const { activeView } = useApp()
  const [aiOverlay, setAiOverlay] = useState<AIResponse | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)

  // Register Ctrl+\ for split-pane (stub)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault()
        console.log('split-pane: not yet implemented')
      }
      if (e.key === 'Escape' && aiOverlay) {
        setAiOverlay(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [aiOverlay])

  // Listen for AI responses (Issue #35)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<AIResponse>('ai-response', (event) => {
      setAiOverlay(event.payload)
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  return (
    <div class="content-pane" ref={paneRef}>
      {/* Keep-alive pattern: mount all views, toggle via CSS display:none so PTYs stay alive */}
      <div class="content-pane__view" style={{ display: activeView === 'terminal' ? 'flex' : 'none', opacity: activeView === 'terminal' ? 1 : 0 }}>
        <TerminalView onPtyReady={onTerminalPtyReady} />
      </div>
      <div class="content-pane__view" style={{ display: activeView === 'editor' ? 'flex' : 'none', opacity: activeView === 'editor' ? 1 : 0 }}>
        <EditorView />
      </div>
      <div class="content-pane__view" style={{ display: activeView === 'browser' ? 'flex' : 'none', opacity: activeView === 'browser' ? 1 : 0 }}>
        <BrowserView />
      </div>
      <div class="content-pane__view" style={{ display: activeView === 'git' ? 'flex' : 'none', opacity: activeView === 'git' ? 1 : 0 }}>
        <GitView />
      </div>
      <div class="content-pane__view" style={{ display: activeView === 'containers' ? 'flex' : 'none', opacity: activeView === 'containers' ? 1 : 0 }}>
        <ContainerView />
      </div>
      <div class="content-pane__view" style={{ display: activeView === 'insights' ? 'flex' : 'none', opacity: activeView === 'insights' ? 1 : 0 }}>
        <InsightsView />
      </div>

      {aiOverlay && (
        <div class="ai-overlay" role="dialog" aria-label="AI Response">
          <div class="ai-overlay__header">
            <span class="ai-overlay__title">AI Response</span>
            <span class={`ai-overlay__badge ai-overlay__badge--${aiOverlay.routing}`}>
              {aiOverlay.routing}
            </span>
            <button class="ai-overlay__close" onClick={() => setAiOverlay(null)} aria-label="Close">
              ✕
            </button>
          </div>
          <div
            class="ai-overlay__body"
            dangerouslySetInnerHTML={{ __html: aiOverlay.response }}
          />
        </div>
      )}
    </div>
  )
}

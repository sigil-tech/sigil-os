import { useEffect, useRef, useState } from 'preact/hooks'
import { listen } from '@tauri-apps/api/event'
import { useApp } from '../context/AppContext'
import type { ViewId } from '../context/AppContext'
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

interface ActuationPayload {
  type: string
  reason?: string
  exit_code?: number
}

interface Props {
  onTerminalPtyReady?: (ptyId: string) => void
}

function ViewForId({ viewId, onPtyReady }: { viewId: ViewId; onPtyReady?: (id: string) => void }) {
  return (
    <>
      <div class="content-pane__view" style={{ display: viewId === 'terminal' ? 'flex' : 'none' }}>
        <TerminalView onPtyReady={onPtyReady} />
      </div>
      <div class="content-pane__view" style={{ display: viewId === 'editor' ? 'flex' : 'none' }}>
        <EditorView />
      </div>
      <div class="content-pane__view" style={{ display: viewId === 'browser' ? 'flex' : 'none' }}>
        <BrowserView />
      </div>
      <div class="content-pane__view" style={{ display: viewId === 'git' ? 'flex' : 'none' }}>
        <GitView />
      </div>
      <div class="content-pane__view" style={{ display: viewId === 'containers' ? 'flex' : 'none' }}>
        <ContainerView />
      </div>
      <div class="content-pane__view" style={{ display: viewId === 'insights' ? 'flex' : 'none' }}>
        <InsightsView />
      </div>
    </>
  )
}

export function ContentPane({ onTerminalPtyReady }: Props) {
  const { activeView, split, setSplit } = useApp()
  const [aiOverlay, setAiOverlay] = useState<AIResponse | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcuts for split mode
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault()
        if (e.shiftKey) {
          // Ctrl+Shift+\ → toggle vertical split
          setSplit(split.mode === 'vertical'
            ? { ...split, mode: 'none' }
            : { ...split, mode: 'vertical' })
        } else {
          // Ctrl+\ → toggle horizontal split
          setSplit(split.mode === 'horizontal'
            ? { ...split, mode: 'none' }
            : { ...split, mode: 'horizontal' })
        }
      }
      if (e.ctrlKey && e.key === '[') {
        e.preventDefault()
        setSplit({ ...split, focus: 'primary' })
      }
      if (e.ctrlKey && e.key === ']') {
        e.preventDefault()
        setSplit({ ...split, focus: 'secondary' })
      }
      if (e.key === 'Escape' && aiOverlay) {
        setAiOverlay(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [aiOverlay, split])

  // Listen for AI responses (Issue #35)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<AIResponse>('ai-response', (event) => {
      setAiOverlay(event.payload)
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  // Listen for daemon-actuation events (Issue #106)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<ActuationPayload>('daemon-actuation', (event) => {
      const p = event.payload
      if (p.type === 'split-pane') {
        setSplit({ mode: 'horizontal', primaryView: split.primaryView, secondaryView: 'terminal', focus: 'primary' })
      } else if (p.type === 'close-split') {
        setSplit({ ...split, mode: 'none' })
      }
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [split])

  const isSplit = split.mode !== 'none'
  const splitDirection = split.mode === 'horizontal' ? 'row' : 'column'

  return (
    <div class="content-pane" ref={paneRef}>
      {!isSplit ? (
        <>
          {/* Single-view mode: keep-alive pattern */}
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
        </>
      ) : (
        <div class="content-pane__split" style={{ flexDirection: splitDirection }}>
          <div
            class={`content-pane__split-pane ${split.focus === 'primary' ? 'content-pane__split-pane--focused' : ''}`}
            onClick={() => setSplit({ ...split, focus: 'primary' })}
          >
            <ViewForId viewId={split.primaryView} onPtyReady={onTerminalPtyReady} />
          </div>
          <div
            class={`content-pane__split-pane ${split.focus === 'secondary' ? 'content-pane__split-pane--focused' : ''}`}
            onClick={() => setSplit({ ...split, focus: 'secondary' })}
          >
            <ViewForId viewId={split.secondaryView} />
          </div>
        </div>
      )}

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

import { useEffect, useRef, useState } from 'preact/hooks'
import { listen } from '@tauri-apps/api/event'

export function BrowserView() {
  const [url, setUrl] = useState('')
  const [currentUrl, setCurrentUrl] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const webviewRef = useRef<HTMLIFrameElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  // Listen for open-url events from terminal clicks
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<string>('open-url', (event) => {
      navigate(event.payload)
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goBack()
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        goForward()
      } else if (e.ctrlKey && e.key === 'r') {
        e.preventDefault()
        reload()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [histIdx, history])

  function normalizeUrl(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    if (/^[\w-]+:\/\//i.test(trimmed)) return trimmed
    return `https://${trimmed}`
  }

  function navigate(raw: string) {
    const normalized = normalizeUrl(raw)
    if (!normalized) return
    setCurrentUrl(normalized)
    setUrl(normalized)
    setHistory((h) => {
      const trimmed = h.slice(0, histIdx + 1 === 0 ? h.length : histIdx + 1)
      return [...trimmed, normalized]
    })
    setHistIdx((i) => i + 1)
  }

  function goBack() {
    if (histIdx > 0) {
      const prev = history[histIdx - 1]
      setHistIdx((i) => i - 1)
      setCurrentUrl(prev)
      setUrl(prev)
    }
  }

  function goForward() {
    if (histIdx < history.length - 1) {
      const next = history[histIdx + 1]
      setHistIdx((i) => i + 1)
      setCurrentUrl(next)
      setUrl(next)
    }
  }

  function reload() {
    if (webviewRef.current && currentUrl) {
      // Force reload by resetting src
      const src = webviewRef.current.src
      webviewRef.current.src = ''
      setTimeout(() => {
        if (webviewRef.current) webviewRef.current.src = src
      }, 0)
    }
  }

  function handleUrlSubmit(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      navigate(url)
      urlInputRef.current?.blur()
    }
  }

  return (
    <div class="browser-view">
      <div class="browser-view__bar">
        <button class="browser-view__btn" onClick={goBack} title="Back (Alt+Left)">←</button>
        <button class="browser-view__btn" onClick={goForward} title="Forward (Alt+Right)">→</button>
        <button class="browser-view__btn" onClick={reload} title="Reload (Ctrl+R)">↻</button>
        <input
          ref={urlInputRef}
          class="browser-view__url"
          type="text"
          value={url}
          placeholder="Enter URL..."
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
          onKeyDown={handleUrlSubmit}
          aria-label="URL"
        />
      </div>

      {currentUrl ? (
        <iframe
          ref={webviewRef}
          class="browser-view__content"
          src={currentUrl}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="Browser"
        />
      ) : (
        <div class="browser-view__home">Aether Browser</div>
      )}
    </div>
  )
}

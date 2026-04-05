import { useEffect, useRef, useState } from 'preact/hooks'
import { listen } from '@tauri-apps/api/event'

export function BrowserView() {
  const [url, setUrl] = useState('')
  const [currentUrl, setCurrentUrl] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [loading, setLoading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<string>('open-url', (event) => {
      navigate(event.payload)
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack() }
      else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward() }
      else if (e.ctrlKey && e.key === 'r') { e.preventDefault(); reload() }
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
    setLoading(true)
    setHistory((h) => [...h.slice(0, histIdx + 1 === 0 ? h.length : histIdx + 1), normalized])
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
    if (iframeRef.current && currentUrl) {
      const src = iframeRef.current.src
      iframeRef.current.src = ''
      setTimeout(() => { if (iframeRef.current) iframeRef.current.src = src }, 0)
    }
  }

  return (
    <div class="browser-view">
      <div class="browser-view__bar">
        <button class="browser-view__btn" onClick={goBack} title="Back (Alt+Left)">←</button>
        <button class="browser-view__btn" onClick={goForward} title="Forward (Alt+Right)">→</button>
        <button class={`browser-view__btn${loading ? ' browser-view__btn--loading' : ''}`} onClick={reload} title="Reload (Ctrl+R)">↻</button>
        <input
          ref={urlInputRef}
          class="browser-view__url"
          type="text"
          value={url}
          placeholder="Enter URL..."
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { navigate(url); urlInputRef.current?.blur() } }}
          aria-label="URL"
        />
      </div>
      {currentUrl ? (
        <iframe
          ref={iframeRef}
          class="browser-view__content"
          src={currentUrl}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={() => setLoading(false)}
          title="Browser"
        />
      ) : (
        <div class="browser-view__home">
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>Sigil Browser</div>
          <div style={{ fontSize: '12px' }}>Enter a URL above or press Ctrl+B</div>
        </div>
      )}
    </div>
  )
}

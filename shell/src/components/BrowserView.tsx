import { useEffect, useRef, useState } from 'preact/hooks'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../context/AppContext'

export function BrowserView() {
  const { activeView } = useApp()
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCreated, setIsCreated] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  function getBounds() {
    if (!contentRef.current) return { x: 0, y: 0, width: 800, height: 600 }
    const rect = contentRef.current.getBoundingClientRect()
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
  }

  function normalizeUrl(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    if (/^[\w-]+:\/\//i.test(trimmed)) return trimmed
    return `https://${trimmed}`
  }

  async function handleNavigate(raw: string) {
    const normalized = normalizeUrl(raw)
    if (!normalized) return
    setUrl(normalized)
    const bounds = getBounds()
    try {
      // browser_create handles both first-time creation and subsequent navigations
      await invoke('browser_create', { url: normalized, ...bounds })
      setIsCreated(true)
    } catch (e) {
      console.error('browser_create failed:', e)
    }
  }

  // Listen for backend events
  useEffect(() => {
    const unlisteners: (() => void)[] = []

    listen<{ url: string }>('browser-url-changed', (e) => {
      setUrl(e.payload.url)
    }).then((fn) => unlisteners.push(fn))

    listen<{ url: string }>('browser-load-started', () => {
      setIsLoading(true)
    }).then((fn) => unlisteners.push(fn))

    listen<{ url: string }>('browser-load-finished', () => {
      setIsLoading(false)
    }).then((fn) => unlisteners.push(fn))

    listen<string>('open-url', (event) => {
      handleNavigate(event.payload)
    }).then((fn) => unlisteners.push(fn))

    return () => unlisteners.forEach((fn) => fn())
  }, [])

  // Show/hide webview on view switch
  useEffect(() => {
    if (!isCreated) return
    if (activeView === 'browser') {
      // Wait for DOM to paint so getBoundingClientRect returns valid values
      requestAnimationFrame(() => {
        const bounds = getBounds()
        invoke('browser_show', bounds).catch(() => {})
      })
    } else {
      invoke('browser_hide').catch(() => {})
    }
  }, [activeView, isCreated])

  // ResizeObserver for content area bounds
  useEffect(() => {
    if (!contentRef.current || !isCreated) return
    const observer = new ResizeObserver(() => {
      if (activeView === 'browser') {
        const bounds = getBounds()
        invoke('browser_show', bounds).catch(() => {})
      }
    })
    observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [isCreated, activeView])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (activeView !== 'browser') return
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        invoke('browser_back').catch(() => {})
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        invoke('browser_forward').catch(() => {})
      } else if (e.ctrlKey && e.key === 'r') {
        e.preventDefault()
        invoke('browser_reload').catch(() => {})
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeView])

  function handleUrlSubmit(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleNavigate(url)
      urlInputRef.current?.blur()
    }
  }

  return (
    <div class="browser-view">
      <div class="browser-view__bar">
        <button class="browser-view__btn" onClick={() => invoke('browser_back').catch(() => {})} title="Back (Alt+Left)">&larr;</button>
        <button class="browser-view__btn" onClick={() => invoke('browser_forward').catch(() => {})} title="Forward (Alt+Right)">&rarr;</button>
        <button class="browser-view__btn" onClick={() => invoke('browser_reload').catch(() => {})} title="Reload (Ctrl+R)">{isLoading ? '\u2715' : '\u21BB'}</button>
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

      <div ref={contentRef} class="browser-view__content">
        {!isCreated && <div class="browser-view__home">Sigil Browser</div>}
      </div>
    </div>
  )
}

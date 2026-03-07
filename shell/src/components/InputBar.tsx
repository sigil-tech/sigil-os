import { useEffect, useRef, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { useApp } from '../context/AppContext'

const MAX_HISTORY = 1000

export function InputBar({ activePtyId }: { activePtyId?: string }) {
  const { inputMode, setInputMode, activeView } = useApp()
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [aiPending, setAiPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Alt+Tab toggles AI mode
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault()
        setInputMode(inputMode === 'shell' ? 'ai' : 'shell')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [inputMode, setInputMode])

  async function handleSubmit() {
    const cmd = value.trim()
    if (!cmd) return

    if (inputMode === 'shell') {
      if (activePtyId) {
        await invoke('pty_write', { ptyId: activePtyId, data: cmd + '\r' }).catch(() => {})
      }
      setHistory((h) => {
        const updated = [cmd, ...h.filter((x) => x !== cmd)].slice(0, MAX_HISTORY)
        return updated
      })
      setHistIdx(-1)
      setValue('')
    } else {
      // AI mode
      setAiPending(true)
      setValue('')
      try {
        const resp = await invoke<{ response: string; routing: string; latency_ms: number }>(
          'daemon_ai_query',
          { query: cmd, context: activeView }
        )
        const html = await renderMarkdown(resp.response)
        await emit('ai-response', { response: html, routing: resp.routing })
      } catch (err) {
        await emit('ai-response', { response: `<pre>Error: ${err}</pre>`, routing: 'local' })
      } finally {
        setAiPending(false)
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit()
      return
    }
    // Ctrl+Z with empty input: undo last daemon action
    if (e.ctrlKey && e.key === 'z' && !value) {
      e.preventDefault()
      invoke('daemon_undo').catch(() => {})
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(next)
      setValue(history[next] ?? '')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(histIdx - 1, -1)
      setHistIdx(next)
      setValue(next === -1 ? '' : (history[next] ?? ''))
      return
    }
  }

  const prefix = inputMode === 'shell' ? '$' : '✦'
  const placeholder =
    inputMode === 'shell' ? '' : 'Ask anything about your workflow...'

  return (
    <div class="input-bar">
      <span class={`input-bar__prefix input-bar__prefix--${inputMode}${aiPending ? ' input-bar__prefix--pulse' : ''}`}>
        {prefix}
      </span>
      <input
        ref={inputRef}
        class="input-bar__input"
        type="text"
        value={value}
        placeholder={placeholder}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        aria-label={inputMode === 'shell' ? 'Shell command input' : 'AI query input'}
        autocomplete="off"
        spellcheck={false}
      />
    </div>
  )
}

async function renderMarkdown(text: string): Promise<string> {
  try {
    const { marked } = await import('marked')
    return await marked(text)
  } catch {
    return `<pre>${text}</pre>`
  }
}

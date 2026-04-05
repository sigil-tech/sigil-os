import { useEffect, useRef, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { useApp } from '../context/AppContext'
import { isLauncherMode } from '../lib/platform'
import { buildAIContext, type ConversationTurn } from '../lib/context'

const MAX_HISTORY = 1000

export function InputBar({ activePtyId }: { activePtyId?: string }) {
  const { inputMode, setInputMode, activeView } = useApp()
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [aiPending, setAiPending] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([])
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
        const writeCmd = await isLauncherMode() ? 'remote_pty_write' : 'pty_write'
        await invoke(writeCmd, { ptyId: activePtyId, data: cmd + '\r' }).catch(() => {})
        // Shell commands handled via PTY if available
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
      await emit('ai-query', { query: cmd })
      try {
        const ctx = await buildAIContext(activeView, conversationHistory)
        const resp = await invoke<{ response: string; routing: string; latency_ms: number }>(
          'daemon_ai_query',
          { query: cmd, context: ctx }
        )
        const content = resp.response || 'No response from daemon'
        setConversationHistory((prev) => [
          ...prev,
          { role: 'user', content: cmd },
          { role: 'assistant', content, routing: resp.routing },
        ])
        await emit('ai-response', {
          response: content,
          routing: resp.routing,
          latency_ms: resp.latency_ms,
        })
      } catch (err) {
        await emit('ai-response', {
          response: `<pre>Error: ${err}</pre>`,
          routing: 'local',
        })
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
    inputMode === 'shell'
      ? (activePtyId ? 'Type a command (runs in terminal)...' : 'Terminal not ready')
      : 'Ask anything about your workflow... (Alt+Tab to switch)'

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

import { useEffect, useState } from 'preact/hooks'
import { listen, emit } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

interface Suggestion {
  id: number
  text: string
  title: string
  confidence: number
  action_cmd: string
}

export function SuggestionBar() {
  const [queue, setQueue] = useState<Suggestion[]>([])
  const [current, setCurrent] = useState<Suggestion | null>(null)
  const [rotateTimer, setRotateTimer] = useState<ReturnType<typeof setInterval> | null>(null)

  // Listen for daemon-suggestion events (pushed from Rust subscribe_suggestions)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<Suggestion>('daemon-suggestion', (event) => {
      setQueue((q) => [...q, event.payload])
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  // Rotate suggestions every 8 seconds
  useEffect(() => {
    if (queue.length === 0) {
      setCurrent(null)
      if (rotateTimer) { clearInterval(rotateTimer); setRotateTimer(null) }
      return
    }
    if (!current) {
      setCurrent(queue[0])
    }
    if (!rotateTimer) {
      const id = setInterval(() => {
        setQueue((q) => {
          if (q.length <= 1) return q
          const [, ...rest] = q
          setCurrent(rest[0])
          return rest
        })
      }, 8_000)
      setRotateTimer(id)
    }
    return () => {}
  }, [queue.length])

  // Keyboard: Tab = accept (+ execute action_cmd if set), Esc = dismiss
  useEffect(() => {
    if (!current) return
    async function handleKey(e: KeyboardEvent) {
      if (!current) return
      if (e.key === 'Tab') {
        e.preventDefault()
        await invoke('daemon_feedback', {
          suggestionId: current.id,
          outcome: 'accepted',
        }).catch(() => {})
        // If an action command is set, emit it for the active PTY to execute
        if (current.action_cmd) {
          await emit('execute-action', { cmd: current.action_cmd }).catch(() => {})
        }
        dismiss()
      } else if (e.key === 'Escape') {
        await invoke('daemon_feedback', {
          suggestionId: current.id,
          outcome: 'dismissed',
        }).catch(() => {})
        dismiss()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [current])

  function dismiss() {
    setQueue((q) => {
      const [, ...rest] = q
      setCurrent(rest[0] ?? null)
      return rest
    })
  }

  function openHistory() {
    emit('execute-action', { cmd: 'aetherctl suggestions' }).catch(() => {})
  }

  if (!current) return null

  return (
    <div class="suggestion-bar" role="status" aria-live="polite">
      <span class="suggestion-bar__text">
        {current.title ? <strong>{current.title}: </strong> : null}
        {current.text}
      </span>
      <span class="suggestion-bar__hints">
        <kbd>Tab</kbd> accept{current.action_cmd ? ' • Tab to execute' : ''}
        &nbsp; <kbd>Esc</kbd> dismiss
      </span>
      <button class="suggestion-bar__history" onClick={openHistory}>
        history
      </button>
    </div>
  )
}

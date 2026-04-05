import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../context/AppContext'

const VSCODE_PORT = 8765

export function EditorView() {
  const { cwd } = useApp()
  const [started, setStarted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Launch code serve-web if not already running
    async function startServer() {
      try {
        // Check if already running by trying to connect
        const resp = await fetch(`http://localhost:${VSCODE_PORT}/`, { mode: 'no-cors' }).catch(() => null)
        if (resp) {
          setStarted(true)
          return
        }
      } catch {}

      try {
        await invoke('launch_app', {
          command: 'code',
          args: ['serve-web', '--without-connection-token', '--port', String(VSCODE_PORT)],
          cwd: cwd || null,
        })
        // Wait for server to be ready
        let attempts = 0
        const check = setInterval(async () => {
          attempts++
          try {
            await fetch(`http://localhost:${VSCODE_PORT}/`, { mode: 'no-cors' })
            setStarted(true)
            clearInterval(check)
          } catch {
            if (attempts > 30) {
              setError('VS Code server failed to start')
              clearInterval(check)
            }
          }
        }, 500)
      } catch (e) {
        setError(`Failed to launch VS Code: ${e}`)
      }
    }

    startServer()
  }, [])

  if (error) {
    return (
      <div class="editor-view__empty">
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>VS Code</div>
        <div style={{ color: '#ef4444' }}>{error}</div>
        <div style={{ marginTop: '8px', fontSize: '12px' }}>
          Make sure VS Code is installed: <code>code --version</code>
        </div>
      </div>
    )
  }

  if (!started) {
    return (
      <div class="editor-view__empty">
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>Starting VS Code...</div>
        <div style={{ fontSize: '12px', color: 'var(--color-fg-muted)' }}>Launching web server on port {VSCODE_PORT}</div>
      </div>
    )
  }

  return (
    <div class="editor-view">
      <iframe
        class="editor-view__frame"
        src={`http://localhost:${VSCODE_PORT}/?folder=${encodeURIComponent(cwd || '/home/nick/workspace')}`}
        title="VS Code"
      />
    </div>
  )
}

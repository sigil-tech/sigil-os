import { useEffect, useRef, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  onPtyReady?: (ptyId: string) => void
}

export function TerminalView({ onPtyReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    const term = new Terminal({
      cursorStyle: 'block',
      allowTransparency: false,
      fontSize: 14,
      fontFamily: '"IBM Plex Mono", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#6366f1',
        cursorAccent: '#0a0a0a',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitRef.current = fitAddon

    // Spawn PTY
    invoke<string>('spawn_pty', {
      shell: null,
      cols: term.cols,
      rows: term.rows,
    })
      .then((ptyId) => {
        ptyIdRef.current = ptyId
        onPtyReady?.(ptyId)
        setReady(true)

        // Stream PTY output into xterm
        listen<string>(`pty-output-${ptyId}`, (event) => {
          term.write(event.payload)
        })

        // Forward xterm input to PTY
        term.onData((data) => {
          invoke('pty_write', { ptyId, data }).catch(() => {})
        })
      })
      .catch((err) => {
        term.writeln(`\x1b[31mFailed to spawn PTY: ${err}\x1b[0m`)
      })

    return () => {
      term.dispose()
      termRef.current = null
    }
  }, [])

  // Resize PTY on window resize
  useEffect(() => {
    function handleResize() {
      if (!fitRef.current || !ptyIdRef.current) return
      fitRef.current.fit()
      const term = termRef.current
      if (!term) return
      invoke('pty_resize', {
        ptyId: ptyIdRef.current,
        cols: term.cols,
        rows: term.rows,
      }).catch(() => {})
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div class="terminal-view">
      <div
        ref={containerRef}
        class="terminal-view__xterm"
        style={{ display: ready ? 'block' : 'none' }}
      />
      {!ready && (
        <div class="view-placeholder">Starting terminal...</div>
      )}
    </div>
  )
}

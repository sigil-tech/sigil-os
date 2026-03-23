import { useEffect, useRef, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { isLauncherMode } from '../lib/platform'
import '@xterm/xterm/css/xterm.css'

interface Props {
  onPtyReady?: (ptyId: string) => void
}

export function TerminalView({ onPtyReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const launcherRef = useRef<boolean>(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    const term = new Terminal({
      cursorStyle: 'block',
      allowTransparency: false,
      fontSize: 16,
      fontFamily: '"Fira Code", Consolas, "Courier New", monospace',
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

    // Use an async IIFE so we can properly await each step
    ;(async () => {
      try {
        const launcher = await isLauncherMode()
        launcherRef.current = launcher

        const spawnCmd = launcher ? 'spawn_remote_pty' : 'spawn_pty'
        const spawnArgs = launcher
          ? { config: null, cols: term.cols, rows: term.rows }
          : { shell: null, cols: term.cols, rows: term.rows }

        // Spawn PTY
        const ptyId = await invoke<string>(spawnCmd, spawnArgs)
        ptyIdRef.current = ptyId

        // Register the output listener BEFORE signaling ready.
        // This must be awaited — listen() is async and events emitted
        // before registration are lost.
        await listen<string>(`pty-output-${ptyId}`, (event) => {
          term.write(event.payload)
        })

        // Forward xterm input to PTY
        const writeCmd = launcher ? 'remote_pty_write' : 'pty_write'
        term.onData((data) => {
          invoke(writeCmd, { ptyId, data }).catch(() => {})
        })

        // Now signal ready — terminal is fully wired
        onPtyReady?.(ptyId)
        setReady(true)

        // Send a newline to trigger the prompt in case it was already sent
        // before the listener was registered
        await invoke(writeCmd, { ptyId, data: '\n' }).catch(() => {})
      } catch (err) {
        setReady(true)
        term.writeln(`\x1b[31mFailed to spawn terminal: ${err}\x1b[0m`)
        term.writeln(`\x1b[33mShell: ${await invoke<string>('get_cwd').catch(() => '?')}\x1b[0m`)
      }
    })()

    return () => {
      term.dispose()
      termRef.current = null
    }
  }, [])

  // Resize PTY on window resize and container resize (split pane changes)
  useEffect(() => {
    function handleResize() {
      if (!fitRef.current || !ptyIdRef.current) return
      fitRef.current.fit()
      const term = termRef.current
      if (!term) return
      const resizeCmd = launcherRef.current ? 'remote_pty_resize' : 'pty_resize'
      invoke(resizeCmd, {
        ptyId: ptyIdRef.current,
        cols: term.cols,
        rows: term.rows,
      }).catch(() => {})
    }

    window.addEventListener('resize', handleResize)

    const ro = new ResizeObserver(handleResize)
    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      window.removeEventListener('resize', handleResize)
      ro.disconnect()
    }
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

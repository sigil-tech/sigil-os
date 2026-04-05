import { useEffect, useRef } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  /** If provided, runs this program instead of the default shell */
  program?: string
}

export function TerminalView({ program }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: "'Fira Code', Consolas, 'Courier New', monospace",
      fontSize: 14,
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#6366f1',
        selectionBackground: '#6366f140',
      },
      cursorBlink: true,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)

    // Small delay to let the DOM settle before fitting
    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Spawn PTY
    const cols = term.cols
    const rows = term.rows

    let ptyId: string | null = null
    let unlistenOutput: (() => void) | undefined

    async function init() {
      try {
        if (program) {
          // Spawn a specific program (e.g. lazygit)
          ptyId = await invoke<string>('spawn_pty', { shell: program, cols, rows })
        } else {
          ptyId = await invoke<string>('spawn_pty', { cols, rows })
        }
        ptyIdRef.current = ptyId

        // Listen for PTY output
        const fn = await listen<string>(`pty-output-${ptyId}`, (event) => {
          term.write(event.payload)
        })
        unlistenOutput = fn
      } catch (e) {
        term.write(`\r\nFailed to start terminal: ${e}\r\n`)
      }
    }

    init()

    // Forward user input to PTY
    const onData = term.onData((data) => {
      if (ptyIdRef.current) {
        invoke('pty_write', { ptyId: ptyIdRef.current, data }).catch(() => {})
      }
    })

    // Handle resize
    const onResize = term.onResize(({ cols, rows }) => {
      if (ptyIdRef.current) {
        invoke('pty_resize', { ptyId: ptyIdRef.current, cols, rows }).catch(() => {})
      }
    })

    // Fit on window resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon.fit())
    })
    resizeObserver.observe(container)

    return () => {
      onData.dispose()
      onResize.dispose()
      resizeObserver.disconnect()
      unlistenOutput?.()
      term.dispose()
    }
  }, [program])

  return (
    <div
      ref={containerRef}
      class="terminal-embed"
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  )
}

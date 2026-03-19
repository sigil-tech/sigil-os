import { useEffect, useRef, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { isLauncherMode } from '../lib/platform'
import '@xterm/xterm/css/xterm.css'

interface Props {
  filePath?: string
}

export function EditorView({ filePath }: Props) {
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
      fontSize: 14,
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

    isLauncherMode().then((launcher) => {
      launcherRef.current = launcher

      if (launcher) {
        // In launcher mode: spawn a remote shell, then launch nvim inside it
        return invoke<string>('spawn_remote_pty', {
          config: null,
          cols: term.cols,
          rows: term.rows,
        }).then((ptyId) => {
          // Send nvim command to the remote shell
          const nvimCmd = filePath ? `nvim ${filePath}\n` : `nvim\n`
          invoke('remote_pty_write', { ptyId, data: nvimCmd }).catch(() => {})
          return ptyId
        })
      } else {
        // Native mode: spawn nvim directly via local PTY
        return invoke<string>('spawn_editor', {
          filePath: filePath ?? null,
        })
      }
    })
      .then((ptyId) => {
        ptyIdRef.current = ptyId
        setReady(true)

        listen<string>(`pty-output-${ptyId}`, (event) => {
          term.write(event.payload)
        })

        term.onData((data) => {
          const writeCmd = launcherRef.current ? 'remote_pty_write' : 'pty_write'
          invoke(writeCmd, { ptyId, data }).catch(() => {})
        })
      })
      .catch((err) => {
        term.writeln(`\x1b[31mFailed to launch editor: ${err}\x1b[0m`)
      })

    return () => {
      term.dispose()
      termRef.current = null
    }
  }, [])

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
    <div class="editor-view">
      <div
        ref={containerRef}
        class="editor-view__xterm"
        style={{ display: ready ? 'block' : 'none' }}
      />
      {!ready && (
        <div class="view-placeholder">Launching Neovim...</div>
      )}
    </div>
  )
}

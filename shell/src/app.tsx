import { useEffect, useState } from 'preact/hooks'
import { listen } from '@tauri-apps/api/event'
import { AppProvider, useApp } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'
import { LeftRail } from './components/LeftRail'
import { ContentPane } from './components/ContentPane'
import { SuggestionBar } from './components/SuggestionBar'
import { InputBar } from './components/InputBar'
import { CommandPalette } from './components/CommandPalette'
import { SettingsPanel } from './components/SettingsPanel'
import { ToastContainer } from './components/Toast'

function ShellInner() {
  const [activePtyId, setActivePtyId] = useState<string | undefined>(undefined)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const { setIsPaletteOpen } = useApp()

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        setIsPaletteOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setIsSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setIsPaletteOpen])

  // Listen for open-settings event from CommandPalette
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen('open-settings', () => {
      setIsSettingsOpen(true)
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  return (
    <div class="shell-layout">
      <LeftRail />
      <div class="shell-main">
        <ContentPane onTerminalPtyReady={setActivePtyId} />
        <SuggestionBar />
        <InputBar activePtyId={activePtyId} />
      </div>
      <CommandPalette />
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <ToastContainer />
    </div>
  )
}

export function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <ShellInner />
      </ToastProvider>
    </AppProvider>
  )
}

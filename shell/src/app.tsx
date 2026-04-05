import { useEffect, useState } from 'preact/hooks'
import { listen } from '@tauri-apps/api/event'
import { AppProvider, useApp } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'
import { AppRail } from './components/AppRail'
import { PathBar } from './components/PathBar'
import { ContentPane } from './components/ContentPane'
import { SuggestionBar } from './components/SuggestionBar'
import { InputBar } from './components/InputBar'
import { CommandPalette } from './components/CommandPalette'
import { SettingsPanel } from './components/SettingsPanel'
import { ToastContainer } from './components/Toast'

function ShellInner() {
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

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen('open-settings', () => {
      setIsSettingsOpen(true)
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  return (
    <div class="shell-layout">
      <AppRail />
      <div class="shell-main">
        <PathBar />
        <ContentPane />
        <SuggestionBar />
        <InputBar />
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

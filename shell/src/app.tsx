import { useEffect, useState } from 'preact/hooks'
import { AppProvider, useApp } from './context/AppContext'
import { LeftRail } from './components/LeftRail'
import { ContentPane } from './components/ContentPane'
import { SuggestionBar } from './components/SuggestionBar'
import { InputBar } from './components/InputBar'
import { CommandPalette } from './components/CommandPalette'

function ShellInner() {
  const [activePtyId, setActivePtyId] = useState<string | undefined>(undefined)
  const { setIsPaletteOpen } = useApp()

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        setIsPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setIsPaletteOpen])

  return (
    <div class="shell-layout">
      <LeftRail />
      <div class="shell-main">
        <ContentPane onTerminalPtyReady={setActivePtyId} />
        <SuggestionBar />
        <InputBar activePtyId={activePtyId} />
      </div>
      <CommandPalette />
    </div>
  )
}

export function App() {
  return (
    <AppProvider>
      <ShellInner />
    </AppProvider>
  )
}

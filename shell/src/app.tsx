import { useState } from 'preact/hooks'
import { AppProvider } from './context/AppContext'
import { LeftRail } from './components/LeftRail'
import { ContentPane } from './components/ContentPane'
import { SuggestionBar } from './components/SuggestionBar'
import { InputBar } from './components/InputBar'

export function App() {
  const [activePtyId, setActivePtyId] = useState<string | undefined>(undefined)

  return (
    <AppProvider>
      <div class="shell-layout">
        <LeftRail />
        <div class="shell-main">
          <ContentPane onTerminalPtyReady={setActivePtyId} />
          <SuggestionBar />
          <InputBar activePtyId={activePtyId} />
        </div>
      </div>
    </AppProvider>
  )
}

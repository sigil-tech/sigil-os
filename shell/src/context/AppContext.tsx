import { createContext } from 'preact'
import { useContext, useState } from 'preact/hooks'

export type ViewId = 'terminal' | 'editor' | 'browser' | 'git' | 'containers' | 'insights'
export type InputMode = 'shell' | 'ai'

interface AppState {
  activeView: ViewId
  setActiveView: (v: ViewId) => void
  inputMode: InputMode
  setInputMode: (m: InputMode) => void
}

const AppCtx = createContext<AppState>({
  activeView: 'terminal',
  setActiveView: () => {},
  inputMode: 'shell',
  setInputMode: () => {},
})

export function AppProvider({ children }: { children: preact.ComponentChildren }) {
  const [activeView, setActiveView] = useState<ViewId>('terminal')
  const [inputMode, setInputMode] = useState<InputMode>('shell')

  return (
    <AppCtx.Provider value={{ activeView, setActiveView, inputMode, setInputMode }}>
      {children}
    </AppCtx.Provider>
  )
}

export function useApp() {
  return useContext(AppCtx)
}

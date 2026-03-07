import { createContext } from 'preact'
import { useContext, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import type { SplitState } from '../layouts'
import { defaultSplit } from '../layouts'

export type ViewId = 'terminal' | 'editor' | 'browser' | 'git' | 'containers' | 'insights'
export type InputMode = 'shell' | 'ai'

interface AppState {
  activeView: ViewId
  setActiveView: (v: ViewId) => void
  inputMode: InputMode
  setInputMode: (m: InputMode) => void
  split: SplitState
  setSplit: (s: SplitState) => void
}

const AppCtx = createContext<AppState>({
  activeView: 'terminal',
  setActiveView: () => {},
  inputMode: 'shell',
  setInputMode: () => {},
  split: defaultSplit,
  setSplit: () => {},
})

export function AppProvider({ children }: { children: preact.ComponentChildren }) {
  const [activeView, rawSetActiveView] = useState<ViewId>('terminal')
  const [inputMode, setInputMode] = useState<InputMode>('shell')
  const [split, setSplit] = useState<SplitState>(defaultSplit)

  function setActiveView(v: ViewId) {
    rawSetActiveView(v)
    // When not split, keep primaryView in sync
    if (split.mode === 'none') {
      setSplit((s) => ({ ...s, primaryView: v }))
    } else {
      // Update the focused pane's view
      if (split.focus === 'primary') {
        setSplit((s) => ({ ...s, primaryView: v }))
      } else {
        setSplit((s) => ({ ...s, secondaryView: v }))
      }
    }
    // Notify daemon of view change for keybinding profile switch
    invoke('daemon_view_changed', { view: v }).catch(() => {})
  }

  return (
    <AppCtx.Provider value={{ activeView, setActiveView, inputMode, setInputMode, split, setSplit }}>
      {children}
    </AppCtx.Provider>
  )
}

export function useApp() {
  return useContext(AppCtx)
}

export function useSplitState() {
  const { split, setSplit } = useApp()
  return { split, setSplit }
}

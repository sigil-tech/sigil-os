import { createContext } from 'preact'
import { useContext, useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export type ViewId = 'home' | 'settings' | 'terminal' | 'git' | 'browser' | 'events' | 'editor'
export type InputMode = 'shell' | 'ai'

interface CwdChangedEvent {
  path: string
  git_root: string | null
  git_branch: string | null
  pty_id: string
}

interface AppState {
  activeView: ViewId
  setActiveView: (v: ViewId) => void
  inputMode: InputMode
  setInputMode: (m: InputMode) => void
  isPaletteOpen: boolean
  setIsPaletteOpen: (v: boolean) => void
  cwd: string
  gitRoot: string | null
  gitBranch: string | null
  activePtyId: string | null
  setActivePtyId: (id: string | null) => void
}

const AppCtx = createContext<AppState>({
  activeView: 'home',
  setActiveView: () => {},
  inputMode: 'ai',
  setInputMode: () => {},
  isPaletteOpen: false,
  setIsPaletteOpen: () => {},
  cwd: '',
  gitRoot: null,
  gitBranch: null,
  activePtyId: null,
  setActivePtyId: () => {},
})

export function AppProvider({ children }: { children: preact.ComponentChildren }) {
  const [activeView, setActiveView] = useState<ViewId>('home')
  const [inputMode, setInputMode] = useState<InputMode>('ai')
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [cwd, setCwd] = useState('')
  const [gitRoot, setGitRoot] = useState<string | null>(null)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [activePtyId, setActivePtyId] = useState<string | null>(null)

  // Listen for CWD changes from the backend
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<CwdChangedEvent>('cwd-changed', (event) => {
      const { path, git_root, git_branch, pty_id } = event.payload
      if (activePtyId === null || pty_id === activePtyId) {
        setCwd(path)
        setGitRoot(git_root)
        setGitBranch(git_branch)
      }
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [activePtyId])

  // Initialize CWD from backend on mount
  useEffect(() => {
    invoke<string>('get_cwd').then(setCwd).catch(() => {})
  }, [])

  return (
    <AppCtx.Provider value={{
      activeView, setActiveView,
      inputMode, setInputMode,
      isPaletteOpen, setIsPaletteOpen,
      cwd, gitRoot, gitBranch,
      activePtyId, setActivePtyId,
    }}>
      {children}
    </AppCtx.Provider>
  )
}

export function useApp() {
  return useContext(AppCtx)
}

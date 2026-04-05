import { useApp } from '../context/AppContext'
import { LandingScreen } from './LandingScreen'
import { TerminalView } from './TerminalView'
import { BrowserView } from './BrowserView'
import { EventsView } from './EventsView'
import { EditorView } from './EditorView'

export function ContentPane() {
  const { activeView } = useApp()

  return (
    <div class="content-pane">
      {activeView === 'home' && (
        <div class="content-pane__view" style={{ display: 'flex', flex: 1 }}>
          <LandingScreen />
        </div>
      )}
      {activeView === 'terminal' && (
        <div class="content-pane__view" style={{ display: 'flex', flex: 1 }}>
          <TerminalView />
        </div>
      )}
      {activeView === 'git' && (
        <div class="content-pane__view" style={{ display: 'flex', flex: 1 }}>
          <TerminalView program="lazygit" />
        </div>
      )}
      {activeView === 'browser' && (
        <div class="content-pane__view" style={{ display: 'flex', flex: 1 }}>
          <BrowserView />
        </div>
      )}
      {activeView === 'events' && (
        <div class="content-pane__view" style={{ display: 'flex', flex: 1 }}>
          <EventsView />
        </div>
      )}
      {activeView === 'editor' && (
        <div class="content-pane__view" style={{ display: 'flex', flex: 1 }}>
          <EditorView />
        </div>
      )}
    </div>
  )
}

import type { Meta, StoryObj } from '@storybook/preact'
import { AppProvider } from '../context/AppContext'
import { ToastProvider } from '../context/ToastContext'
import { CommandPalette } from './CommandPalette'
import { setupTauriMocks } from '../test/tauri-mock'
import { useApp } from '../context/AppContext'

setupTauriMocks()

function OpenPalette() {
  const { setIsPaletteOpen } = useApp()
  setIsPaletteOpen(true)
  return <CommandPalette />
}

const meta: Meta = {
  title: 'Components/CommandPalette',
  decorators: [(Story) => (
    <AppProvider>
      <ToastProvider>
        <Story />
      </ToastProvider>
    </AppProvider>
  )],
}
export default meta

export const Open: StoryObj = {
  render: () => <OpenPalette />,
}

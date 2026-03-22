import type { Meta, StoryObj } from '@storybook/preact'
import { AppProvider } from '../context/AppContext'
import { InputBar } from './InputBar'
import { setupTauriMocks } from '../test/tauri-mock'

setupTauriMocks()

const meta: Meta = {
  title: 'Components/InputBar',
  decorators: [(Story) => (
    <AppProvider>
      <div style={{ background: '#0a0a0a', padding: '20px' }}>
        <Story />
      </div>
    </AppProvider>
  )],
}
export default meta

export const ShellMode: StoryObj = {
  render: () => <InputBar activePtyId="mock-pty-1" />,
}

export const NoTerminal: StoryObj = {
  render: () => <InputBar />,
}

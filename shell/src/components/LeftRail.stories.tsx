import type { Meta, StoryObj } from '@storybook/preact'
import { AppProvider } from '../context/AppContext'
import { LeftRail } from './LeftRail'
import { setupTauriMocks } from '../test/tauri-mock'

setupTauriMocks()

const meta: Meta = {
  title: 'Components/LeftRail',
  decorators: [(Story) => (
    <AppProvider>
      <div style={{ height: '100vh', display: 'flex' }}>
        <Story />
      </div>
    </AppProvider>
  )],
}
export default meta

export const Default: StoryObj = {
  render: () => <LeftRail />,
}

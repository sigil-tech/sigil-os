import type { Meta, StoryObj } from '@storybook/preact'
import { SettingsPanel } from './SettingsPanel'
import { setupTauriMocks } from '../test/tauri-mock'

setupTauriMocks()

const meta: Meta = {
  title: 'Components/SettingsPanel',
}
export default meta

export const Open: StoryObj = {
  render: () => <SettingsPanel isOpen={true} onClose={() => console.log('close')} />,
}

export const Closed: StoryObj = {
  render: () => <SettingsPanel isOpen={false} onClose={() => console.log('close')} />,
}

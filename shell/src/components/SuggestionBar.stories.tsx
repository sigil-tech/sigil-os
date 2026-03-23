import type { Meta, StoryObj } from '@storybook/preact'
import { SuggestionBar } from './SuggestionBar'
import { setupTauriMocks } from '../test/tauri-mock'

setupTauriMocks()

const meta: Meta = {
  title: 'Components/SuggestionBar',
  decorators: [(Story) => <div style={{ background: '#0a0a0a', padding: '20px' }}><Story /></div>],
}
export default meta

export const Default: StoryObj = {
  render: () => <SuggestionBar />,
}

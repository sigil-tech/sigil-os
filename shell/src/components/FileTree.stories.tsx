import type { Meta, StoryObj } from '@storybook/preact'
import { FileTree } from './FileTree'
import { setupTauriMocks } from '../test/tauri-mock'

setupTauriMocks()

const meta: Meta = {
  title: 'Components/FileTree',
  decorators: [(Story) => <div style={{ width: '240px', background: '#0a0a0a', height: '100vh' }}><Story /></div>],
}
export default meta

export const Default: StoryObj = {
  render: () => <FileTree rootPath="/home/user/workspace" onFileSelect={(path) => console.log('Selected:', path)} />,
}

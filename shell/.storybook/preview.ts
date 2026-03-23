import type { Preview } from '@storybook/preact'
import '../src/styles/global.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'sigil-dark',
      values: [
        { name: 'sigil-dark', value: '#0a0a0a' },
        { name: 'light', value: '#ffffff' },
      ],
    },
  },
}

export default preview

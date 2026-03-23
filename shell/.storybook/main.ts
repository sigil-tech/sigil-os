import type { StorybookConfig } from '@storybook/preact-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/preact-vite',
    options: {},
  },
}

export default config

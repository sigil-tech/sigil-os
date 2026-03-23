import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { FileTree } from './FileTree'

describe('FileTree', () => {
  it('renders root directory name', async () => {
    render(<FileTree rootPath="/home/user/workspace" onFileSelect={() => {}} />)
    expect(await screen.findByText('workspace')).toBeTruthy()
  })

  it('renders file entries from mock', async () => {
    render(<FileTree rootPath="/home/user/workspace" onFileSelect={() => {}} />)
    expect(await screen.findByText('main.go')).toBeTruthy()
    expect(await screen.findByText('src')).toBeTruthy()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { AppProvider } from '../context/AppContext'
import { InputBar } from './InputBar'

describe('InputBar', () => {
  it('renders AI mode by default', () => {
    render(<AppProvider><InputBar /></AppProvider>)
    expect(screen.getByText('✦')).toBeTruthy()
  })

  it('shows AI placeholder by default', () => {
    render(<AppProvider><InputBar /></AppProvider>)
    expect(screen.getByPlaceholderText('Ask anything about your workflow... (Alt+Tab to switch)')).toBeTruthy()
  })

  it('has an input element', () => {
    render(<AppProvider><InputBar /></AppProvider>)
    expect(screen.getByRole('textbox')).toBeTruthy()
  })
})

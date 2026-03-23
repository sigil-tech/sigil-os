import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { AppProvider } from '../context/AppContext'
import { InputBar } from './InputBar'

describe('InputBar', () => {
  it('renders shell mode by default', () => {
    render(<AppProvider><InputBar /></AppProvider>)
    expect(screen.getByText('$')).toBeTruthy()
  })

  it('shows "Terminal not ready" placeholder when no PTY', () => {
    render(<AppProvider><InputBar /></AppProvider>)
    expect(screen.getByPlaceholderText('Terminal not ready')).toBeTruthy()
  })

  it('shows command placeholder when PTY is ready', () => {
    render(<AppProvider><InputBar activePtyId="test-pty" /></AppProvider>)
    expect(screen.getByPlaceholderText('Type a command (runs in terminal)...')).toBeTruthy()
  })
})

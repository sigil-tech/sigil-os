import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/preact'
import { AppProvider, useApp } from './AppContext'

function ViewDisplay() {
  const { activeView, setActiveView } = useApp()
  return (
    <div>
      <span data-testid="view">{activeView}</span>
      <button onClick={() => setActiveView('git')}>switch</button>
    </div>
  )
}

describe('AppContext', () => {
  it('defaults to terminal view', () => {
    render(<AppProvider><ViewDisplay /></AppProvider>)
    expect(screen.getByTestId('view').textContent).toBe('terminal')
  })

  it('switches view on setActiveView', async () => {
    render(<AppProvider><ViewDisplay /></AppProvider>)
    screen.getByText('switch').click()
    await waitFor(() => {
      expect(screen.getByTestId('view').textContent).toBe('git')
    })
  })
})

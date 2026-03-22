import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { ToastProvider, useToast } from '../context/ToastContext'
import { ToastContainer } from './Toast'

function TestTrigger({ message, type }: { message: string; type: 'success' | 'error' | 'info' }) {
  const { addToast } = useToast()
  return <button onClick={() => addToast(message, type)}>trigger</button>
}

describe('Toast', () => {
  it('renders nothing when no toasts', () => {
    const { container } = render(
      <ToastProvider>
        <ToastContainer />
      </ToastProvider>
    )
    expect(container.querySelector('.toast-container')).toBeNull()
  })

  it('shows a toast when triggered', async () => {
    render(
      <ToastProvider>
        <TestTrigger message="Test message" type="success" />
        <ToastContainer />
      </ToastProvider>
    )
    const btn = screen.getByText('trigger')
    btn.click()
    expect(await screen.findByText('Test message')).toBeTruthy()
  })

  it('applies correct class for error type', async () => {
    render(
      <ToastProvider>
        <TestTrigger message="Error!" type="error" />
        <ToastContainer />
      </ToastProvider>
    )
    screen.getByText('trigger').click()
    const toast = await screen.findByText('Error!')
    expect(toast.className).toContain('toast--error')
  })
})

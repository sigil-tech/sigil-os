import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SettingsPanel isOpen={false} onClose={() => {}} />)
    expect(container.querySelector('.settings-overlay')).toBeNull()
  })

  it('renders when open', () => {
    render(<SettingsPanel isOpen={true} onClose={() => {}} />)
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('shows notification level dropdown', () => {
    render(<SettingsPanel isOpen={true} onClose={() => {}} />)
    expect(screen.getByText('Notification Level')).toBeTruthy()
  })

  it('shows connection section', () => {
    render(<SettingsPanel isOpen={true} onClose={() => {}} />)
    expect(screen.getByText('Connection')).toBeTruthy()
  })

  it('shows purge button', () => {
    render(<SettingsPanel isOpen={true} onClose={() => {}} />)
    expect(screen.getByText('Purge All Data')).toBeTruthy()
  })
})

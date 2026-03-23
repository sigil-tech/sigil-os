import type { Meta, StoryObj } from '@storybook/preact'
import { ToastProvider } from '../context/ToastContext'
import { ToastContainer } from './Toast'
import { useToast } from '../context/ToastContext'

function ToastDemo() {
  const { addToast } = useToast()
  return (
    <div style={{ padding: '20px' }}>
      <button onClick={() => addToast('Operation successful', 'success')}>Success Toast</button>
      <button onClick={() => addToast('Something went wrong', 'error')} style={{ marginLeft: '8px' }}>Error Toast</button>
      <button onClick={() => addToast('FYI notification', 'info')} style={{ marginLeft: '8px' }}>Info Toast</button>
      <ToastContainer />
    </div>
  )
}

const meta: Meta = {
  title: 'Components/Toast',
  decorators: [(Story) => <ToastProvider><Story /></ToastProvider>],
}
export default meta

export const Default: StoryObj = {
  render: () => <ToastDemo />,
}

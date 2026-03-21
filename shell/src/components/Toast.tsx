import { useToast } from '../context/ToastContext'

export function ToastContainer() {
  const { toasts } = useToast()
  if (toasts.length === 0) return null
  return (
    <div class="toast-container">
      {toasts.map(t => (
        <div key={t.id} class={`toast toast--${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

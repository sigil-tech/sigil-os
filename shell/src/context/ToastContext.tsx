import { createContext } from 'preact'
import { useContext, useState, useCallback } from 'preact/hooks'

interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  createdAt: number
}

interface ToastState {
  toasts: ToastItem[]
  addToast: (message: string, type: 'success' | 'error' | 'info') => void
}

const ToastCtx = createContext<ToastState>({
  toasts: [],
  addToast: () => {},
})

export function ToastProvider({ children }: { children: preact.ComponentChildren }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const item: ToastItem = { id, message, type, createdAt: Date.now() }
    setToasts(prev => {
      const next = [...prev, item]
      return next.length > 3 ? next.slice(-3) : next
    })
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastCtx.Provider value={{ toasts, addToast }}>
      {children}
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

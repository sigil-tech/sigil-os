import { useEffect, useState } from 'preact/hooks'
import { listen } from '@tauri-apps/api/event'
import { GreetingCard } from './GreetingCard'
import { ConversationView, type Message } from './ConversationView'

export function LandingScreen() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Listen for AI responses from the InputBar
  useEffect(() => {
    let unlisten: (() => void) | undefined

    listen<{ response: string; routing?: string; latency_ms?: number }>('ai-response', (event) => {
      const { response, routing } = event.payload
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response, routing, timestamp: new Date() },
      ])
      setIsLoading(false)
    }).then((fn) => { unlisten = fn })

    return () => { unlisten?.() }
  }, [])

  // Listen for user queries (emitted by InputBar before sending to daemon)
  useEffect(() => {
    let unlisten: (() => void) | undefined

    listen<{ query: string }>('ai-query', (event) => {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: event.payload.query, timestamp: new Date() },
      ])
      setIsLoading(true)
    }).then((fn) => { unlisten = fn })

    return () => { unlisten?.() }
  }, [])

  return (
    <div class="landing-screen">
      <GreetingCard />
      <ConversationView messages={messages} isLoading={isLoading} />
    </div>
  )
}

import { useEffect, useRef } from 'preact/hooks'
import { renderMarkdown } from '../lib/markdown'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  routing?: string
  timestamp: Date
}

interface Props {
  messages: Message[]
  isLoading: boolean
}

export function ConversationView({ messages, isLoading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isLoading])

  if (messages.length === 0 && !isLoading) return null

  return (
    <div class="conversation">
      {messages.map((msg, i) => (
        <div key={i} class={`conversation__msg conversation__msg--${msg.role}`}>
          {msg.role === 'assistant' ? (
            <div
              class="conversation__content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
          ) : (
            <div class="conversation__content">{msg.content}</div>
          )}
          {msg.routing && (
            <span class="conversation__meta">{msg.routing}</span>
          )}
        </div>
      ))}
      {isLoading && (
        <div class="conversation__msg conversation__msg--assistant">
          <div class="conversation__content conversation__loading">Thinking...</div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

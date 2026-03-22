import { describe, it, expect } from 'vitest'
import { buildAIContext } from './context'

describe('buildAIContext', () => {
  it('includes view, cwd, branch, files, and commands', async () => {
    const ctx = await buildAIContext('terminal', [])
    expect(ctx).toContain('[View: terminal]')
    expect(ctx).toContain('[CWD:')
    expect(ctx).toContain('[Branch:')
    expect(ctx).toContain('[Recent files:')
    expect(ctx).toContain('[Recent commands:')
  })

  it('includes conversation history', async () => {
    const history = [
      { role: 'user' as const, content: 'hello' },
      { role: 'assistant' as const, content: 'hi there' },
    ]
    const ctx = await buildAIContext('terminal', history)
    expect(ctx).toContain('Previous conversation:')
    expect(ctx).toContain('User: hello')
    expect(ctx).toContain('Assistant: hi there')
  })

  it('truncates old history to stay under 4000 chars', async () => {
    const longHistory = Array.from({ length: 50 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: 'A'.repeat(200),
    }))
    const ctx = await buildAIContext('terminal', longHistory)
    expect(ctx.length).toBeLessThanOrEqual(4000)
  })
})

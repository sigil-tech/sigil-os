import { describe, it, expect, vi } from 'vitest'
import { progressiveReveal } from './progressive-reveal'

describe('progressiveReveal', () => {
  it('returns a cancel function', () => {
    const cancel = progressiveReveal('<p>hello world</p>', vi.fn(), 15)
    expect(typeof cancel).toBe('function')
    cancel()
  })

  it('calls onUpdate with partial content', async () => {
    const updates: string[] = []
    // Mock requestAnimationFrame for test environment
    let rafCallback: FrameRequestCallback | null = null
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb
      return 1
    })

    progressiveReveal('hello world', (partial) => updates.push(partial), 0)

    // Simulate several animation frames
    for (let i = 0; i < 10; i++) {
      if (rafCallback) (rafCallback as FrameRequestCallback)(i * 16)
    }

    expect(updates.length).toBeGreaterThan(0)

    vi.restoreAllMocks()
  })
})

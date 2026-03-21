/**
 * Progressive word-by-word reveal of rendered HTML.
 * Splits on word boundaries outside of HTML tags, keeping tags intact.
 * Returns a cancel function.
 */
export function progressiveReveal(
  html: string,
  onUpdate: (partial: string) => void,
  intervalMs: number = 15
): () => void {
  // Split HTML into tokens: HTML tags stay whole, text splits by whitespace
  const tokens: string[] = []
  let i = 0
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i)
      if (end !== -1) {
        tokens.push(html.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    // Collect text until next tag or end
    let text = ''
    while (i < html.length && html[i] !== '<') {
      text += html[i]
      i++
    }
    // Split text into words (preserving whitespace)
    const words = text.split(/(\s+)/)
    for (const w of words) {
      if (w) tokens.push(w)
    }
  }

  if (tokens.length === 0) {
    onUpdate(html)
    return () => {}
  }

  let tokenIndex = 0
  let cancelled = false
  let lastTime = 0

  function step(timestamp: number) {
    if (cancelled) return
    if (timestamp - lastTime >= intervalMs) {
      lastTime = timestamp
      tokenIndex++
      const partial = tokens.slice(0, tokenIndex).join('')
      onUpdate(partial)
      if (tokenIndex >= tokens.length) return
    }
    requestAnimationFrame(step)
  }

  requestAnimationFrame(step)

  return () => {
    cancelled = true
  }
}

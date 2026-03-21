/**
 * Hand-written markdown renderer. Zero dependencies.
 * Supports: headings, fenced code blocks, unordered/ordered lists,
 * paragraphs, bold, italic, inline code.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function parseInline(text: string): string {
  let result = ''
  let i = 0
  while (i < text.length) {
    // Inline code: `code`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        result += '<code>' + escapeHtml(text.slice(i + 1, end)) + '</code>'
        i = end + 1
        continue
      }
    }
    // Bold: **text**
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        result += '<strong>' + parseInline(text.slice(i + 2, end)) + '</strong>'
        i = end + 2
        continue
      }
    }
    // Italic: *text*
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1 && text[end + 1] !== '*') {
        result += '<em>' + parseInline(text.slice(i + 1, end)) + '</em>'
        i = end + 1
        continue
      }
    }
    result += escapeHtml(text[i])
    i++
  }
  return result
}

interface Block {
  type: 'heading' | 'code' | 'ul' | 'ol' | 'paragraph'
  content: string
  level?: number    // heading level 1-6
  lang?: string     // code block language
  items?: string[]  // list items
}

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      blocks.push({ type: 'code', content: codeLines.join('\n'), lang: lang || undefined })
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length })
      i++
      continue
    }

    // Unordered list
    if (/^[\-\*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[\-\*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\-\*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', content: '', items })
      continue
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push({ type: 'ol', content: '', items })
      continue
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph: collect consecutive non-empty, non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !lines[i].match(/^#{1,6}\s+/) &&
      !lines[i].match(/^[\-\*]\s+/) &&
      !lines[i].match(/^\d+\.\s+/)
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') })
    }
  }

  return blocks
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case 'heading': {
      const tag = `h${block.level}`
      return `<${tag}>${parseInline(block.content)}</${tag}>`
    }
    case 'code': {
      const escaped = escapeHtml(block.content)
      const cls = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : ''
      return `<pre><code${cls}>${escaped}</code></pre>`
    }
    case 'ul': {
      const items = (block.items ?? []).map((item) => `<li>${parseInline(item)}</li>`).join('')
      return `<ul>${items}</ul>`
    }
    case 'ol': {
      const items = (block.items ?? []).map((item) => `<li>${parseInline(item)}</li>`).join('')
      return `<ol>${items}</ol>`
    }
    case 'paragraph':
      return `<p>${parseInline(block.content)}</p>`
  }
}

export function renderMarkdown(text: string): string {
  if (!text) return ''
  const blocks = parseBlocks(text)
  return blocks.map(renderBlock).join('\n')
}

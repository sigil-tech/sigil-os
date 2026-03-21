import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })

  it('renders plain text as paragraph', () => {
    expect(renderMarkdown('hello world')).toBe('<p>hello world</p>')
  })

  it('renders h1', () => {
    expect(renderMarkdown('# Heading 1')).toBe('<h1>Heading 1</h1>')
  })

  it('renders h2 through h6', () => {
    expect(renderMarkdown('## H2')).toBe('<h2>H2</h2>')
    expect(renderMarkdown('### H3')).toBe('<h3>H3</h3>')
    expect(renderMarkdown('#### H4')).toBe('<h4>H4</h4>')
    expect(renderMarkdown('##### H5')).toBe('<h5>H5</h5>')
    expect(renderMarkdown('###### H6')).toBe('<h6>H6</h6>')
  })

  it('renders fenced code block with language', () => {
    const input = '```ts\nconst x = 1\n```'
    expect(renderMarkdown(input)).toBe(
      '<pre><code class="language-ts">const x = 1</code></pre>'
    )
  })

  it('renders fenced code block without language', () => {
    const input = '```\nsome code\n```'
    expect(renderMarkdown(input)).toBe('<pre><code>some code</code></pre>')
  })

  it('preserves special chars in code blocks', () => {
    const input = '```\n<div>&amp;</div>\n```'
    expect(renderMarkdown(input)).toBe(
      '<pre><code>&lt;div&gt;&amp;amp;&lt;/div&gt;</code></pre>'
    )
  })

  it('renders inline code', () => {
    expect(renderMarkdown('use `npm install` here')).toBe(
      '<p>use <code>npm install</code> here</p>'
    )
  })

  it('renders bold text', () => {
    expect(renderMarkdown('this is **bold** text')).toBe(
      '<p>this is <strong>bold</strong> text</p>'
    )
  })

  it('renders italic text', () => {
    expect(renderMarkdown('this is *italic* text')).toBe(
      '<p>this is <em>italic</em> text</p>'
    )
  })

  it('renders mixed inline formatting', () => {
    expect(renderMarkdown('**bold** and *italic*')).toBe(
      '<p><strong>bold</strong> and <em>italic</em></p>'
    )
  })

  it('renders unordered list', () => {
    const input = '- one\n- two\n- three'
    expect(renderMarkdown(input)).toBe(
      '<ul><li>one</li><li>two</li><li>three</li></ul>'
    )
  })

  it('renders unordered list with asterisks', () => {
    const input = '* alpha\n* beta'
    expect(renderMarkdown(input)).toBe(
      '<ul><li>alpha</li><li>beta</li></ul>'
    )
  })

  it('renders ordered list', () => {
    const input = '1. first\n2. second\n3. third'
    expect(renderMarkdown(input)).toBe(
      '<ol><li>first</li><li>second</li><li>third</li></ol>'
    )
  })

  it('escapes HTML in text content', () => {
    expect(renderMarkdown('use <div> & stuff')).toBe(
      '<p>use &lt;div&gt; &amp; stuff</p>'
    )
  })

  it('renders multiple blocks', () => {
    const input = '# Title\n\nA paragraph.\n\n- item'
    const result = renderMarkdown(input)
    expect(result).toContain('<h1>Title</h1>')
    expect(result).toContain('<p>A paragraph.</p>')
    expect(result).toContain('<ul><li>item</li></ul>')
  })
})

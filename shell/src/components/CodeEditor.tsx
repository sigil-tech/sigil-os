import { useEffect, useRef } from 'preact/hooks'
import { EditorView as CMEditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { rust } from '@codemirror/lang-rust'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { markdown } from '@codemirror/lang-markdown'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'

interface Props {
  content: string
  filePath: string
  onSave: (content: string) => void
  onChange?: (dirty: boolean) => void
}

function langFromPath(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'js': case 'jsx': case 'mjs': return javascript({ jsx: true })
    case 'ts': case 'tsx': return javascript({ jsx: true, typescript: true })
    case 'rs': return rust()
    case 'py': return python()
    case 'json': return json()
    case 'css': return css()
    case 'html': case 'htm': return html()
    case 'md': case 'mdx': return markdown()
    default: return []
  }
}

export function CodeEditor({ content, filePath, onSave, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<CMEditorView | null>(null)
  const initialContentRef = useRef(content)

  useEffect(() => {
    if (!containerRef.current) return

    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: (view) => {
        onSave(view.state.doc.toString())
        initialContentRef.current = view.state.doc.toString()
        onChange?.(false)
        return true
      }
    }])

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        bracketMatching(),
        foldGutter(),
        indentOnInput(),
        highlightSelectionMatches(),
        history(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        saveKeymap,
        langFromPath(filePath),
        CMEditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const dirty = update.state.doc.toString() !== initialContentRef.current
            onChange?.(dirty)
          }
        }),
        CMEditorView.theme({
          '&': { height: '100%', fontSize: '16px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: "'Fira Code', monospace" },
          '.cm-content': { caretColor: '#6366f1' },
        }),
      ],
    })

    const view = new CMEditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [filePath]) // re-create editor when file changes

  return <div ref={containerRef} class="code-editor" />
}

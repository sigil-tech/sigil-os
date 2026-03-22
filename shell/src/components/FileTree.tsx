import { useState, useEffect } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'

interface DirEntry {
  name: string
  path: string
  is_dir: boolean
}

interface Props {
  rootPath: string
  onFileSelect: (path: string) => void
}

function TreeNode({ entry, onFileSelect, depth }: { entry: DirEntry; onFileSelect: (path: string) => void; depth: number }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<DirEntry[]>([])

  async function toggle() {
    if (!entry.is_dir) {
      onFileSelect(entry.path)
      return
    }
    if (!expanded) {
      try {
        const entries = await invoke<DirEntry[]>('list_directory', { path: entry.path })
        setChildren(entries)
      } catch { setChildren([]) }
    }
    setExpanded(!expanded)
  }

  return (
    <div>
      <div
        class={`file-tree__node ${entry.is_dir ? 'file-tree__node--dir' : 'file-tree__node--file'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={toggle}
      >
        <span class="file-tree__icon">{entry.is_dir ? (expanded ? '▾' : '▸') : ' '}</span>
        <span class="file-tree__name">{entry.name}</span>
      </div>
      {expanded && children.map(child => (
        <TreeNode key={child.path} entry={child} onFileSelect={onFileSelect} depth={depth + 1} />
      ))}
    </div>
  )
}

export function FileTree({ rootPath, onFileSelect }: Props) {
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!rootPath) return
    invoke<DirEntry[]>('list_directory', { path: rootPath })
      .then(setEntries)
      .catch((e) => setError(String(e)))
  }, [rootPath])

  if (error) return <div class="file-tree__error">Could not read directory</div>

  return (
    <div class="file-tree">
      <div class="file-tree__header">{rootPath.split('/').pop() || rootPath}</div>
      {entries.map(entry => (
        <TreeNode key={entry.path} entry={entry} onFileSelect={onFileSelect} depth={0} />
      ))}
    </div>
  )
}

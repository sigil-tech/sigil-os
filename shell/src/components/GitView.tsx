import { useEffect, useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { useApp } from '../context/AppContext'

interface CommitSummary {
  sha: string
  message: string
  author: string
  timestamp_unix: number
}

interface FileStatus {
  path: string
  status: 'modified' | 'staged' | 'untracked' | 'deleted'
}

function relativeTime(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function GitView() {
  const { activeView } = useApp()
  const [repoPath, setRepoPath] = useState('')
  const [branch, setBranch] = useState('')
  const [files, setFiles] = useState<FileStatus[]>([])
  const [commits, setCommits] = useState<CommitSummary[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [isGitRepo, setIsGitRepo] = useState(true)
  const [knownRepos, setKnownRepos] = useState<string[]>([])

  // Detect repo from process cwd at launch time
  useEffect(() => {
    invoke<string>('get_cwd').then(setRepoPath).catch(() => setRepoPath('/home'))
  }, [])

  async function fetchGitData() {
    if (!repoPath) return
    let failCount = 0
    try {
      const b = await invoke<string>('git_branch', { repoPath })
      setBranch(b)
    } catch {
      setBranch('(no branch)')
      failCount++
    }
    try {
      const f = await invoke<FileStatus[]>('git_status', { repoPath })
      setFiles(f)
    } catch {
      failCount++
    }
    try {
      const c = await invoke<CommitSummary[]>('git_log', { repoPath, limit: 20 })
      setCommits(c)
    } catch {
      failCount++
    }
    setIsGitRepo(failCount < 3)
  }

  useEffect(() => {
    if (activeView !== 'git' || !repoPath) return
    fetchGitData()
    const id = setInterval(fetchGitData, 5000)
    return () => clearInterval(id)
  }, [activeView, repoPath])

  useEffect(() => {
    if (!selectedFile || !repoPath) return
    invoke<string>('git_diff', { repoPath, filePath: selectedFile })
      .then(setDiff)
      .catch(() => setDiff('(diff unavailable)'))
  }, [selectedFile, repoPath])

  // Fetch known repo paths from daemon config when not a git repo
  useEffect(() => {
    if (!isGitRepo) {
      invoke<{ repo_paths?: string[] }>('daemon_config')
        .then((cfg) => setKnownRepos(cfg.repo_paths ?? []))
        .catch(() => setKnownRepos([]))
    }
  }, [isGitRepo])

  if (!isGitRepo) {
    return (
      <div class="git-view">
        <div style={{ padding: '16px', color: 'var(--color-fg-muted)' }}>
          <div style={{ marginBottom: '12px' }}>Not a git repository</div>
          {knownRepos.length > 0 && (
            <div>
              <div style={{ marginBottom: '8px', fontSize: '14px', color: 'var(--color-fg)' }}>
                Known repositories:
              </div>
              {knownRepos.map((repo) => (
                <button
                  key={repo}
                  onClick={() => { setRepoPath(repo); setIsGitRepo(true) }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    marginBottom: '4px',
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    color: 'var(--color-fg)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-family)',
                    fontSize: '14px',
                  }}
                >
                  {repo}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div class="git-view">
      <div class="git-view__header">
        Branch: <span class="git-view__branch">{branch}</span>
        {repoPath && <span style={{ marginLeft: 12, opacity: 0.5 }}>{repoPath}</span>}
      </div>
      <div class="git-view__panels">
        <div class="git-view__files">
          {files.length === 0 && (
            <div style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
              {repoPath ? 'Working tree clean' : 'No repo detected'}
            </div>
          )}
          {files.map((f) => (
            <div
              key={f.path}
              class={`git-view__file-item${selectedFile === f.path ? ' git-view__file-item--active' : ''}`}
              onClick={() => setSelectedFile(f.path)}
            >
              <span class={`git-view__file-status git-view__file-status--${f.status}`}>
                {f.status.slice(0, 1).toUpperCase()}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.path}
              </span>
            </div>
          ))}
        </div>

        <div class="git-view__diff" style={{ flex: 1, overflow: 'auto' }}>
          {selectedFile ? (
            <pre>{diff || '(loading diff...)'}</pre>
          ) : (
            <div style={{ color: '#6b7280', fontSize: '14px', padding: '12px' }}>
              Select a file to view its diff
            </div>
          )}
        </div>
      </div>

      <div class="git-view__log">
        {commits.map((c) => (
          <div key={c.sha} class="git-view__commit">
            <span class="git-view__commit-sha">{c.sha}</span>
            {c.message}
            <span class="git-view__commit-author"> — {c.author}</span>
            <span style={{ float: 'right', color: '#6b7280' }}>{relativeTime(c.timestamp_unix)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useApp } from '../context/AppContext'

export function PathBar() {
  const { cwd, gitRoot, gitBranch } = useApp()

  if (!cwd) return null

  // Abbreviate path relative to ~/workspace when inside it
  const home = '/home/nick' // TODO: resolve dynamically if needed
  let displayPath = cwd
  if (cwd.startsWith(home + '/workspace/')) {
    displayPath = cwd.slice((home + '/workspace/').length)
  } else if (cwd.startsWith(home)) {
    displayPath = '~' + cwd.slice(home.length)
  }

  return (
    <div class="path-bar">
      {gitRoot && gitBranch && (
        <span class="path-bar__branch"> {gitBranch}</span>
      )}
      <span class="path-bar__path">{displayPath}</span>
    </div>
  )
}

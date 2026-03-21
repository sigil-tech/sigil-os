import { invoke } from '@tauri-apps/api/core'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  routing?: string
}

async function safeinvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invoke<T>(cmd, args)
  } catch {
    return null
  }
}

export async function buildAIContext(
  activeView: string,
  history: ConversationTurn[]
): Promise<string> {
  const cwd = await safeinvoke<string>('get_cwd') ?? '~'
  const branch = cwd
    ? await safeinvoke<string>('git_branch', { repoPath: cwd }) ?? ''
    : ''
  const files = await safeinvoke<string[]>('daemon_files') ?? []
  const commands = await safeinvoke<string[]>('daemon_commands') ?? []

  const parts: string[] = []
  parts.push(`[View: ${activeView}]`)
  parts.push(`[CWD: ${cwd}]`)
  if (branch) parts.push(`[Branch: ${branch}]`)
  if (files.length > 0) parts.push(`[Recent files: ${files.slice(0, 5).join(', ')}]`)
  if (commands.length > 0) parts.push(`[Recent commands: ${commands.slice(0, 5).join(', ')}]`)

  // Append conversation history, truncating oldest first to stay under 4000 chars
  if (history.length > 0) {
    parts.push('')
    parts.push('Previous conversation:')

    const turnLines = history.map((t) =>
      `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`
    )

    // Calculate header size
    const headerSize = parts.join('\n').length + 1 // +1 for joining newline

    // Add turns from newest to oldest, truncating when we'd exceed 4000
    const includedTurns: string[] = []
    let totalSize = headerSize
    for (let i = turnLines.length - 1; i >= 0; i--) {
      const lineSize = turnLines[i].length + 1
      if (totalSize + lineSize > 4000) break
      includedTurns.unshift(turnLines[i])
      totalSize += lineSize
    }

    parts.push(...includedTurns)
  }

  return parts.join('\n')
}

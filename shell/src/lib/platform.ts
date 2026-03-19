/**
 * Platform detection for Sigil Shell.
 *
 * When running in launcher mode (macOS connecting to VM), the terminal
 * uses SSH-based remote PTY. When running natively on Linux, it uses
 * local PTY. The detection is based on the daemon transport setting.
 */

import { invoke } from '@tauri-apps/api/core'

export type Platform = 'linux-native' | 'macos-launcher'

let cachedPlatform: Platform | null = null

/**
 * Detects whether we're running in launcher mode (macOS, TCP transport)
 * or native mode (Linux, Unix socket).
 */
export async function detectPlatform(): Promise<Platform> {
  if (cachedPlatform) return cachedPlatform

  try {
    const status = await invoke<{ transport: string; connected: boolean }>('get_connection_status')
    cachedPlatform = status.transport === 'tcp' ? 'macos-launcher' : 'linux-native'
  } catch {
    // Fallback: if we can't determine, assume native
    cachedPlatform = 'linux-native'
  }

  return cachedPlatform
}

/**
 * Returns true if running in launcher mode (macOS, VM-backed).
 */
export async function isLauncherMode(): Promise<boolean> {
  return (await detectPlatform()) === 'macos-launcher'
}

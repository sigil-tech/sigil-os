import type { ViewId } from '../context/AppContext'

export type SplitMode = 'none' | 'horizontal' | 'vertical'

export interface SplitState {
  mode: SplitMode
  primaryView: ViewId
  secondaryView: ViewId
  focus: 'primary' | 'secondary'
  initiator: 'user' | 'daemon'
}

export const defaultSplit: SplitState = {
  mode: 'none',
  primaryView: 'terminal',
  secondaryView: 'editor',
  focus: 'primary',
  initiator: 'user',
}

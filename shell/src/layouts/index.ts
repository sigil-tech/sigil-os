import type { ViewId } from '../context/AppContext'

export type SplitMode = 'none'

export interface SplitState {
  mode: SplitMode
  primaryView: ViewId
  focus: 'primary'
  initiator: 'user' | 'daemon'
}

export const defaultSplit: SplitState = {
  mode: 'none',
  primaryView: 'home',
  focus: 'primary',
  initiator: 'user',
}

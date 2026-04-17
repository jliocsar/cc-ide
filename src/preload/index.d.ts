import type { CcIdeApi } from './index'

declare global {
  interface Window {
    ccIde: CcIdeApi
  }
}

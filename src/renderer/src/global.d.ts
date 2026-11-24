import type { HelixAPI } from '../../shared/contract'

declare global {
  interface Window {
    helix: HelixAPI
  }
}

export {}

import type { EventEmitter } from 'node:events'

interface OwnedSessions {
  closeOwnedBy(owner: object): number
}

function isDocumentNavigation(details: unknown): boolean {
  if (typeof details !== 'object' || details === null) {
    return false
  }
  const { isMainFrame, isSameDocument } = details as Record<string, unknown>
  return isMainFrame === true && isSameDocument === false
}

/**
 * Ata las sesiones al contenido que las creó (un `webContents` de Electron): si navega
 * o se recarga (`did-start-navigation` del marco principal y de otro documento), se
 * destruye (`destroyed`) o su proceso se cae (`render-process-gone`), se cierran sus
 * sesiones. Sin esto, recargar la interfaz dejaría shells vivos y sin dueño.
 */
export function bindSessionLifecycle(sessions: OwnedSessions, contents: EventEmitter): void {
  const closeSessions = (): void => {
    sessions.closeOwnedBy(contents)
  }

  contents.on('did-start-navigation', (details: unknown) => {
    if (isDocumentNavigation(details)) {
      closeSessions()
    }
  })
  contents.on('render-process-gone', closeSessions)
  contents.on('destroyed', closeSessions)
}

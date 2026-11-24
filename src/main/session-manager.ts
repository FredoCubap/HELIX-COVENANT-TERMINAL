import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { chooseShell, type ShellResolution } from './shells'

export const MAX_SESSIONS = 16
export const MAX_COLS = 500
export const MAX_ROWS = 200
export const MAX_WRITE_BYTES = 64 * 1024

export type SessionErrorCode =
  | 'invalid_request'
  | 'shell_not_found'
  | 'invalid_directory'
  | 'session_limit'
  | 'session_not_found'
  | 'payload_too_large'
  | 'internal_error'

export type SessionResult = { readonly ok: true } | { readonly ok: false; code: SessionErrorCode }
export type CreateResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly code: SessionErrorCode }

/** Lo mínimo que el gestor necesita de un PTY; `IPty` de node-pty lo cumple tal cual. */
export interface PtyProcess {
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void }
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
}

export interface PtySpawnOptions {
  readonly name: string
  readonly cols: number
  readonly rows: number
  readonly cwd: string
  readonly env: Record<string, string>
}

export type PtySpawn = (file: string, args: string[], options: PtySpawnOptions) => PtyProcess

export interface SessionEvents {
  data(id: string, chunk: string): void
  exit(id: string, exitCode: number): void
}

export interface SessionManagerDependencies {
  readonly shells: ShellResolution
  readonly spawn: PtySpawn
  readonly env: Readonly<Record<string, string | undefined>>
  readonly homeDirectory: string
  isDirectory(path: string): boolean
  readonly events: SessionEvents
  logError(context: string, error: unknown): void
}

export interface CreateOptions {
  readonly shellId?: unknown
  readonly cwd?: unknown
  readonly cols: number
  readonly rows: number
}

interface Session {
  readonly pty: PtyProcess
  readonly subscriptions: readonly { dispose(): void }[]
}

/**
 * Entorno del hijo: el del usuario sin las variables internas de la aplicación
 * (ELECTRON_*, como ELECTRON_RUN_AS_NODE, o HELIX_*) y con el terminal declarado.
 * Windows no distingue mayúsculas en los nombres, así que se compara en mayúsculas.
 */
export function buildChildEnv(
  base: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(base)) {
    const upper = name.toUpperCase()
    if (value !== undefined && !upper.startsWith('ELECTRON_') && !upper.startsWith('HELIX_')) {
      env[name] = value
    }
  }
  env['TERM'] = 'xterm-256color'
  env['COLORTERM'] = 'truecolor'
  return env
}

function isValidSize(cols: unknown, rows: unknown): boolean {
  return (
    typeof cols === 'number' &&
    typeof rows === 'number' &&
    Number.isInteger(cols) &&
    Number.isInteger(rows) &&
    cols >= 1 &&
    cols <= MAX_COLS &&
    rows >= 1 &&
    rows <= MAX_ROWS
  )
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>()

  constructor(private readonly dependencies: SessionManagerDependencies) {}

  get count(): number {
    return this.sessions.size
  }

  create(options: CreateOptions): CreateResult {
    const { shells, spawn, homeDirectory } = this.dependencies

    if (!isValidSize(options.cols, options.rows)) {
      return { ok: false, code: 'invalid_request' }
    }
    const shell = chooseShell(shells, options.shellId)
    if (shell === null) {
      return { ok: false, code: 'shell_not_found' }
    }
    if (options.cwd !== undefined) {
      if (
        typeof options.cwd !== 'string' ||
        !isAbsolute(options.cwd) ||
        !this.dependencies.isDirectory(options.cwd)
      ) {
        return { ok: false, code: 'invalid_directory' }
      }
    }
    if (this.sessions.size >= MAX_SESSIONS) {
      return { ok: false, code: 'session_limit' }
    }

    const id = randomUUID()
    try {
      const pty = spawn(shell.path, [], {
        name: 'xterm-256color',
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd ?? homeDirectory,
        env: buildChildEnv(this.dependencies.env),
      })
      const { events } = this.dependencies
      const subscriptions = [
        pty.onData((chunk) => {
          events.data(id, chunk)
        }),
        pty.onExit(({ exitCode }) => {
          this.release(id)
          events.exit(id, exitCode)
        }),
      ]
      this.sessions.set(id, { pty, subscriptions })
    } catch (error) {
      this.dependencies.logError('No se pudo crear la sesión de shell.', error)
      return { ok: false, code: 'internal_error' }
    }
    return { ok: true, id }
  }

  write(id: string, data: unknown): SessionResult {
    const session = this.sessions.get(id)
    if (session === undefined) {
      return { ok: false, code: 'session_not_found' }
    }
    if (typeof data !== 'string') {
      return { ok: false, code: 'invalid_request' }
    }
    if (Buffer.byteLength(data, 'utf8') > MAX_WRITE_BYTES) {
      return { ok: false, code: 'payload_too_large' }
    }
    session.pty.write(data)
    return { ok: true }
  }

  resize(id: string, cols: number, rows: number): SessionResult {
    const session = this.sessions.get(id)
    if (session === undefined) {
      return { ok: false, code: 'session_not_found' }
    }
    if (!isValidSize(cols, rows)) {
      return { ok: false, code: 'invalid_request' }
    }
    session.pty.resize(cols, rows)
    return { ok: true }
  }

  close(id: string): SessionResult {
    const session = this.sessions.get(id)
    if (session === undefined) {
      return { ok: false, code: 'session_not_found' }
    }
    this.release(id)
    session.pty.kill()
    return { ok: true }
  }

  /** Libera la sesión: deja de escuchar al PTY y libera su cupo. No notifica el fin. */
  private release(id: string): void {
    const session = this.sessions.get(id)
    if (session === undefined) {
      return
    }
    this.sessions.delete(id)
    session.subscriptions.forEach((subscription) => {
      subscription.dispose()
    })
  }
}

import { isAbsolute } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildChildEnv,
  MAX_SESSIONS,
  MAX_WRITE_BYTES,
  SessionManager,
  type PtyProcess,
  type PtySpawn,
  type PtySpawnOptions,
} from '../src/main/session-manager'
import { chooseShell, type ShellResolution } from '../src/main/shells'

class FakePty implements PtyProcess {
  readonly writes: string[] = []
  readonly resizes: [number, number][] = []
  killed = 0
  private dataListeners: ((data: string) => void)[] = []
  private exitListeners: ((event: { exitCode: number }) => void)[] = []

  onData(listener: (data: string) => void): { dispose(): void } {
    this.dataListeners.push(listener)
    return {
      dispose: () => {
        this.dataListeners = this.dataListeners.filter((item) => item !== listener)
      },
    }
  }

  onExit(listener: (event: { exitCode: number }) => void): { dispose(): void } {
    this.exitListeners.push(listener)
    return {
      dispose: () => {
        this.exitListeners = this.exitListeners.filter((item) => item !== listener)
      },
    }
  }

  write(data: string): void {
    this.writes.push(data)
  }

  resize(cols: number, rows: number): void {
    this.resizes.push([cols, rows])
  }

  kill(): void {
    this.killed += 1
  }

  emitData(data: string): void {
    this.dataListeners.forEach((listener) => {
      listener(data)
    })
  }

  emitExit(exitCode: number): void {
    this.exitListeners.forEach((listener) => {
      listener({ exitCode })
    })
  }
}

const shells: ShellResolution = {
  shells: [
    { id: 'bash', path: '/bin/bash' },
    { id: 'sh', path: '/bin/sh' },
  ],
  defaultId: 'bash',
}
const existingDirectory = isAbsolute('/tmp') ? '/tmp' : 'C:\\Windows'

function makeManager(overrides: { env?: Record<string, string | undefined> } = {}) {
  const ptys: FakePty[] = []
  const spawnCalls: { file: string; args: string[]; options: PtySpawnOptions }[] = []
  const spawn: PtySpawn = (file, args, options) => {
    const pty = new FakePty()
    ptys.push(pty)
    spawnCalls.push({ file, args, options })
    return pty
  }
  const events = { data: vi.fn(), exit: vi.fn() }
  const logError = vi.fn()
  const manager = new SessionManager({
    shells,
    spawn,
    env: overrides.env ?? { PATH: '/usr/bin', HOME: '/home/fredo' },
    homeDirectory: '/home/fredo',
    isDirectory: (path) => path === existingDirectory,
    events,
    logError,
  })
  return { manager, ptys, spawnCalls, events, logError }
}

function createdId(result: ReturnType<SessionManager['create']>): string {
  if (!result.ok) {
    throw new Error(`No se creó la sesión: ${result.code}`)
  }
  return result.id
}

describe('chooseShell: elección acotada por identificador', () => {
  it('acepta un identificador detectado y el predeterminado', () => {
    expect(chooseShell(shells, 'sh')).toEqual({ id: 'sh', path: '/bin/sh' })
    expect(chooseShell(shells, undefined)).toEqual({ id: 'bash', path: '/bin/bash' })
  })

  it.each([
    '/bin/bash',
    'C:\\Windows\\System32\\cmd.exe',
    '../bash',
    'bash --login',
    'bash;rm',
    'BASH',
    '',
    'zsh',
    null,
    42,
    { id: 'bash' },
  ])('rechaza %j', (requested) => {
    expect(chooseShell(shells, requested)).toBeNull()
  })

  it('no devuelve nada si no hay ningún shell detectado', () => {
    expect(chooseShell({ shells: [], defaultId: null }, undefined)).toBeNull()
  })
})

describe('SessionManager: creación', () => {
  it('crea una sesión con el shell detectado, su directorio y dimensiones', () => {
    const { manager, spawnCalls } = makeManager()

    const result = manager.create({ shellId: 'sh', cols: 100, rows: 30 })

    expect(result.ok).toBe(true)
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0]).toMatchObject({
      file: '/bin/sh',
      args: [],
      options: { cols: 100, rows: 30, cwd: '/home/fredo', name: 'xterm-256color' },
    })
  })

  it('usa el shell predeterminado si no se indica ninguno', () => {
    const { manager, spawnCalls } = makeManager()

    manager.create({ cols: 80, rows: 24 })

    expect(spawnCalls[0]?.file).toBe('/bin/bash')
  })

  it('usa el directorio indicado si existe', () => {
    const { manager, spawnCalls } = makeManager()

    manager.create({ cwd: existingDirectory, cols: 80, rows: 24 })

    expect(spawnCalls[0]?.options.cwd).toBe(existingDirectory)
  })

  it('rechaza un directorio inexistente, relativo o que no es texto, sin ejecutar nada', () => {
    const { manager, spawnCalls } = makeManager()

    for (const cwd of ['/no/existe', 'relativo', '', 42, null, {}]) {
      expect(manager.create({ cwd, cols: 80, rows: 24 })).toEqual({
        ok: false,
        code: 'invalid_directory',
      })
    }
    expect(spawnCalls).toHaveLength(0)
    expect(manager.count).toBe(0)
  })

  it('rechaza rutas y argumentos arbitrarios sin ejecutar ningún proceso', () => {
    const { manager, spawnCalls } = makeManager()

    for (const shellId of ['/bin/bash', 'C:\\Windows\\System32\\cmd.exe', 'bash -c id', '../sh']) {
      expect(manager.create({ shellId, cols: 80, rows: 24 })).toEqual({
        ok: false,
        code: 'shell_not_found',
      })
    }
    expect(spawnCalls).toHaveLength(0)
    expect(manager.count).toBe(0)
  })

  it.each([
    [0, 24],
    [80, 0],
    [501, 24],
    [80, 201],
    [-1, 24],
    [80.5, 24],
    [Number.NaN, 24],
    [Number.POSITIVE_INFINITY, 24],
  ])('rechaza dimensiones fuera de rango (%s x %s)', (cols, rows) => {
    const { manager, spawnCalls } = makeManager()

    expect(manager.create({ cols, rows })).toEqual({ ok: false, code: 'invalid_request' })
    expect(spawnCalls).toHaveLength(0)
  })

  it('acepta las dimensiones límite', () => {
    const { manager } = makeManager()

    expect(manager.create({ cols: 1, rows: 1 }).ok).toBe(true)
    expect(manager.create({ cols: 500, rows: 200 }).ok).toBe(true)
  })

  it('rechaza la sesión 17 y no afecta a las existentes', () => {
    const { manager, ptys } = makeManager()
    for (let index = 0; index < MAX_SESSIONS; index += 1) {
      expect(manager.create({ cols: 80, rows: 24 }).ok).toBe(true)
    }

    expect(manager.create({ cols: 80, rows: 24 })).toEqual({ ok: false, code: 'session_limit' })
    expect(manager.count).toBe(MAX_SESSIONS)
    expect(ptys).toHaveLength(MAX_SESSIONS)
    expect(ptys.every((pty) => pty.killed === 0)).toBe(true)
  })

  it('devuelve un error limpio, sin filtrar la excepción, si el PTY no arranca', () => {
    const logError = vi.fn()
    const manager = new SessionManager({
      shells,
      spawn: () => {
        throw new Error('fallo en C:\\privado\\secreto')
      },
      env: {},
      homeDirectory: '/home/fredo',
      isDirectory: () => true,
      events: { data: vi.fn(), exit: vi.fn() },
      logError,
    })

    const result = manager.create({ cols: 80, rows: 24 })

    expect(result).toEqual({ ok: false, code: 'internal_error' })
    expect(JSON.stringify(result)).not.toContain('secreto')
    expect(logError).toHaveBeenCalledOnce()
    expect(manager.count).toBe(0)
  })

  it('genera identificadores opacos, aleatorios y distintos', () => {
    const { manager } = makeManager()

    const ids = Array.from({ length: 5 }, () => createdId(manager.create({ cols: 80, rows: 24 })))

    expect(new Set(ids).size).toBe(5)
    ids.forEach((id) => {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })
  })
})

describe('SessionManager: entrada, redimensionado y cierre', () => {
  it('escribe en el orden recibido', () => {
    const { manager, ptys } = makeManager()
    const id = createdId(manager.create({ cols: 80, rows: 24 }))

    manager.write(id, 'ls')
    manager.write(id, '\r')

    expect(ptys[0]?.writes).toEqual(['ls', '\r'])
  })

  it('rechaza una escritura de más de 64 KB sin pasarla al shell', () => {
    const { manager, ptys } = makeManager()
    const id = createdId(manager.create({ cols: 80, rows: 24 }))

    expect(manager.write(id, 'a'.repeat(MAX_WRITE_BYTES))).toEqual({ ok: true })
    expect(manager.write(id, 'a'.repeat(MAX_WRITE_BYTES + 1))).toEqual({
      ok: false,
      code: 'payload_too_large',
    })
    // El límite es en bytes: 'ñ' ocupa dos.
    expect(manager.write(id, 'ñ'.repeat(MAX_WRITE_BYTES / 2 + 1))).toEqual({
      ok: false,
      code: 'payload_too_large',
    })
    expect(ptys[0]?.writes).toHaveLength(1)
  })

  it('rechaza una escritura que no es texto', () => {
    const { manager, ptys } = makeManager()
    const id = createdId(manager.create({ cols: 80, rows: 24 }))

    expect(manager.write(id, 42)).toEqual({ ok: false, code: 'invalid_request' })
    expect(manager.write(id, null)).toEqual({ ok: false, code: 'invalid_request' })
    expect(ptys[0]?.writes).toHaveLength(0)
  })

  it('redimensiona dentro de los límites y rechaza lo que queda fuera', () => {
    const { manager, ptys } = makeManager()
    const id = createdId(manager.create({ cols: 80, rows: 24 }))

    expect(manager.resize(id, 120, 40)).toEqual({ ok: true })
    expect(manager.resize(id, 501, 40)).toEqual({ ok: false, code: 'invalid_request' })
    expect(manager.resize(id, 120, 0)).toEqual({ ok: false, code: 'invalid_request' })
    expect(ptys[0]?.resizes).toEqual([[120, 40]])
  })

  it('devuelve un error, sin lanzar, ante un identificador inexistente', () => {
    const { manager } = makeManager()
    const id = createdId(manager.create({ cols: 80, rows: 24 }))
    const notFound = { ok: false, code: 'session_not_found' }

    for (const unknown of ['no-existe', '', '__proto__', 'constructor', `${id}x`]) {
      expect(manager.write(unknown, 'x')).toEqual(notFound)
      expect(manager.resize(unknown, 80, 24)).toEqual(notFound)
      expect(manager.close(unknown)).toEqual(notFound)
    }
    expect(manager.count).toBe(1)
  })

  it('cierra la sesión, libera su cupo y no notifica fin', () => {
    const { manager, ptys, events } = makeManager()
    const id = createdId(manager.create({ cols: 80, rows: 24 }))

    expect(manager.close(id)).toEqual({ ok: true })

    expect(ptys[0]?.killed).toBe(1)
    expect(manager.count).toBe(0)
    expect(manager.write(id, 'x')).toEqual({ ok: false, code: 'session_not_found' })
    ptys[0]?.emitExit(0)
    expect(events.exit).not.toHaveBeenCalled()
  })
})

describe('SessionManager: salida y fin de sesión', () => {
  it('reenvía la salida con el identificador de su sesión', () => {
    const { manager, ptys, events } = makeManager()
    const first = createdId(manager.create({ cols: 80, rows: 24 }))
    const second = createdId(manager.create({ cols: 80, rows: 24 }))

    ptys[1]?.emitData('hola áéíóú ñ')

    expect(events.data).toHaveBeenCalledOnce()
    expect(events.data).toHaveBeenCalledWith(second, 'hola áéíóú ñ')
    expect(events.data).not.toHaveBeenCalledWith(first, expect.anything())
  })

  it.each([0, 3, 130])('notifica el fin con el código %s y libera la sesión', (exitCode) => {
    const { manager, ptys, events } = makeManager()
    const id = createdId(manager.create({ cols: 80, rows: 24 }))

    ptys[0]?.emitExit(exitCode)

    expect(events.exit).toHaveBeenCalledExactlyOnceWith(id, exitCode)
    expect(manager.count).toBe(0)
    expect(manager.write(id, 'x')).toEqual({ ok: false, code: 'session_not_found' })
  })

  it('libera el cupo: tras terminar una sesión se puede crear otra', () => {
    const { manager, ptys } = makeManager()
    for (let index = 0; index < MAX_SESSIONS; index += 1) {
      manager.create({ cols: 80, rows: 24 })
    }
    expect(manager.create({ cols: 80, rows: 24 }).ok).toBe(false)

    ptys[0]?.emitExit(0)

    expect(manager.create({ cols: 80, rows: 24 }).ok).toBe(true)
  })

  it('deja de reenviar salida y de notificar tras terminar', () => {
    const { manager, ptys, events } = makeManager()
    manager.create({ cols: 80, rows: 24 })

    ptys[0]?.emitExit(0)
    ptys[0]?.emitData('tarde')
    ptys[0]?.emitExit(1)

    expect(events.data).not.toHaveBeenCalled()
    expect(events.exit).toHaveBeenCalledOnce()
  })
})

describe('buildChildEnv', () => {
  it('quita las variables internas de la aplicación y declara el terminal', () => {
    const env = buildChildEnv({
      PATH: '/usr/bin',
      ELECTRON_RUN_AS_NODE: '1',
      electron_run_as_node: '1',
      ELECTRON_RENDERER_URL: 'http://localhost:5173',
      HELIX_TEST_USER_DATA_DIR: '/tmp/x',
      TERM: 'dumb',
      COLORTERM: 'no',
      EMPTY: undefined,
    })

    expect(env).toEqual({ PATH: '/usr/bin', TERM: 'xterm-256color', COLORTERM: 'truecolor' })
  })

  it('conserva el resto del entorno del usuario', () => {
    const env = buildChildEnv({ HOME: '/home/fredo', LANG: 'es_ES.UTF-8', NODE_OPTIONS: '--x' })

    expect(env).toMatchObject({ HOME: '/home/fredo', LANG: 'es_ES.UTF-8', NODE_OPTIONS: '--x' })
  })
})

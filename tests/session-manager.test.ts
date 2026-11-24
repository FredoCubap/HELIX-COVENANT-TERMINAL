import { EventEmitter } from 'node:events'
import { isAbsolute } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSessionLifecycle } from '../src/main/session-lifecycle'
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
  private static nextPid = 1000
  readonly pid = (FakePty.nextPid += 1)
  readonly writes: string[] = []
  readonly resizes: [number, number][] = []
  killed = 0
  killError: Error | null = null
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
    if (this.killError !== null) {
      throw this.killError
    }
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

const owner = {}
const GRACE_MS = 1000

/** Control de procesos simulado: `alive` es el conjunto de PIDs que siguen vivos. */
function fakeProcessControl(descendants: number[] = []) {
  const alive = new Set(descendants)
  return {
    alive,
    listDescendants: vi.fn((): number[] => [...descendants]),
    isAlive: vi.fn((pid: number) => alive.has(pid)),
    forceKill: vi.fn(),
  }
}

function makeManager(overrides: { env?: Record<string, string | undefined> } = {}) {
  const processControl = fakeProcessControl()
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
    processControl,
    closeGraceMs: GRACE_MS,
    logError,
  })
  return { manager, ptys, spawnCalls, events, logError, processControl }
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

    const result = manager.create({ owner, shellId: 'sh', cols: 100, rows: 30 })

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

    manager.create({ owner, cols: 80, rows: 24 })

    expect(spawnCalls[0]?.file).toBe('/bin/bash')
  })

  it('usa el directorio indicado si existe', () => {
    const { manager, spawnCalls } = makeManager()

    manager.create({ owner, cwd: existingDirectory, cols: 80, rows: 24 })

    expect(spawnCalls[0]?.options.cwd).toBe(existingDirectory)
  })

  it('rechaza un directorio inexistente, relativo o que no es texto, sin ejecutar nada', () => {
    const { manager, spawnCalls } = makeManager()

    for (const cwd of ['/no/existe', 'relativo', '', 42, null, {}]) {
      expect(manager.create({ owner, cwd, cols: 80, rows: 24 })).toEqual({
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
      expect(manager.create({ owner, shellId, cols: 80, rows: 24 })).toEqual({
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

    expect(manager.create({ owner, cols, rows })).toEqual({ ok: false, code: 'invalid_request' })
    expect(spawnCalls).toHaveLength(0)
  })

  it('acepta las dimensiones límite', () => {
    const { manager } = makeManager()

    expect(manager.create({ owner, cols: 1, rows: 1 }).ok).toBe(true)
    expect(manager.create({ owner, cols: 500, rows: 200 }).ok).toBe(true)
  })

  it('rechaza la sesión 17 y no afecta a las existentes', () => {
    const { manager, ptys } = makeManager()
    for (let index = 0; index < MAX_SESSIONS; index += 1) {
      expect(manager.create({ owner, cols: 80, rows: 24 }).ok).toBe(true)
    }

    expect(manager.create({ owner, cols: 80, rows: 24 })).toEqual({
      ok: false,
      code: 'session_limit',
    })
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
      processControl: fakeProcessControl(),
      logError,
    })

    const result = manager.create({ owner, cols: 80, rows: 24 })

    expect(result).toEqual({ ok: false, code: 'internal_error' })
    expect(JSON.stringify(result)).not.toContain('secreto')
    expect(logError).toHaveBeenCalledOnce()
    expect(manager.count).toBe(0)
  })

  it('genera identificadores opacos, aleatorios y distintos', () => {
    const { manager } = makeManager()

    const ids = Array.from({ length: 5 }, () =>
      createdId(manager.create({ owner, cols: 80, rows: 24 })),
    )

    expect(new Set(ids).size).toBe(5)
    ids.forEach((id) => {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })
  })
})

describe('SessionManager: entrada, redimensionado y cierre', () => {
  it('escribe en el orden recibido', () => {
    const { manager, ptys } = makeManager()
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))

    manager.write(id, 'ls')
    manager.write(id, '\r')

    expect(ptys[0]?.writes).toEqual(['ls', '\r'])
  })

  it('rechaza una escritura de más de 64 KB sin pasarla al shell', () => {
    const { manager, ptys } = makeManager()
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))

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
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))

    expect(manager.write(id, 42)).toEqual({ ok: false, code: 'invalid_request' })
    expect(manager.write(id, null)).toEqual({ ok: false, code: 'invalid_request' })
    expect(ptys[0]?.writes).toHaveLength(0)
  })

  it('redimensiona dentro de los límites y rechaza lo que queda fuera', () => {
    const { manager, ptys } = makeManager()
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))

    expect(manager.resize(id, 120, 40)).toEqual({ ok: true })
    expect(manager.resize(id, 501, 40)).toEqual({ ok: false, code: 'invalid_request' })
    expect(manager.resize(id, 120, 0)).toEqual({ ok: false, code: 'invalid_request' })
    expect(ptys[0]?.resizes).toEqual([[120, 40]])
  })

  it('devuelve un error, sin lanzar, ante un identificador inexistente', () => {
    const { manager } = makeManager()
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))
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
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))

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
    const first = createdId(manager.create({ owner, cols: 80, rows: 24 }))
    const second = createdId(manager.create({ owner, cols: 80, rows: 24 }))

    ptys[1]?.emitData('hola áéíóú ñ')

    expect(events.data).toHaveBeenCalledOnce()
    expect(events.data).toHaveBeenCalledWith(second, 'hola áéíóú ñ')
    expect(events.data).not.toHaveBeenCalledWith(first, expect.anything())
  })

  it.each([0, 3, 130])('notifica el fin con el código %s y libera la sesión', (exitCode) => {
    const { manager, ptys, events } = makeManager()
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))

    ptys[0]?.emitExit(exitCode)

    expect(events.exit).toHaveBeenCalledExactlyOnceWith(id, exitCode)
    expect(manager.count).toBe(0)
    expect(manager.write(id, 'x')).toEqual({ ok: false, code: 'session_not_found' })
  })

  it('libera el cupo: tras terminar una sesión se puede crear otra', () => {
    const { manager, ptys } = makeManager()
    for (let index = 0; index < MAX_SESSIONS; index += 1) {
      manager.create({ owner, cols: 80, rows: 24 })
    }
    expect(manager.create({ owner, cols: 80, rows: 24 }).ok).toBe(false)

    ptys[0]?.emitExit(0)

    expect(manager.create({ owner, cols: 80, rows: 24 }).ok).toBe(true)
  })

  it('deja de reenviar salida y de notificar tras terminar', () => {
    const { manager, ptys, events } = makeManager()
    manager.create({ owner, cols: 80, rows: 24 })

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

describe('SessionManager: cierre escalonado', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function managerWithControl(descendants: number[] = []) {
    vi.useFakeTimers()
    const ptys: FakePty[] = []
    const processControl = fakeProcessControl(descendants)
    const logError = vi.fn()
    const manager = new SessionManager({
      shells,
      spawn: () => {
        const pty = new FakePty()
        ptys.push(pty)
        return pty
      },
      env: {},
      homeDirectory: '/home/fredo',
      isDirectory: () => true,
      events: { data: vi.fn(), exit: vi.fn() },
      processControl,
      closeGraceMs: GRACE_MS,
      logError,
    })
    return { manager, ptys, processControl, logError }
  }

  it('cierra con cortesía y no fuerza nada si el shell sale y no quedan descendientes', async () => {
    const { manager, ptys, processControl } = managerWithControl()
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))

    manager.close(id)
    expect(ptys[0]?.killed).toBe(1)
    expect(processControl.listDescendants).toHaveBeenCalledWith(ptys[0]?.pid)

    ptys[0]?.emitExit(0)
    await vi.advanceTimersByTimeAsync(100)
    await manager.closeAll()

    expect(processControl.forceKill).not.toHaveBeenCalled()
  })

  it('fuerza la terminación del shell que ignora el cierre cortés', async () => {
    const { manager, ptys, processControl } = managerWithControl([501, 502])
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))

    manager.close(id)
    await vi.advanceTimersByTimeAsync(GRACE_MS - 1)
    expect(processControl.forceKill).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2)

    expect(processControl.forceKill).toHaveBeenCalledExactlyOnceWith(ptys[0]?.pid, true, [501, 502])
  })

  it('fuerza los descendientes que sobreviven aunque el shell ya haya salido', async () => {
    const { manager, ptys, processControl } = managerWithControl([777])
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))

    manager.close(id)
    ptys[0]?.emitExit(0)
    await vi.advanceTimersByTimeAsync(GRACE_MS + 10)

    expect(processControl.forceKill).toHaveBeenCalledExactlyOnceWith(ptys[0]?.pid, false, [777])
  })

  it('termina antes del plazo en cuanto el shell salió y los descendientes murieron', async () => {
    const { manager, ptys, processControl } = managerWithControl([777])
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))
    let finished = false

    manager.close(id)
    void manager.closeAll().then(() => {
      finished = true
    })
    ptys[0]?.emitExit(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(finished).toBe(false)

    processControl.alive.delete(777)
    await vi.advanceTimersByTimeAsync(100)

    expect(finished).toBe(true)
    expect(processControl.forceKill).not.toHaveBeenCalled()
  })

  it('registra el fallo del cierre cortés pero igual libera y fuerza', async () => {
    const { manager, ptys, logError, processControl } = managerWithControl()
    const id = createdId(manager.create({ owner, cols: 80, rows: 24 }))
    const pty = ptys[0]
    if (pty === undefined) {
      throw new Error('Sin PTY.')
    }
    pty.killError = new Error('ya terminó')

    expect(manager.close(id)).toEqual({ ok: true })
    expect(manager.count).toBe(0)
    await vi.advanceTimersByTimeAsync(GRACE_MS + 10)

    expect(logError).toHaveBeenCalledOnce()
    expect(processControl.forceKill).toHaveBeenCalledOnce()
  })

  it('closeAll cierra todas las sesiones y espera a que terminen', async () => {
    const { manager, ptys } = managerWithControl()
    for (let index = 0; index < 3; index += 1) {
      manager.create({ owner, cols: 80, rows: 24 })
    }
    let finished = false

    void manager.closeAll().then(() => {
      finished = true
    })

    expect(manager.count).toBe(0)
    expect(ptys.map((pty) => pty.killed)).toEqual([1, 1, 1])
    await vi.advanceTimersByTimeAsync(GRACE_MS - 1)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(100)
    expect(finished).toBe(true)
  })

  it('tras forzar, espera a que los procesos desaparezcan de verdad', async () => {
    const { manager, processControl } = managerWithControl([901])
    let finished = false
    manager.create({ owner, cols: 80, rows: 24 })

    void manager.closeAll().then(() => {
      finished = true
    })
    await vi.advanceTimersByTimeAsync(GRACE_MS + 200)
    expect(processControl.forceKill).toHaveBeenCalledOnce()
    expect(finished).toBe(false)

    processControl.alive.delete(901)
    await vi.advanceTimersByTimeAsync(100)

    expect(finished).toBe(true)
  })

  it('no espera para siempre a un proceso que no muere', async () => {
    const { manager } = managerWithControl([902])
    let finished = false
    manager.create({ owner, cols: 80, rows: 24 })

    void manager.closeAll().then(() => {
      finished = true
    })
    await vi.advanceTimersByTimeAsync(GRACE_MS + 2000)

    expect(finished).toBe(true)
  })
})

describe('SessionManager: sesiones ligadas a su propietario', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('closeOwnedBy cierra solo las sesiones de ese propietario', () => {
    vi.useFakeTimers()
    const { manager, ptys } = makeManager()
    const other = {}
    manager.create({ owner, cols: 80, rows: 24 })
    manager.create({ owner: other, cols: 80, rows: 24 })
    manager.create({ owner, cols: 80, rows: 24 })

    expect(manager.closeOwnedBy(owner)).toBe(2)

    expect(manager.count).toBe(1)
    expect(ptys.map((pty) => pty.killed)).toEqual([1, 0, 1])
    expect(manager.closeOwnedBy({})).toBe(0)
  })

  it('un contenido nuevo no hereda ni puede operar las sesiones del anterior', () => {
    vi.useFakeTimers()
    const { manager } = makeManager()
    const oldId = createdId(manager.create({ owner, cols: 80, rows: 24 }))

    manager.closeOwnedBy(owner)

    expect(manager.write(oldId, 'x')).toEqual({ ok: false, code: 'session_not_found' })
    expect(manager.count).toBe(0)
  })

  const mainFrameNavigation = { isMainFrame: true, isSameDocument: false }

  it.each([
    ['navega a otro documento en el marco principal', 'did-start-navigation', mainFrameNavigation],
    ['se recarga (navegación del marco principal)', 'did-start-navigation', mainFrameNavigation],
    ['pierde su proceso de renderizado', 'render-process-gone', { reason: 'crashed' }],
    ['se destruye', 'destroyed', undefined],
  ])('cierra las sesiones cuando el contenido %s', (_description, event, payload) => {
    vi.useFakeTimers()
    const { manager } = makeManager()
    const contents = new EventEmitter()
    bindSessionLifecycle(manager, contents)
    manager.create({ owner: contents, cols: 80, rows: 24 })

    contents.emit(event, payload)

    expect(manager.count).toBe(0)
  })

  it.each([
    ['navegación dentro del mismo documento', { isMainFrame: true, isSameDocument: true }],
    ['navegación de un subcuadro', { isMainFrame: false, isSameDocument: false }],
    ['evento sin detalles', undefined],
    ['detalles que no son un objeto', 'texto'],
    ['marcadores que no son booleanos', { isMainFrame: 'true', isSameDocument: 'false' }],
  ])('no cierra las sesiones ante %s', (_description, details) => {
    const { manager } = makeManager()
    const contents = new EventEmitter()
    bindSessionLifecycle(manager, contents)
    manager.create({ owner: contents, cols: 80, rows: 24 })

    contents.emit('did-start-navigation', details)

    expect(manager.count).toBe(1)
  })

  it('el enlace solo cierra las sesiones de su propio contenido', () => {
    vi.useFakeTimers()
    const { manager } = makeManager()
    const first = new EventEmitter()
    const second = new EventEmitter()
    bindSessionLifecycle(manager, first)
    bindSessionLifecycle(manager, second)
    manager.create({ owner: first, cols: 80, rows: 24 })
    manager.create({ owner: second, cols: 80, rows: 24 })

    first.emit('destroyed')

    expect(manager.count).toBe(1)
  })
})

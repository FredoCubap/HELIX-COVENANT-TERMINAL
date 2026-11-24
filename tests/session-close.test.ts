import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node-pty'
import { afterEach, describe, expect, it } from 'vitest'
import { createProcessControl } from '../src/main/process-control'
import { bindSessionLifecycle } from '../src/main/session-lifecycle'
import { SessionManager, type PtySpawn } from '../src/main/session-manager'
import { chooseShell, nodeShellFileSystem, resolveShells } from '../src/main/shells'

// Estos tests abren shells reales y lanzan un proceso de larga duración (un `node` que
// duerme) para comprobar que cerrar la sesión no lo deja huérfano. Solo ejecutan ese
// script fijo, escrito en un directorio temporal, y limpian lo que quede al terminar.
const platform = process.platform === 'win32' ? 'win32' : 'linux'
const shells = resolveShells(process.env, nodeShellFileSystem, platform)
const shell = chooseShell(shells, undefined)
const control = createProcessControl(platform)

const childScript = [
  "const { writeFileSync } = require('node:fs')",
  'writeFileSync(process.argv[2], String(process.pid))',
  'setInterval(() => {}, 1000)',
].join('\n')

function launchCommand(shellId: string, script: string, pidFile: string): string {
  const node = process.execPath
  if (shellId === 'cmd') {
    return `"${node}" "${script}" "${pidFile}"`
  }
  if (shellId === 'pwsh' || shellId === 'powershell') {
    return `& "${node}" "${script}" "${pidFile}"`
  }
  return `'${node}' '${script}' '${pidFile}'`
}

async function waitUntil(condition: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Se agotó la espera: ${what}.`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

function readPid(pidFile: string): number | null {
  try {
    const pid = Number(readFileSync(pidFile, 'utf8'))
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

describe.skipIf(shell === null)('cierre sin procesos huérfanos con un shell real', () => {
  const shellId = shell?.id ?? ''
  const cleanup: (() => Promise<void> | void)[] = []

  afterEach(async () => {
    for (const task of cleanup.splice(0).reverse()) {
      await task()
    }
  })

  function createHarness(closeGraceMs = 3000) {
    const directory = mkdtempSync(join(tmpdir(), 'helix-cierre-'))
    const script = join(directory, 'hijo.js')
    writeFileSync(script, childScript)
    const trackedPids: number[] = []
    const recordingSpawn: PtySpawn = (file, args, options) => {
      const pty = spawn(file, args, options)
      trackedPids.push(pty.pid)
      return pty
    }
    const manager = new SessionManager({
      shells,
      spawn: recordingSpawn,
      env: process.env,
      homeDirectory: homedir(),
      isDirectory: () => true,
      events: { data: () => undefined, exit: () => undefined },
      processControl: control,
      closeGraceMs,
      logError: (context, error) => {
        throw new Error(`${context} ${String(error)}`)
      },
    })
    cleanup.push(async () => {
      await manager.closeAll()
      for (const pid of trackedPids) {
        if (control.isAlive(pid)) {
          control.forceKill(pid, true, [])
        }
      }
      rmSync(directory, { recursive: true, force: true })
    })

    /** Abre una sesión, lanza el hijo de larga duración y devuelve su PID. */
    async function startSessionWithChild(owner: object, name: string, command?: string) {
      const created = manager.create({ owner, cols: 120, rows: 30 })
      if (!created.ok) {
        throw new Error(`No se creó la sesión: ${created.code}`)
      }
      const pidFile = join(directory, `${name}.pid`)
      manager.write(created.id, `${command ?? launchCommand(shellId, script, pidFile)}\r`)
      await waitUntil(() => readPid(pidFile) !== null, 25_000, `el hijo ${name} no arrancó`)
      const childPid = readPid(pidFile) ?? 0
      cleanup.push(() => {
        if (control.isAlive(childPid)) {
          control.forceKill(childPid, false, [childPid])
        }
      })
      return { id: created.id, childPid, pidFile, shellPid: trackedPids.at(-1) ?? 0 }
    }

    return { manager, directory, script, trackedPids, startSessionWithChild }
  }

  it('cerrar la sesión termina el shell y el proceso hijo de larga duración', async () => {
    const { manager, startSessionWithChild } = createHarness()
    const { id, childPid, shellPid } = await startSessionWithChild({}, 'hijo')
    expect(control.isAlive(childPid)).toBe(true)

    manager.close(id)
    await manager.closeAll()

    await waitUntil(() => !control.isAlive(childPid), 10_000, 'el hijo sigue vivo tras cerrar')
    expect(control.isAlive(shellPid)).toBe(false)
    expect(manager.count).toBe(0)
  }, 60_000)

  it('closeAll, al salir de la aplicación, no deja ningún shell ni hijo', async () => {
    const { manager, startSessionWithChild } = createHarness()
    const owner = {}
    const first = await startSessionWithChild(owner, 'uno')
    const second = await startSessionWithChild(owner, 'dos')
    expect([first.childPid, second.childPid].every((pid) => control.isAlive(pid))).toBe(true)

    await manager.closeAll()

    await waitUntil(
      () => ![first.childPid, second.childPid].some((pid) => control.isAlive(pid)),
      10_000,
      'quedan hijos vivos tras closeAll',
    )
    expect([first.shellPid, second.shellPid].some((pid) => control.isAlive(pid))).toBe(false)
    expect(manager.count).toBe(0)
  }, 90_000)

  it.skipIf(platform !== 'linux')(
    'fuerza la terminación de un shell que ignora el cierre y de un hijo con nohup',
    async () => {
      const { manager, directory, script, startSessionWithChild } = createHarness(1500)
      const pidFile = join(directory, 'hostil.pid')
      const node = process.execPath
      const hostile = `trap '' HUP; nohup '${node}' '${script}' '${pidFile}' >/dev/null 2>&1 &`
      const { id, childPid, shellPid } = await startSessionWithChild({}, 'hostil', hostile)

      manager.close(id)
      // El cierre cortés (SIGHUP) no basta: el shell lo ignora y el hijo corre bajo nohup.
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(control.isAlive(shellPid)).toBe(true)
      expect(control.isAlive(childPid)).toBe(true)

      await manager.closeAll()

      await waitUntil(() => !control.isAlive(childPid), 10_000, 'el hijo con nohup sigue vivo')
      expect(control.isAlive(shellPid)).toBe(false)
    },
    60_000,
  )

  describe('sesiones ligadas a su contenido', () => {
    const cases: [string, string, unknown][] = [
      [
        'navegar a otro documento',
        'did-start-navigation',
        { isMainFrame: true, isSameDocument: false },
      ],
      ['perder el proceso de renderizado', 'render-process-gone', { reason: 'crashed' }],
      ['destruirse', 'destroyed', undefined],
    ]

    it.each(cases)(
      'al %s, el hijo vivo muere y el contenido nuevo no hereda sesiones',
      async (_description, event, payload) => {
        const { manager, startSessionWithChild } = createHarness()
        const contents = new EventEmitter()
        const bystander = new EventEmitter()
        bindSessionLifecycle(manager, contents)
        bindSessionLifecycle(manager, bystander)
        const mine = await startSessionWithChild(contents, 'mio')
        const theirs = await startSessionWithChild(bystander, 'ajeno')

        contents.emit(event, payload)

        await waitUntil(() => !control.isAlive(mine.childPid), 15_000, 'el hijo sigue vivo')
        expect(manager.write(mine.id, 'x')).toEqual({ ok: false, code: 'session_not_found' })
        expect(manager.count).toBe(1)
        expect(control.isAlive(theirs.childPid)).toBe(true)
        expect(manager.write(theirs.id, '')).toEqual({ ok: true })
      },
      90_000,
    )

    it('una navegación dentro del mismo documento no cierra nada', async () => {
      const { manager, startSessionWithChild } = createHarness()
      const contents = new EventEmitter()
      bindSessionLifecycle(manager, contents)
      const mine = await startSessionWithChild(contents, 'mio')

      contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(control.isAlive(mine.childPid)).toBe(true)
      expect(manager.count).toBe(1)
    }, 60_000)
  })
})

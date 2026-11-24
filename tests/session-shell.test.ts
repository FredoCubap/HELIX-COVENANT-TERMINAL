import { homedir } from 'node:os'
import { spawn } from 'node-pty'
import { describe, expect, it } from 'vitest'
import { SessionManager } from '../src/main/session-manager'
import {
  chooseShell,
  nodeShellFileSystem,
  resolveShells,
  type ShellResolution,
} from '../src/main/shells'
import { statSync } from 'node:fs'

// Estos tests abren shells reales, pero solo ejecutan comandos fijos e inocuos
// (echo y exit), con el entorno de prueba indicado y en el directorio del usuario.
const platform = process.platform === 'win32' ? 'win32' : 'linux'
const shells: ShellResolution = resolveShells(process.env, nodeShellFileSystem, platform)
const shell = chooseShell(shells, undefined)
const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const escapeSequences = new RegExp(
  `${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`,
  'g',
)

function printEnvCommand(shellId: string): string {
  if (shellId === 'cmd') {
    return 'echo TERM=%TERM% ERAN=%ELECTRON_RUN_AS_NODE%'
  }
  if (shellId === 'pwsh' || shellId === 'powershell') {
    return 'Write-Output "TERM=$env:TERM ERAN=$env:ELECTRON_RUN_AS_NODE"'
  }
  return 'echo TERM=$TERM ERAN=$ELECTRON_RUN_AS_NODE'
}

function runSession(
  commands: readonly string[],
  env: Record<string, string | undefined>,
): Promise<{ output: string; exitCode: number; manager: SessionManager; id: string }> {
  return new Promise((resolve, reject) => {
    let output = ''
    let id = ''
    const manager: SessionManager = new SessionManager({
      shells,
      spawn,
      env,
      homeDirectory: homedir(),
      isDirectory: (path) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false,
      events: {
        data: (_id, chunk) => {
          output += chunk
        },
        exit: (_id, exitCode) => {
          clearTimeout(timer)
          resolve({ output: output.replace(escapeSequences, ''), exitCode, manager, id })
        },
      },
      logError: (context, error) => {
        reject(new Error(`${context} ${String(error)}`))
      },
    })
    const timer = setTimeout(() => {
      manager.close(id)
      reject(new Error(`La sesión no terminó a tiempo. Salida: ${output}`))
    }, 25_000)

    const created = manager.create({ cols: 120, rows: 30 })
    if (!created.ok) {
      clearTimeout(timer)
      reject(new Error(`No se creó la sesión: ${created.code}`))
      return
    }
    id = created.id
    for (const command of commands) {
      manager.write(id, `${command}\r`)
    }
  })
}

describe.skipIf(shell === null)('SessionManager con un shell real', () => {
  const shellId = shell?.id ?? ''

  it('arranca con TERM=xterm-256color y sin ELECTRON_RUN_AS_NODE', async () => {
    const { output } = await runSession([printEnvCommand(shellId), 'exit 0'], {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    })

    expect(output).toContain('TERM=xterm-256color')
    expect(output).not.toContain('ERAN=1')
  }, 30_000)

  it('control: el mismo comando muestra la variable si el entorno no se limpia', async () => {
    const output = await new Promise<string>((resolve, reject) => {
      if (shell === null) {
        reject(new Error('Sin shell.'))
        return
      }
      const pty = spawn(shell.path, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      })
      let data = ''
      pty.onData((chunk) => {
        data += chunk
      })
      pty.onExit(() => {
        resolve(data.replace(escapeSequences, ''))
      })
      pty.write(`${printEnvCommand(shellId)}\r`)
      pty.write('exit 0\r')
    })

    expect(output).toContain('ERAN=1')
  }, 30_000)

  it.each([0, 3])(
    'notifica el código de salida %s y libera la sesión',
    async (code) => {
      const { exitCode, manager, id } = await runSession([`exit ${String(code)}`], process.env)

      expect(exitCode).toBe(code)
      expect(manager.count).toBe(0)
      expect(manager.write(id, 'x')).toEqual({ ok: false, code: 'session_not_found' })
    },
    30_000,
  )
})

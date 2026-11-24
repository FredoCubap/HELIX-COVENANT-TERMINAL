import { tmpdir } from 'node:os'
import { spawn } from 'node-pty'
import { describe, expect, it } from 'vitest'

describe('módulo nativo node-pty', () => {
  it('carga y ejecuta un proceso fijo e inocuo en un directorio temporal', async () => {
    const output = await new Promise<string>((resolve, reject) => {
      const pty = spawn(process.execPath, ['-e', "console.log('helix-pty-ok')"], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: tmpdir(),
      })
      let data = ''
      pty.onData((chunk) => {
        data += chunk
      })
      pty.onExit(({ exitCode }) => {
        if (exitCode === 0) {
          resolve(data)
        } else {
          reject(new Error(`El proceso de prueba terminó con código ${String(exitCode)}.`))
        }
      })
    })

    expect(output).toContain('helix-pty-ok')
  }, 15_000)
})

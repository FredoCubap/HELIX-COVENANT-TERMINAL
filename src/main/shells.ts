import { readFileSync, statSync } from 'node:fs'
import { posix, win32 } from 'node:path'

export type ShellPlatform = 'win32' | 'linux'

/** Un shell detectado. `path` nunca sale del proceso principal: la interfaz solo ve `id`. */
export interface ShellInfo {
  readonly id: string
  readonly path: string
}

export interface ShellResolution {
  readonly shells: readonly ShellInfo[]
  readonly defaultId: string | null
}

export interface ShellFileSystem {
  isFile(path: string): boolean
  readText(path: string): string | null
}

type ShellEnv = Readonly<Record<string, string | undefined>>

const safeId = /^[A-Za-z0-9._-]+$/

export const nodeShellFileSystem: ShellFileSystem = {
  isFile: (path) => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false,
  readText: (path) => {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  },
}

function resolveWindows(env: ShellEnv, fs: ShellFileSystem): ShellResolution {
  const systemRoot = env['SystemRoot'] ?? 'C:\\Windows'
  const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files'
  // Solo rutas absolutas: una entrada relativa o vacía del PATH apunta al directorio actual.
  const pathDirectories = (env['PATH'] ?? '')
    .split(win32.delimiter)
    .filter((directory) => win32.isAbsolute(directory))
  const pwshCandidates = [
    win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    ...pathDirectories.map((directory) => win32.join(directory, 'pwsh.exe')),
  ]

  const shells: ShellInfo[] = []
  const pwsh = pwshCandidates.find((candidate) => fs.isFile(candidate))
  if (pwsh !== undefined) {
    shells.push({ id: 'pwsh', path: pwsh })
  }
  const fixedShells: ShellInfo[] = [
    {
      id: 'powershell',
      path: win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    },
    { id: 'cmd', path: win32.join(systemRoot, 'System32', 'cmd.exe') },
  ]
  shells.push(...fixedShells.filter((shell) => fs.isFile(shell.path)))

  return { shells, defaultId: shells[0]?.id ?? null }
}

function parseEtcShells(content: string | null): string[] {
  return (content ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => posix.isAbsolute(line))
}

function resolveLinux(env: ShellEnv, fs: ShellFileSystem): ShellResolution {
  const listed = parseEtcShells(fs.readText('/etc/shells'))
  const shells: ShellInfo[] = []
  const addShell = (path: string): void => {
    const id = posix.basename(path)
    if (safeId.test(id) && !shells.some((shell) => shell.id === id) && fs.isFile(path)) {
      shells.push({ id, path })
    }
  }

  listed.forEach(addShell)
  // bash y sh son el respaldo aunque /etc/shells falte o no los liste.
  for (const id of ['bash', 'sh']) {
    addShell(`/bin/${id}`)
    addShell(`/usr/bin/${id}`)
  }

  const userShell = env['SHELL']
  const userShellId =
    userShell !== undefined && listed.includes(userShell) ? posix.basename(userShell) : undefined
  const defaultId = [userShellId, 'bash', 'sh'].find(
    (id) => id !== undefined && shells.some((shell) => shell.id === id),
  )

  return { shells, defaultId: defaultId ?? null }
}

export function resolveShells(
  env: ShellEnv,
  fs: ShellFileSystem,
  platform: ShellPlatform,
): ShellResolution {
  return platform === 'win32' ? resolveWindows(env, fs) : resolveLinux(env, fs)
}

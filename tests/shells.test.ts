import { describe, expect, it } from 'vitest'
import { resolveShells, type ShellFileSystem } from '../src/main/shells'

function fakeFileSystem(
  files: readonly string[],
  contents: Readonly<Record<string, string>> = {},
): ShellFileSystem {
  return {
    isFile: (path) => files.includes(path),
    readText: (path) => contents[path] ?? null,
  }
}

const windowsEnv = {
  SystemRoot: 'C:\\Windows',
  ProgramFiles: 'C:\\Program Files',
  PATH: 'C:\\Windows\\System32;C:\\Tools',
}
const windowsPowerShell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const windowsCmd = 'C:\\Windows\\System32\\cmd.exe'
const pwshPath = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'

describe('resolveShells en Windows', () => {
  it('prefiere PowerShell 7 si está instalado', () => {
    const result = resolveShells(
      windowsEnv,
      fakeFileSystem([pwshPath, windowsPowerShell, windowsCmd]),
      'win32',
    )

    expect(result.defaultId).toBe('pwsh')
    expect(result.shells.map((shell) => shell.id)).toEqual(['pwsh', 'powershell', 'cmd'])
  })

  it('usa Windows PowerShell si no hay PowerShell 7', () => {
    const result = resolveShells(
      windowsEnv,
      fakeFileSystem([windowsPowerShell, windowsCmd]),
      'win32',
    )

    expect(result.defaultId).toBe('powershell')
    expect(result.shells.map((shell) => shell.id)).toEqual(['powershell', 'cmd'])
  })

  it('encuentra PowerShell 7 instalado fuera de Program Files mediante el PATH', () => {
    const portable = 'C:\\Tools\\pwsh.exe'
    const result = resolveShells(
      windowsEnv,
      fakeFileSystem([portable, windowsPowerShell, windowsCmd]),
      'win32',
    )

    expect(result.shells[0]).toEqual({ id: 'pwsh', path: portable })
  })

  it('ignora las entradas relativas o vacías del PATH', () => {
    const files = ['pwsh.exe', '.\\pwsh.exe', 'tools\\pwsh.exe', windowsPowerShell, windowsCmd]
    const result = resolveShells(
      { ...windowsEnv, PATH: ';.;tools;C:\\Windows\\System32' },
      fakeFileSystem(files),
      'win32',
    )

    expect(result.shells.map((shell) => shell.id)).toEqual(['powershell', 'cmd'])
  })

  it('no ofrece shells que no existen y no inventa un predeterminado', () => {
    const result = resolveShells(windowsEnv, fakeFileSystem([]), 'win32')

    expect(result).toEqual({ shells: [], defaultId: null })
  })

  it('no toma el shell de la variable ComSpec ni de ninguna ruta del entorno', () => {
    const result = resolveShells(
      { ...windowsEnv, ComSpec: 'C:\\Users\\Public\\evil.exe', SHELL: 'C:\\evil.exe' },
      fakeFileSystem(['C:\\Users\\Public\\evil.exe', 'C:\\evil.exe', windowsCmd]),
      'win32',
    )

    expect(result.shells).toEqual([{ id: 'cmd', path: windowsCmd }])
  })
})

describe('resolveShells en Linux', () => {
  const etcShells = '# shells válidos\n/bin/sh\n/bin/bash\n\n/usr/bin/zsh\n'
  const installed = ['/bin/sh', '/bin/bash', '/usr/bin/zsh']

  it('usa $SHELL si figura en /etc/shells', () => {
    const result = resolveShells(
      { SHELL: '/usr/bin/zsh' },
      fakeFileSystem(installed, { '/etc/shells': etcShells }),
      'linux',
    )

    expect(result.defaultId).toBe('zsh')
    expect(result.shells.map((shell) => shell.id)).toEqual(['sh', 'bash', 'zsh'])
  })

  it('usa bash si $SHELL no figura en /etc/shells', () => {
    const result = resolveShells(
      { SHELL: '/tmp/evil' },
      fakeFileSystem([...installed, '/tmp/evil'], { '/etc/shells': etcShells }),
      'linux',
    )

    expect(result.defaultId).toBe('bash')
    expect(result.shells.map((shell) => shell.id)).not.toContain('evil')
  })

  it('usa bash si $SHELL no está definido', () => {
    const result = resolveShells(
      {},
      fakeFileSystem(installed, { '/etc/shells': etcShells }),
      'linux',
    )

    expect(result.defaultId).toBe('bash')
  })

  it('usa sh si no existe bash', () => {
    const result = resolveShells(
      { SHELL: '/bin/bash' },
      fakeFileSystem(['/bin/sh'], { '/etc/shells': '/bin/sh\n/bin/bash\n' }),
      'linux',
    )

    expect(result.defaultId).toBe('sh')
    expect(result.shells).toEqual([{ id: 'sh', path: '/bin/sh' }])
  })

  it('cae a bash y sh aunque falte /etc/shells', () => {
    const result = resolveShells({ SHELL: '/usr/bin/zsh' }, fakeFileSystem(installed), 'linux')

    expect(result.defaultId).toBe('bash')
    expect(result.shells.map((shell) => shell.id)).toEqual(['bash', 'sh'])
  })

  it('descarta entradas relativas, repetidas, inexistentes o con nombres raros', () => {
    const content = 'bash\n/bin/bash\n/usr/bin/bash\n/bin/no-existe\n/bin/ba sh\n/bin/sh;rm\n'
    const result = resolveShells(
      {},
      fakeFileSystem(['/bin/bash', '/usr/bin/bash', '/bin/ba sh', '/bin/sh;rm', '/bin/sh'], {
        '/etc/shells': content,
      }),
      'linux',
    )

    expect(result.shells).toEqual([
      { id: 'bash', path: '/bin/bash' },
      { id: 'sh', path: '/bin/sh' },
    ])
  })

  it('no inventa un predeterminado si no hay ningún shell', () => {
    const result = resolveShells({}, fakeFileSystem([]), 'linux')

    expect(result).toEqual({ shells: [], defaultId: null })
  })
})

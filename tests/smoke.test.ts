import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let application: ElectronApplication | undefined
let page: Page | undefined
let userDataPath: string | undefined

function getApplication(): ElectronApplication {
  if (!application) {
    throw new Error('La aplicación Electron no está iniciada.')
  }
  return application
}

function getPage(): Page {
  if (!page) {
    throw new Error('La ventana Electron no está disponible.')
  }
  return page
}

function createTestEnvironment(dataPath: string): Record<string, string> {
  const allowedVariables = [
    'APPDATA',
    'DBUS_SESSION_BUS_ADDRESS',
    'DISPLAY',
    'HOME',
    'LOCALAPPDATA',
    'PATH',
    'SystemRoot',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'WINDIR',
    'XAUTHORITY',
    'XDG_RUNTIME_DIR',
  ]
  const env: Record<string, string> = {}

  for (const name of allowedVariables) {
    const value = process.env[name]
    if (value !== undefined) {
      env[name] = value
    }
  }
  env['HELIX_TEST_USER_DATA_DIR'] = dataPath
  return env
}

describe('aplicación Electron en build de producción', () => {
  beforeAll(async () => {
    userDataPath = await mkdtemp(join(tmpdir(), 'helix-smoke-'))
    application = await electron.launch({
      args: [process.cwd()],
      chromiumSandbox: true,
      cwd: process.cwd(),
      env: createTestEnvironment(userDataPath),
      timeout: 30_000,
    })
    page = await getApplication().firstWindow()
  }, 45_000)

  afterAll(async () => {
    if (application) {
      await application.close()
    }
    if (userDataPath) {
      await rm(userDataPath, { recursive: true, force: true })
    }
  })

  it('mantiene aislamiento, contrato IPC y políticas de navegación y contenido', async () => {
    const currentPage = getPage()
    expect(await currentPage.title()).toBe('HELIX COVENANT TERMINAL')

    const isolation = await currentPage.evaluate(() => ({
      require: typeof window.require,
      process: typeof window.process,
      api: typeof window.helix,
    }))
    expect(isolation).toEqual({ require: 'undefined', process: 'undefined', api: 'object' })

    const info = await currentPage.evaluate(() => window.helix.getInfo())
    expect(info).toMatchObject({
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      platform: process.platform === 'win32' ? 'win32' : 'linux',
    })

    const rejectedExternal = await currentPage.evaluate(() => {
      return window.helix.openExternal('file:///etc/passwd')
    })
    expect(rejectedExternal).toMatchObject({ error: true, code: 'invalid_request' })

    const originalUrl = currentPage.url()
    await currentPage.evaluate(() => {
      window.location.assign('https://example.com')
    })
    await currentPage.waitForTimeout(100)
    expect(currentPage.url()).toBe(originalUrl)

    await currentPage.evaluate(() => {
      const script = document.createElement('script')
      script.textContent = 'window.__helixInlineScriptRan = true'
      document.head.append(script)
    })
    await currentPage.waitForTimeout(50)
    const inlineScriptRan = await currentPage.evaluate(
      () => (window as Window & { __helixInlineScriptRan?: boolean }).__helixInlineScriptRan,
    )
    expect(inlineScriptRan).toBeUndefined()

    const cameraResult = await currentPage.evaluate(async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true })
        return 'granted'
      } catch {
        return 'denied'
      }
    })
    expect(cameraResult).toBe('denied')

    const notificationsState = await currentPage.evaluate(async () => {
      return (await navigator.permissions.query({ name: 'notifications' })).state
    })
    expect(notificationsState).not.toBe('granted')

    const browserWindow = await getApplication().browserWindow(currentPage)
    await browserWindow.evaluate((window) => window.focus())
    await browserWindow.evaluate((window) =>
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' }),
    )
    await browserWindow.evaluate((window) =>
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F11' }),
    )
    await currentPage.waitForTimeout(250)
    expect(await browserWindow.evaluate((window) => window.isFullScreen())).toBe(true)

    await browserWindow.evaluate((window) =>
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' }),
    )
    await browserWindow.evaluate((window) =>
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F11' }),
    )
    await currentPage.waitForTimeout(250)
    expect(await browserWindow.evaluate((window) => window.isFullScreen())).toBe(false)
  }, 30_000)

  it('no tiene menú de aplicación ni sus atajos de recarga, cierre y DevTools', async () => {
    const currentPage = getPage()
    const runningApplication = getApplication()
    const browserWindow = await runningApplication.browserWindow(currentPage)
    const pressChord = async (keyCode: string, modifiers: ('control' | 'shift')[]) => {
      await browserWindow.evaluate(
        (window, chord) => {
          window.webContents.sendInputEvent({ type: 'keyDown', ...chord })
          window.webContents.sendInputEvent({ type: 'keyUp', ...chord })
        },
        { keyCode, modifiers },
      )
      await currentPage.waitForTimeout(500)
    }

    await currentPage.evaluate(() => {
      ;(window as Window & { __helixMarker?: boolean }).__helixMarker = true
    })
    await browserWindow.evaluate((window) => window.focus())

    await pressChord('R', ['control'])
    const markerSurvives = await currentPage.evaluate(
      () => (window as Window & { __helixMarker?: boolean }).__helixMarker,
    )
    expect(markerSurvives).toBe(true)

    await pressChord('I', ['control', 'shift'])
    expect(await browserWindow.evaluate((window) => window.webContents.isDevToolsOpened())).toBe(
      false,
    )

    await pressChord('W', ['control'])
    expect(await browserWindow.evaluate((window) => window.isDestroyed())).toBe(false)
    expect(runningApplication.windows()).toHaveLength(1)

    expect(await runningApplication.evaluate(({ Menu }) => Menu.getApplicationMenu())).toBeNull()
  }, 30_000)

  it('termina un segundo proceso y conserva la ventana existente', async () => {
    if (!userDataPath) {
      throw new Error('No se creó el directorio temporal de la aplicación.')
    }

    const executable = join(
      process.cwd(),
      'node_modules',
      'electron',
      'dist',
      process.platform === 'win32' ? 'electron.exe' : 'electron',
    )
    const secondProcess = spawn(executable, [process.cwd()], {
      cwd: process.cwd(),
      env: createTestEnvironment(userDataPath),
      windowsHide: true,
    })
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        secondProcess.kill()
        reject(new Error('La segunda instancia no terminó dentro del tiempo esperado.'))
      }, 20_000)
      secondProcess.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      secondProcess.once('exit', (code) => {
        clearTimeout(timeout)
        resolve(code)
      })
    })

    expect(exitCode).toBe(0)
    expect(getApplication().windows()).toHaveLength(1)
  }, 30_000)

  it('termina el proceso al cerrar la última ventana', async () => {
    const runningApplication = getApplication()
    const electronProcess = runningApplication.process()
    const processExited = new Promise<number | null>((resolve) => {
      electronProcess.once('exit', (code) => resolve(code))
    })
    const browserWindow = await runningApplication.browserWindow(getPage())

    await browserWindow.evaluate((window) => window.close())
    expect(await processExited).toBe(0)
    application = undefined
  }, 20_000)
})

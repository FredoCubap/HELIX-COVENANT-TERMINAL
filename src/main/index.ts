import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { createIpcHandlers } from './ipc'
import { isTrustedAppUrl, resolveTrustedDevUrl } from './security'
import { resolveLocale, setLocale, t } from '../shared/localization'

let mainWindow: BrowserWindow | null = null
let secondInstancePending = false
let mainWindowReady = false

const rendererFilePath = join(__dirname, '../renderer/index.html')
const devUrlValue = process.env['ELECTRON_RENDERER_URL']
const devServerUrl = resolveTrustedDevUrl(devUrlValue)
const devOrigin = devServerUrl?.origin ?? null

const testUserDataPath = process.env['HELIX_TEST_USER_DATA_DIR']
if (!app.isPackaged && testUserDataPath !== undefined) {
  const tempRoot = resolve(tmpdir())
  const candidate = resolve(testUserDataPath)
  const relativePath = relative(tempRoot, candidate)
  if (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith('..' + sep) &&
    !isAbsolute(relativePath)
  ) {
    app.setPath('userData', candidate)
  } else {
    console.warn('HELIX_TEST_USER_DATA_DIR solo puede apuntar a un directorio temporal hijo.')
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

function focusMainWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    secondInstancePending = true
    return
  }

  // Antes de `ready-to-show` la ventana aún no pintó: se enfocará al mostrarla.
  if (!mainWindowReady) {
    secondInstancePending = true
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  mainWindow.focus()
}

if (!hasSingleInstanceLock) {
  app.exit(0)
} else {
  if (devUrlValue !== undefined && devServerUrl === null) {
    console.warn(
      'ELECTRON_RENDERER_URL no es un servidor Vite local de confianza; se cargará el build.',
    )
  }

  app.on('second-instance', focusMainWindow)

  function createWindow(): void {
    if (mainWindow !== null) {
      focusMainWindow()
      return
    }

    mainWindow = new BrowserWindow({
      width: 1100,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      title: t('app.title'),
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })

    const window = mainWindow
    const loadPromise = devServerUrl
      ? window.loadURL(devServerUrl.href)
      : window.loadFile(rendererFilePath)

    void loadPromise.catch((error: unknown) => {
      console.error('No se pudo cargar la interfaz de HELIX COVENANT TERMINAL.', error)
      if (!window.isDestroyed()) {
        window.close()
      }
    })

    window.once('ready-to-show', () => {
      if (!window.isDestroyed()) {
        mainWindowReady = true
        window.show()
        if (secondInstancePending) {
          secondInstancePending = false
          window.focus()
        }
      }
    })

    window.on('closed', () => {
      if (mainWindow === window) {
        mainWindow = null
        mainWindowReady = false
      }
    })

    window.webContents.on('will-navigate', (event, url) => {
      if (!isTrustedAppUrl(url, devOrigin, rendererFilePath)) {
        event.preventDefault()
      }
    })

    window.webContents.on('will-redirect', (event, url) => {
      if (!isTrustedAppUrl(url, devOrigin, rendererFilePath)) {
        event.preventDefault()
      }
    })

    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    window.webContents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        input.key === 'F11' &&
        !input.isAutoRepeat &&
        window.isFocused()
      ) {
        event.preventDefault()
        window.setFullScreen(!window.isFullScreen())
      }
    })
  }

  void app.whenReady().then(() => {
    setLocale(resolveLocale(undefined, app.getLocale()))
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    // Sin estos dos, Electron concede por defecto las comprobaciones síncronas y de dispositivos.
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.setDevicePermissionHandler(() => false)

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (
        details.resourceType !== 'mainFrame' ||
        !isTrustedAppUrl(details.url, devOrigin, rendererFilePath)
      ) {
        callback({ responseHeaders: details.responseHeaders })
        return
      }

      const policy = devServerUrl
        ? [
            `default-src 'self' ${devServerUrl.origin}`,
            // React Refresh requires its inline preamble in loopback-only development.
            `script-src 'self' ${devServerUrl.origin} 'unsafe-eval' 'unsafe-inline'`,
            `style-src 'self' ${devServerUrl.origin} 'unsafe-inline'`,
            "img-src 'self' data:",
            `connect-src 'self' ${devServerUrl.origin} ws://${devServerUrl.host}`,
            "object-src 'none'",
            "base-uri 'none'",
            "frame-src 'none'",
            "form-action 'none'",
          ].join('; ')
        : [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "frame-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'none'",
          ].join('; ')

      const responseHeaders: Record<string, string[]> = {}
      const existingPolicies: string[] = []
      for (const [name, values] of Object.entries(details.responseHeaders ?? {})) {
        if (name.toLowerCase() === 'content-security-policy') {
          existingPolicies.push(...values)
        } else {
          responseHeaders[name] = values
        }
      }
      responseHeaders['Content-Security-Policy'] = [...existingPolicies, policy]

      callback({ responseHeaders })
    })

    const handlers = createIpcHandlers({
      getMainContents: () => mainWindow?.webContents ?? null,
      isTrustedUrl: (url) => isTrustedAppUrl(url, devOrigin, rendererFilePath),
      getInfo: () => {
        const platform = process.platform
        if (platform !== 'win32' && platform !== 'linux') {
          throw new Error('Plataforma no soportada.')
        }
        return { version: app.getVersion(), platform }
      },
      openExternal: (url) => {
        return shell.openExternal(url)
      },
      translate: t,
      logError: (context, error) => {
        console.error(context, error)
      },
    })
    ipcMain.handle('app:getInfo', handlers['app:getInfo'])
    ipcMain.handle('app:openExternal', handlers['app:openExternal'])

    createWindow()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}

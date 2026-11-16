import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

// Esqueleto mínimo del grupo 1: abre una ventana vacía.
// El endurecimiento de seguridad (grupo 2) lo reemplaza por la ventana definitiva.
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

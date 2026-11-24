import { contextBridge, ipcRenderer } from 'electron'
import { validateResult, type ChannelResult, type HelixAPI } from '../shared/contract'

const helix: HelixAPI = {
  getInfo: async (): Promise<ChannelResult<'app:getInfo'>> => {
    const raw: unknown = await ipcRenderer.invoke('app:getInfo', {})

    if (!validateResult('app:getInfo', raw)) {
      throw new Error('Respuesta IPC no válida para app:getInfo')
    }

    return raw
  },
  openExternal: async (url): Promise<ChannelResult<'app:openExternal'>> => {
    const raw: unknown = await ipcRenderer.invoke('app:openExternal', { url })

    if (!validateResult('app:openExternal', raw)) {
      throw new Error('Respuesta IPC no válida para app:openExternal')
    }

    return raw
  },
}

contextBridge.exposeInMainWorld('helix', helix)

export {}

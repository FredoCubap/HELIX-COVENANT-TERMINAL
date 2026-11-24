import {
  isAppGetInfoResponse,
  isAllowedExternalUrl,
  validateRequest,
  type AppGetInfoResponse,
  type ChannelResult,
  type IpcError,
} from '../shared/contract'

interface IpcSenderFrame {
  readonly url: string
}

interface IpcSenderContents {
  readonly mainFrame: IpcSenderFrame
}

interface IpcSenderContext {
  readonly sender: IpcSenderContents
  readonly senderFrame: IpcSenderFrame | null
}

interface IpcHandlerDependencies {
  getMainContents(): IpcSenderContents | null
  isTrustedUrl(url: string): boolean
  getInfo(): AppGetInfoResponse
  openExternal(url: string): Promise<void>
  translate(key: string): string
  logError(context: string, error: unknown): void
}

function errorResult(code: IpcError['code'], message: string): IpcError {
  return { error: true, code, message }
}

export function createIpcHandlers(dependencies: IpcHandlerDependencies): {
  'app:getInfo': (event: IpcSenderContext, payload: unknown) => ChannelResult<'app:getInfo'>
  'app:openExternal': (
    event: IpcSenderContext,
    payload: unknown,
  ) => Promise<ChannelResult<'app:openExternal'>>
} {
  function isTrustedSender(event: IpcSenderContext): boolean {
    const mainContents = dependencies.getMainContents()
    const frame = event.senderFrame
    return (
      mainContents !== null &&
      event.sender === mainContents &&
      frame !== null &&
      frame === mainContents.mainFrame &&
      dependencies.isTrustedUrl(frame.url)
    )
  }

  return {
    'app:getInfo': (event, payload) => {
      if (!isTrustedSender(event)) {
        return errorResult('untrusted_sender', dependencies.translate('error.untrusted_sender'))
      }
      if (!validateRequest('app:getInfo', payload)) {
        return errorResult('invalid_request', dependencies.translate('error.invalid_request'))
      }

      try {
        const response = dependencies.getInfo()
        if (!isAppGetInfoResponse(response)) {
          throw new Error('La respuesta interna no cumple el contrato.')
        }
        return response
      } catch (error) {
        dependencies.logError('Falló el canal app:getInfo.', error)
        return errorResult('internal_error', dependencies.translate('info.fetch_failed'))
      }
    },
    'app:openExternal': async (event, payload) => {
      if (!isTrustedSender(event)) {
        return errorResult('untrusted_sender', dependencies.translate('error.untrusted_sender'))
      }
      if (!validateRequest('app:openExternal', payload) || !isAllowedExternalUrl(payload.url)) {
        return errorResult('invalid_request', dependencies.translate('error.invalid_request'))
      }

      try {
        await dependencies.openExternal(new URL(payload.url).href)
        return { opened: true }
      } catch (error) {
        dependencies.logError('Falló el canal app:openExternal.', error)
        return errorResult('internal_error', dependencies.translate('error.internal_error'))
      }
    },
  }
}

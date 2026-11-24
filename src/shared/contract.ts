export type ChannelName = 'app:getInfo' | 'app:openExternal'

export interface AppGetInfoRequest {
  readonly [key: string]: never
}

export interface AppGetInfoResponse {
  readonly version: string
  readonly platform: 'win32' | 'linux'
}

export interface AppOpenExternalRequest {
  readonly url: string
}

export interface AppOpenExternalResponse {
  readonly opened: true
}

export interface IpcError {
  readonly error: true
  readonly code: 'invalid_request' | 'untrusted_sender' | 'internal_error'
  readonly message: string
}

export interface ChannelMap {
  'app:getInfo': {
    request: AppGetInfoRequest
    response: AppGetInfoResponse
  }
  'app:openExternal': {
    request: AppOpenExternalRequest
    response: AppOpenExternalResponse
  }
}

export type ChannelRequest<K extends ChannelName> = ChannelMap[K]['request']
export type ChannelResponse<K extends ChannelName> = ChannelMap[K]['response']
export type ChannelResult<K extends ChannelName> = ChannelResponse<K> | IpcError

export interface HelixAPI {
  getInfo(): Promise<ChannelResult<'app:getInfo'>>
  openExternal(url: string): Promise<ChannelResult<'app:openExternal'>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isAllowedExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    return false
  }

  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    )
  } catch {
    return false
  }
}

export function isAppGetInfoRequest(value: unknown): value is AppGetInfoRequest {
  return isRecord(value) && Object.keys(value).length === 0
}

export function isAppGetInfoResponse(value: unknown): value is AppGetInfoResponse {
  return (
    isRecord(value) &&
    typeof value.version === 'string' &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      value.version,
    ) &&
    (value.platform === 'win32' || value.platform === 'linux')
  )
}

export function isAppOpenExternalRequest(value: unknown): value is AppOpenExternalRequest {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    Object.hasOwn(value, 'url') &&
    isAllowedExternalUrl(value.url)
  )
}

export function isAppOpenExternalResponse(value: unknown): value is AppOpenExternalResponse {
  return isRecord(value) && Object.keys(value).length === 1 && value.opened === true
}

export function isIpcError(value: unknown): value is IpcError {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    value.error === true &&
    (value.code === 'invalid_request' ||
      value.code === 'untrusted_sender' ||
      value.code === 'internal_error') &&
    typeof value.message === 'string'
  )
}

const requestValidators: {
  [K in ChannelName]: (payload: unknown) => payload is ChannelRequest<K>
} = {
  'app:getInfo': isAppGetInfoRequest,
  'app:openExternal': isAppOpenExternalRequest,
}

const responseValidators: {
  [K in ChannelName]: (payload: unknown) => payload is ChannelResponse<K>
} = {
  'app:getInfo': isAppGetInfoResponse,
  'app:openExternal': isAppOpenExternalResponse,
}

export function validateRequest<K extends ChannelName>(
  channel: K,
  payload: unknown,
): payload is ChannelRequest<K> {
  return requestValidators[channel](payload)
}

export function validateResponse<K extends ChannelName>(
  channel: K,
  payload: unknown,
): payload is ChannelResponse<K> {
  return responseValidators[channel](payload)
}

export function validateResult<K extends ChannelName>(
  channel: K,
  payload: unknown,
): payload is ChannelResult<K> {
  return isIpcError(payload) || validateResponse(channel, payload)
}

import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import {
  isAllowedExternalUrl,
  isAppGetInfoRequest,
  isAppGetInfoResponse,
  isAppOpenExternalRequest,
  isIpcError,
  validateResult,
} from '../src/shared/contract'
import { createIpcHandlers } from '../src/main/ipc'
import { isTrustedAppUrl, resolveTrustedDevUrl } from '../src/main/security'

describe('IPC contract validation', () => {
  it('accepts only the empty app:getInfo request', () => {
    expect(isAppGetInfoRequest({})).toBe(true)
    expect(isAppGetInfoRequest({ tag: 'app:getInfo' })).toBe(false)
    expect(isAppGetInfoRequest({ extra: true })).toBe(false)
    expect(isAppGetInfoRequest(null)).toBe(false)
  })

  it('accepts only SemVer application responses on supported platforms', () => {
    expect(isAppGetInfoResponse({ version: '0.1.0', platform: 'win32' })).toBe(true)
    expect(isAppGetInfoResponse({ version: '1.2.3-beta.1+build.7', platform: 'linux' })).toBe(true)
    expect(isAppGetInfoResponse({ version: 'latest', platform: 'win32' })).toBe(false)
    expect(isAppGetInfoResponse({ version: '1.0.0', platform: 'darwin' })).toBe(false)
  })

  it.each(['https://example.com', 'http://example.com/path'])('allows external URL %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true)
    expect(isAppOpenExternalRequest({ url })).toBe(true)
  })

  it.each([
    '',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://user:password@example.com',
  ])('rejects external URL %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false)
    expect(isAppOpenExternalRequest({ url })).toBe(false)
  })

  it('accepts structured IPC errors only with the declared fields', () => {
    const error = {
      error: true,
      code: 'internal_error',
      message: 'No se pudo obtener la información.',
    } as const
    expect(isIpcError(error)).toBe(true)
    expect(validateResult('app:getInfo', error)).toBe(true)
    expect(isIpcError({ ...error, stack: 'C:\\private\\stack' })).toBe(false)
  })
})

describe('trusted renderer origins', () => {
  it.each(['http://localhost:5173/', 'http://127.0.0.1:5173/', 'http://[::1]:5173/'])(
    'allows local development URL %s',
    (url) => {
      expect(resolveTrustedDevUrl(url)?.origin).toBe(new URL(url).origin)
    },
  )

  it.each([
    'https://localhost:5173/',
    'http://localhost.attacker.test/',
    'http://192.168.1.10:5173/',
    'javascript:alert(1)',
  ])('rejects non-local development URL %s', (url) => {
    expect(resolveTrustedDevUrl(url)).toBeNull()
  })

  it('trusts only the exact development origin or packaged renderer file', () => {
    const devUrl = new URL('http://localhost:5173/')
    expect(
      isTrustedAppUrl('http://localhost:5173/src/main.tsx', devUrl.origin, 'unused.html'),
    ).toBe(true)
    expect(isTrustedAppUrl('http://localhost.attacker.test/', devUrl.origin, 'unused.html')).toBe(
      false,
    )

    const rendererPath = join(tmpdir(), 'helix-test', 'index.html')
    const rendererUrl = pathToFileURL(rendererPath).href
    expect(isTrustedAppUrl(rendererUrl, null, rendererPath)).toBe(true)
    expect(
      isTrustedAppUrl(pathToFileURL(join(tmpdir(), 'secret.txt')).href, null, rendererPath),
    ).toBe(false)
  })
})

describe('IPC handler boundary', () => {
  const frame = { url: 'file:///app/out/renderer/index.html' }
  const contents = { mainFrame: frame }
  const trustedEvent = { sender: contents, senderFrame: frame }

  function makeHandlers(
    overrides: Partial<Parameters<typeof createIpcHandlers>[0]> = {},
  ): ReturnType<typeof createIpcHandlers> {
    return createIpcHandlers({
      getMainContents: () => contents,
      isTrustedUrl: (url) => url === frame.url,
      getInfo: () => ({ version: '0.1.0', platform: 'win32' }),
      openExternal: vi.fn(async () => {}),
      translate: (key) => key,
      logError: vi.fn(),
      ...overrides,
    })
  }

  it('handles valid requests and exposes only declared channels', () => {
    const handlers = makeHandlers()
    expect(handlers['app:getInfo'](trustedEvent, {})).toEqual({
      version: '0.1.0',
      platform: 'win32',
    })
    expect(Object.keys(handlers).sort()).toEqual(['app:getInfo', 'app:openExternal'])
  })

  it('rejects invalid requests, subframes, other windows, and foreign origins', () => {
    const handlers = makeHandlers()
    expect(handlers['app:getInfo'](trustedEvent, { extra: true })).toMatchObject({
      error: true,
      code: 'invalid_request',
    })
    expect(handlers['app:getInfo'](trustedEvent, { tag: 'unknown:channel' })).toMatchObject({
      error: true,
      code: 'invalid_request',
    })

    const subframe = { url: frame.url }
    expect(handlers['app:getInfo']({ sender: contents, senderFrame: subframe }, {})).toMatchObject({
      error: true,
      code: 'untrusted_sender',
    })
    expect(
      handlers['app:getInfo']({ sender: { mainFrame: frame }, senderFrame: frame }, {}),
    ).toMatchObject({ error: true, code: 'untrusted_sender' })
    expect(
      makeHandlers({ isTrustedUrl: () => false })['app:getInfo'](trustedEvent, {}),
    ).toMatchObject({ error: true, code: 'untrusted_sender' })
  })

  it('returns a fixed internal error without exposing exception paths', () => {
    const logError = vi.fn()
    const result = makeHandlers({
      getInfo: () => {
        throw new Error('Failure at C:\\private\\secret')
      },
      logError,
    })['app:getInfo'](trustedEvent, {})

    expect(result).toEqual({
      error: true,
      code: 'internal_error',
      message: 'info.fetch_failed',
    })
    expect(JSON.stringify(result)).not.toContain('C:\\private\\secret')
    expect(logError).toHaveBeenCalledOnce()
  })

  it('returns a generic internal error when openExternal fails', async () => {
    const logError = vi.fn()
    const handler = makeHandlers({
      openExternal: () => Promise.reject(new Error('No handler at C:\\private\\secret')),
      logError,
    })['app:openExternal']

    const result = await handler(trustedEvent, { url: 'https://example.com' })

    expect(result).toEqual({
      error: true,
      code: 'internal_error',
      message: 'error.internal_error',
    })
    expect(JSON.stringify(result)).not.toContain('C:\\private\\secret')
    expect(logError).toHaveBeenCalledOnce()
  })

  it('opens only validated external links', async () => {
    const openExternal = vi.fn((url: string) => Promise.resolve(url).then(() => undefined))
    const handler = makeHandlers({ openExternal })['app:openExternal']

    expect(await handler(trustedEvent, { url: 'https://example.com' })).toEqual({
      opened: true,
    })
    expect(openExternal).toHaveBeenCalledWith('https://example.com/')
    expect(await handler(trustedEvent, { url: 'file:///etc/passwd' })).toMatchObject({
      error: true,
      code: 'invalid_request',
    })
    expect(openExternal).toHaveBeenCalledOnce()
  })
})

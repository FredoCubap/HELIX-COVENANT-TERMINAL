import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

export function resolveTrustedDevUrl(value: string | undefined): URL | null {
  if (value === undefined) {
    return null
  }

  try {
    const url = new URL(value)
    if (
      url.protocol !== 'http:' ||
      !loopbackHosts.has(url.hostname.toLowerCase()) ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return null
    }

    return url
  } catch {
    return null
  }
}

export function isTrustedAppUrl(
  value: string,
  devOrigin: string | null,
  rendererFilePath: string,
): boolean {
  try {
    const url = new URL(value)

    if (devOrigin !== null) {
      return url.origin === devOrigin
    }

    if (url.protocol !== 'file:') {
      return false
    }

    const targetPath = resolve(fileURLToPath(url))
    const expectedPath = resolve(rendererFilePath)
    return process.platform === 'win32'
      ? targetPath.toLowerCase() === expectedPath.toLowerCase()
      : targetPath === expectedPath
  } catch {
    return false
  }
}

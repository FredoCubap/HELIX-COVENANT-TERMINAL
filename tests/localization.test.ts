import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import esCatalog from '../src/shared/locales/es.json'
import enCatalog from '../src/shared/locales/en.json'
import {
  createTranslator,
  getLocale,
  resolveLocale,
  setLocale,
  t,
} from '../src/shared/localization'

describe('localización: función t', () => {
  beforeEach(() => {
    setLocale('es')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('devuelve el texto en el idioma activo', () => {
    expect(t('app.title')).toBe('HELIX COVENANT TERMINAL')
    expect(t('error.untrusted_sender')).toBe('Emisor no confiable.')
  })

  it('usa el inglés cuando la clave falta en el idioma activo', () => {
    const translator = createTranslator({
      es: {},
      en: { 'greeting.hello': 'Hello, {{name}}.' },
    })

    expect(translator('es', 'greeting.hello', { name: 'Fredo' })).toBe('Hello, Fredo.')
  })

  it('devuelve la clave y advierte cuando falta en ambos catálogos', () => {
    const warn = vi.fn()
    const translator = createTranslator({ es: {}, en: {} }, warn)

    expect(translator('es', 'missing.key')).toBe('missing.key')
    expect(warn).toHaveBeenCalledWith('Clave de localización ausente: missing.key')
  })

  it('interpela valores de texto, número y booleano', () => {
    const translator = createTranslator({
      es: {},
      en: { 'greeting.hello': 'Hello, {{name}}: {{count}} ({{active}}).' },
    })

    expect(
      translator('en', 'greeting.hello', {
        name: 'Fredo',
        count: 3,
        active: true,
      }),
    ).toBe('Hello, Fredo: 3 (true).')
  })

  it('preserva el marcador si falta una variable', () => {
    const translator = createTranslator({
      es: {},
      en: { 'greeting.hello': 'Hello, {{name}}.' },
    })

    expect(translator('en', 'greeting.hello')).toBe('Hello, {{name}}.')
  })

  it('no resuelve claves ni variables heredadas del prototipo', () => {
    const warn = vi.fn()
    const translator = createTranslator({ es: {}, en: { 'a.b': 'Hola {{toString}}.' } }, warn)

    expect(translator('es', 'constructor')).toBe('constructor')
    expect(translator('es', '__proto__')).toBe('__proto__')
    expect(warn).toHaveBeenCalledTimes(2)
    expect(translator('en', 'a.b', {})).toBe('Hola {{toString}}.')
  })

  it('mantiene el idioma activo entre llamadas', () => {
    setLocale('es')
    expect(getLocale()).toBe('es')
    expect(t('error.invalid_request')).toBe('Solicitud no válida.')

    setLocale('en')
    expect(getLocale()).toBe('en')
    expect(t('error.invalid_request')).toBe('Invalid request.')
  })
})

describe('localización: resolución de idioma', () => {
  it.each([
    ['es', undefined, 'es'],
    ['en', undefined, 'en'],
    ['es-MX', undefined, 'es'],
    ['es-ES', undefined, 'es'],
    ['de-DE', undefined, 'en'],
    ['en-US', undefined, 'en'],
    ['fr-FR', undefined, 'en'],
    [undefined, 'es-MX', 'es'],
    [undefined, 'es-ES', 'es'],
    [undefined, 'de-DE', 'en'],
    [undefined, 'en-US', 'en'],
    [undefined, undefined, 'en'],
  ])('resolveLocale(%s, %s) = %s', (preference, systemLocale, expected) => {
    expect(resolveLocale(preference, systemLocale)).toBe(expected)
  })

  it('rechaza preferencias inválidas y usa el sistema o inglés', () => {
    expect(resolveLocale('fr', undefined)).toBe('en')
    expect(resolveLocale('pt-BR', undefined)).toBe('en')
    expect(resolveLocale('', undefined)).toBe('en')
    expect(resolveLocale('es_not-a-locale', 'en-US')).toBe('en')
    expect(resolveLocale('es', 'de-DE')).toBe('es')
  })
})

describe('localización: paridad de catálogos', () => {
  it('tiene las mismas claves en es y en', () => {
    const clavesEs = Object.keys(esCatalog).sort()
    const clavesEn = Object.keys(enCatalog).sort()
    expect(clavesEs).toEqual(clavesEn)
  })

  it('no tiene claves vacías en ningún catálogo', () => {
    for (const catalog of Object.values({ es: esCatalog, en: enCatalog })) {
      for (const valor of Object.values(catalog)) {
        expect(valor.trim().length).toBeGreaterThan(0)
      }
    }
  })
})

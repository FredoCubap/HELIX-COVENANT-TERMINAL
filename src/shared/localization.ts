import esCatalog from './locales/es.json'
import enCatalog from './locales/en.json'

export type Locale = 'es' | 'en'
export type CatalogSet = Readonly<Record<Locale, Readonly<Record<string, string>>>>
export type Translator = (locale: Locale, key: string, vars?: Record<string, unknown>) => string

const catalogs: CatalogSet = {
  es: esCatalog,
  en: enCatalog,
}

let activeLocale: Locale = 'en'

export function setLocale(locale: Locale): void {
  activeLocale = locale
}

export function getLocale(): Locale {
  return activeLocale
}

function matchSupportedLocale(value: string): Locale | undefined {
  try {
    const [canonicalLocale] = Intl.getCanonicalLocales(value)
    if (canonicalLocale === undefined) {
      return undefined
    }

    const language = new Intl.Locale(canonicalLocale).language.toLowerCase()
    if (language === 'es' || language === 'en') {
      return language
    }
  } catch {
    return undefined
  }

  return undefined
}

export function resolveLocale(
  preference: string | undefined,
  systemLocale: string | undefined,
): Locale {
  if (preference !== undefined) {
    const matched = matchSupportedLocale(preference)
    if (matched !== undefined) {
      return matched
    }
  }

  if (systemLocale !== undefined) {
    const matched = matchSupportedLocale(systemLocale)
    if (matched !== undefined) {
      return matched
    }
  }

  return 'en'
}

function interpolate(template: string, vars: Record<string, unknown> | undefined): string {
  if (!vars) {
    return template
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = Object.hasOwn(vars, key) ? vars[key] : undefined
    if (value === undefined || value === null) {
      return `{{${key}}}`
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    return `{{${key}}}`
  })
}

export function createTranslator(
  catalogSet: CatalogSet,
  warn: (message: string) => void = (message) => {
    console.warn(message)
  },
): Translator {
  return (locale, key, vars) => {
    // hasOwn: claves como "constructor" no deben resolverse por herencia del prototipo.
    const message = [catalogSet[locale], catalogSet.en].find((catalog) =>
      Object.hasOwn(catalog, key),
    )?.[key]
    if (message === undefined) {
      warn(`Clave de localización ausente: ${key}`)
      return key
    }
    return interpolate(message, vars)
  }
}

const translate = createTranslator(catalogs)

export function t(key: string, vars?: Record<string, unknown>): string {
  return translate(activeLocale, key, vars)
}

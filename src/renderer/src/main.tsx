import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { resolveLocale, setLocale, t } from '../../shared/localization'
import { App } from './App'

const locale = resolveLocale(undefined, navigator.language)
setLocale(locale)
document.documentElement.lang = locale
document.title = t('app.title')

const root = document.getElementById('root')
if (!root) throw new Error('No se encontró el elemento #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

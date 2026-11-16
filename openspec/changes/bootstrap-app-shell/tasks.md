# Tasks

## 1. Andamiaje del proyecto

- [x] 1.1 Crear `package.json` (versión `0.1.0`, licencia Apache-2.0), configuración de `electron-vite` y carpetas `src/main`, `src/preload`, `src/renderer`, `src/shared`; verificar que `npm run dev` abre una ventana vacía
- [x] 1.2 Fijar versiones exactas de Electron, `electron-vite`, React, Vite y TypeScript 6.0.3 (estricto; la 7 no es compatible con `typescript-eslint`); verificar con `npm run typecheck` sin errores
- [x] 1.3 Configurar ESLint (flat config), Prettier y `.editorconfig`; verificar que `npm run lint` pasa sobre el esqueleto
- [x] 1.4 Declarar el script `postinstall` (`install-electron`), porque Electron 45 no trae script de instalación y `electron-vite` no descarga el binario; verificar que en una copia limpia del repo `npm ci` deja `node_modules/electron/dist/electron.exe` sin pasos manuales

## 2. Ventana y seguridad (`app-shell`)

- [ ] 2.1 Crear la ventana principal con `contextIsolation`, `sandbox`, sin integración de Node, título "HELIX COVENANT TERMINAL", tamaño mínimo y `show: false` hasta `ready-to-show`; verificar abriendo la app y comprobando el título
- [ ] 2.2 Cerrar el proceso al cerrar la última ventana y aplicar instancia única que enfoca la ventana existente; verificar con el test de humo del lanzamiento doble (grupo 5)
- [ ] 2.3 Cancelar `will-navigate` hacia fuera del contenido propio, denegar `window.open` y abrir en el navegador solo `http`/`https`; verificar con un test unitario del validador de URLs (casos `https`, `http`, `file:`, `javascript:`, vacío) en Vitest
- [ ] 2.4 Denegar por defecto todos los permisos de dispositivo de la sesión; verificar con el humo (solicitud de cámara denegada)
- [ ] 2.5 Añadir la política de contenido (sin scripts remotos ni en línea), relajada solo para el servidor de desarrollo; verificar con el humo sobre el build de producción que un script en línea se bloquea
- [ ] 2.6 Alternar pantalla completa con F11; verificar con el humo que la ventana entra y sale de pantalla completa

## 3. Contrato IPC (`ipc-contract`)

- [ ] 3.1 Definir `src/shared/contract.ts` con el canal `app:getInfo` y sus esquemas de mensaje y respuesta; verificar que un cambio incompatible rompe `npm run typecheck`
- [ ] 3.2 Implementar el registro único de handlers en main con validación de esquema y comprobación de emisor (ventana principal y marco principal); verificar con tests Vitest: mensaje válido, mensaje inválido, canal desconocido y emisor no confiable
- [ ] 3.3 Sanear los errores devueltos a la interfaz (código y mensaje, sin rutas ni trazas); verificar con un test que fuerza un fallo interno y revisa que la respuesta no contiene rutas
- [ ] 3.4 Exponer en el preload `window.helix` con un método tipado por canal, sin `ipcRenderer` ni `invoke` genérico; verificar con el humo que `window.helix.getInfo()` devuelve versión SemVer y plataforma, y que `window.require` y `window.process` no existen

## 4. Localización (`localization`)

- [ ] 4.1 Crear catálogos `es` y `en` con los textos del esqueleto y la función `t(clave, vars?)` con respaldo en → clave más advertencia; verificar con tests Vitest de los dos escenarios de texto faltante
- [ ] 4.2 Implementar la resolución pura del idioma (preferencia explícita válida → idioma del sistema es/en → inglés); verificar con tests de `es-MX`, `es-ES`, `de-DE`, `en-US`, preferencia válida y preferencia inválida
- [ ] 4.3 Añadir el test de paridad que falla si un catálogo tiene claves que el otro no; verificar añadiendo una clave solo en `es` y comprobando que el test falla (y luego revirtiendo)

## 5. Test de humo con la aplicación real

- [ ] 5.1 Configurar Playwright con `_electron`, directorio de usuario temporal por ejecución y ningún shell lanzado; verificar que `npm run test:smoke` arranca y cierra la app en esta máquina (Windows 11)
- [ ] 5.2 Cubrir los escenarios del humo: título, aislamiento, navegación externa cancelada, script en línea bloqueado, F11, segundo lanzamiento; verificar que los seis pasan en el build de producción

## 6. Integración continua

- [ ] 6.1 Crear `.github/workflows/ci.yml` con matriz `windows-latest` y `ubuntu-latest` (`npm ci`, lint, tipos, tests, build, humo con `xvfb-run` en Linux); cachear la descarga del binario de Electron que hace el `postinstall`; verificar que el workflow queda verde en ambos sistemas tras un push
- [ ] 6.2 Ajustar en el runner de Ubuntu la restricción de user namespaces para que Chromium arranque con sandbox activo, sin `--no-sandbox`; verificar que el humo de Linux pasa y que la app no usa `--no-sandbox` en ningún lugar del código

## 7. Documentación

- [ ] 7.1 Documentar en el `README.md` cómo instalar, ejecutar en desarrollo, probar y compilar, en español; verificar ejecutando cada comando tal como está escrito en una carpeta limpia
- [ ] 7.2 Documentar en el README la regla de que los tests solo ejecutan comandos inocuos y fijos de prueba (nunca comandos tomados del entorno del usuario; en este change ni siquiera abren shells) y el versionado SemVer; verificar que el texto aparece y los enlaces funcionan

## Workflow follow-up

- Revisar el change con Fredo antes de implementar.
- Archivar el change cuando la CI esté verde en Windows y Ubuntu y se haya revisado el código.

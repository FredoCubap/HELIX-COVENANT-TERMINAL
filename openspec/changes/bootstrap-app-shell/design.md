# Design

## Context

El repo está vacío salvo licencia, README y OpenSpec. El proyecto es una aplicación de escritorio para Windows 11 y Linux sobre Electron (decisión tomada tras comparar con Tauri: Chromium propio da el mismo render en cualquier distro). Convenciones del hub de Fredo que se respetan: npm, TypeScript, React + Vite, ESLint + Prettier. No hay backend ni base de datos. Motivación y alcance en `proposal.md`; requisitos en `specs/`.

Estado verificado en esta máquina: Node 24, Electron 45.3.3 arranca. El paquete `electron` 45 **no tiene script de instalación** (no hay nada que aprobar en npm 11) y su descarga perezosa no la dispara `electron-vite`, que falla con `Electron uninstall` si falta el binario (comprobado al implementar). Por eso el proyecto declara su propio script `postinstall` (`install-electron`). Sí habrá aprobación de scripts para `node-pty` en `terminal-core`.

## Goals / Non-Goals

**Goals:**
- Una app que arranca, abre una ventana y cumple los requisitos de seguridad desde el primer commit.
- Un contrato IPC único, tipado y validado, que el resto de changes extienden sin tocar la seguridad.
- Un test de humo sobre la app real, ejecutable en CI en ambos sistemas.

**Non-Goals:**
- Terminal, PTY, widgets y temas (changes posteriores).
- Instaladores y firma (`packaging-release`).
- Barra de título propia sin marco: esta fase usa el marco nativo.
- Persistencia de configuración y selector de idioma (`settings-persistence`); aquí solo existe el punto de entrada para una preferencia explícita.
- API de mods: se difiere (YAGNI), pero el contrato IPC se diseña para poder ampliarse.

## Decisions

**D1. Un solo paquete con `electron-vite`** (carpetas `main`, `preload`, `renderer`, `shared`). *Alternativas:* monorepo con workspaces (rechazada: complejidad sin beneficio con un solo ejecutable); Vite a mano con tres configs (rechazada: `electron-vite` ya resuelve los tres bundles y el HMR).

**D2. Ajustes de seguridad de la ventana:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, sin módulo remoto, `webSecurity` activo, `show: false` hasta `ready-to-show`. Navegación: `will-navigate` cancela todo lo que no sea el contenido propio y `setWindowOpenHandler` devuelve `deny`; solo `http`/`https` pasan a `shell.openExternal`. Permisos: handler de sesión que deniega todo.

**D3. Política de contenido por `<meta>` y carga con `file://`.** *Alternativa:* protocolo propio `app://` con cabeceras CSP reales, que da un origen verificable. Se elige `file://` + meta por simplicidad y porque la validación del emisor (D4) no depende del origen. `// ponytail:` pasar a protocolo propio si más adelante hace falta un origen estricto. En desarrollo la CSP se relaja solo para el servidor local de Vite; el test de humo corre sobre el build de producción para que esa relajación no escape.

**D4. Contrato IPC en `shared/contract.ts`:** un mapa canal → esquema de mensaje (zod) → esquema de respuesta. En main, un único `handle(canal, fn)` valida el mensaje y comprueba que `event.sender` es la ventana principal y `event.senderFrame` su marco principal. El preload expone `window.helix` con un método tipado por canal, **sin** exponer `ipcRenderer` ni un `invoke` genérico. Los errores devueltos a la UI llevan código y mensaje saneados, nunca rutas ni trazas. *Alternativas:* librerías de RPC para Electron (rechazadas: dependencia para lo que son ~60 líneas).

**D5. i18n propio mínimo, sin librería:** dos catálogos JSON (`es`, `en`), una función `t(clave, vars?)` con interpolación simple y la cadena de respaldo en → clave. El idioma se resuelve en la UI a partir de `navigator.language` con una función pura que recibe la preferencia explícita opcional. *Alternativa:* `i18next` (rechazada por ahora: plurales y contextos no se necesitan; se reevalúa si aparecen). Un test compara las claves de ambos catálogos.

**D6. Calidad:** TypeScript en modo estricto, ESLint (flat config) + Prettier, Vitest para lógica pura (esquemas del contrato, resolución de idioma, paridad de catálogos), Playwright con `_electron` para el humo: la app arranca, el título es el esperado, `window.require` y `window.process` no existen, `window.helix.getInfo()` devuelve versión y plataforma, una navegación externa se cancela, y un segundo lanzamiento con el mismo directorio de datos termina enfocando al primero. Los tests usan un directorio de usuario temporal y **no abren ningún shell**.

**D7. CI en GitHub Actions** con matriz `windows-latest` y `ubuntu-latest`: `npm ci`, lint, tipos, tests, build y humo (con `xvfb-run` en Linux). El binario de Electron lo descarga el `postinstall` durante `npm ci`; el job cachea esa descarga para que un fallo de red no parezca un fallo de la aplicación.

**D8. Versionado:** SemVer. El proyecto arranca en `0.1.0`; `1.0.0` al estabilizar el MVP. Las versiones de dependencias se fijan exactas al implementar.

## Risks / Trade-offs

- **Sandbox de Chromium en Ubuntu 24.04** (restricción de user namespaces sin privilegios puede impedir arrancar Electron en el runner) → en CI se ajusta el parámetro del kernel en el runner; **no** se distribuye con `--no-sandbox`.
- **CSP con meta en `file://` es más débil que cabeceras reales** → compensado con `sandbox`, aislamiento de contexto y validación de emisor; se reevalúa con `app://`.
- **Cadencia de Electron (versión mayor cada pocas semanas)** → versión exacta fijada y actualización deliberada, no automática.
- **Relajación de CSP en desarrollo** podría filtrarse a producción → el humo corre sobre el build de producción y comprueba que un script en línea se bloquea.
- **TypeScript 7 no es compatible con `typescript-eslint`** (su peer exige `<6.1.0`; verificado al implementar) → se fija TypeScript **6.0.3**; se actualiza a 7 cuando `typescript-eslint` lo soporte.
- **La instalación necesita red** para descargar el binario de Electron (`postinstall`) → se documenta en el README y el CI cachea la descarga.
- **Marco nativo vs. estética sci-fi** → aceptado por ahora; el cambio a barra propia afectará a `app-shell` y se hará con su propia modificación de spec en `theming-scifi`.

## Open Questions

- Identificador de la aplicación (`appId`) y nombre del ejecutable: se fijan en `packaging-release`, sin efecto en estos specs.
- Icono de la aplicación: pendiente de la identidad visual; se usará el icono por defecto mientras tanto.

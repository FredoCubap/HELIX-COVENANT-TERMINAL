# Proposal

## Why

HELIX COVENANT TERMINAL no tiene todavía código. Antes de poder construir el terminal, los widgets y los temas hace falta una base ejecutable y segura: una aplicación de escritorio que abra una ventana, que aísle la interfaz del sistema operativo y que fije desde el inicio las reglas de seguridad, idioma y calidad. Corregir el modelo de seguridad después (el error central de eDEX-UI, que usaba `nodeIntegration: true`) es mucho más caro que nacer bien.

## What Changes

- Crear el esqueleto de la aplicación de escritorio (Windows 11 y Linux; macOS fuera de alcance) con tres capas separadas: proceso principal, puente de preload y interfaz.
- La ventana principal arranca con la interfaz aislada: sin acceso directo a Node.js, con política de contenido restrictiva, navegación bloqueada y apertura de enlaces externos solo con URLs validadas.
- Toda comunicación entre interfaz y proceso principal pasa por un contrato de canales explícito, tipado y validado; los mensajes fuera de contrato se rechazan.
- Soporte de interfaz en español e inglés desde el primer arranque, con detección del idioma del sistema y respaldo a inglés.
- Instancia única: lanzar la aplicación por segunda vez enfoca la ventana existente.
- Calidad desde el día uno: lint, formato, tipos estrictos, tests unitarios, un test de humo que arranca la aplicación real, y CI en Windows y Ubuntu.
- Declarar la aprobación explícita del script de instalación de `electron`, que npm 11 bloquea por defecto (sin ella, un clon nuevo no descarga el binario).

No hay cambios **BREAKING**: el proyecto parte de cero.

## Capabilities

### New Capabilities

- `app-shell`: ventana principal, aislamiento de la interfaz, política de navegación y enlaces externos, instancia única y ciclo de vida de la aplicación.
- `ipc-contract`: canales permitidos entre interfaz y proceso principal, validación de mensajes y rechazo de lo que no esté en el contrato.
- `localization`: idiomas soportados (en/es), resolución del idioma activo y comportamiento ante textos faltantes.

### Modified Capabilities

<!-- Ninguna: no existen specs previas. -->

## Impact

- **Código nuevo** en la raíz del repo: proyecto Node/TypeScript con `package.json`, configuración de build, lint y tests, y carpetas por capa (principal, preload, interfaz).
- **Dependencias nuevas** (versiones exactas al implementar; verificadas hoy: Electron 45.3.3, `electron-vite` 6.0.0, Vitest 5.1.0, Playwright 1.65.1). `node-pty` queda para el change `terminal-core`.
- **CI nuevo** en `.github/workflows/` con matriz `windows-latest` y `ubuntu-latest`. El toolchain C++ en Ubuntu se añade en `terminal-core`, porque `node-pty` no publica prebuilds para Linux (hallazgo del spike S1).
- **Sin base de datos** ni servicios externos. El empaquetado en instaladores queda para el change `packaging-release`.

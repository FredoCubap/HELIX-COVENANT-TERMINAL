# Proposal

## Why

Con la base segura de `bootstrap-app-shell` ya existe una ventana, pero todavía no un terminal. El terminal es el producto: sin sesiones de shell reales, con salida fluida y segura, el resto (temas, widgets, paleta) no tiene sobre qué montarse. Además, la salida de un terminal no es confiable: una secuencia de escape maliciosa puede leer o escribir el portapapeles o falsear títulos, así que la seguridad de la salida debe nacer con el terminal.

## What Changes

- Abrir sesiones de shell reales (PTY) en Windows 11 y Linux, eligiendo el shell entre una lista detectada por la aplicación; la interfaz nunca indica una ruta ejecutable arbitraria.
- Renderizar el terminal con aceleración por GPU, con respaldo automático si el contexto gráfico se pierde, buffer de desplazamiento y UTF-8 correcto (acentos y eñes incluidos).
- Control de flujo: una salida masiva (`yes`, `cat` de un archivo enorme) no congela la interfaz ni crece la memoria sin límite.
- Varias sesiones en pestañas independientes, con atajos que no chocan con los del shell (`Ctrl+Shift+…`).
- Cierre limpio: cerrar una pestaña o la aplicación termina el shell y sus procesos hijos, sin huérfanos.
- Seguridad de la salida: portapapeles por secuencias OSC 52 desactivado, enlaces con apertura validada, títulos saneados y pegado protegido contra inyección.
- Ampliar el contrato IPC con eventos del proceso principal hacia la interfaz (datos de salida, fin de sesión).

**Dependencia:** este change se implementa **después** de `bootstrap-app-shell` y de archivarlo, porque amplía su capability `ipc-contract`.

## Capabilities

### New Capabilities

- `terminal-session`: creación, entrada/salida, redimensionado, control de flujo, límites y cierre de sesiones de shell; elección acotada de shell.
- `terminal-view`: presentación del terminal (render, desplazamiento, selección, copiar y pegar, Unicode, ajuste al tamaño) y gestión de pestañas con sus atajos.
- `terminal-output-safety`: tratamiento seguro de las secuencias de escape y del pegado.

### Modified Capabilities

- `ipc-contract`: se añade la emisión de eventos desde el proceso principal hacia la interfaz.

## Impact

- **Código nuevo:** gestor de sesiones y resolución de shells en el proceso principal; vista de terminal y pestañas en la interfaz; ampliación del contrato compartido y del preload.
- **Dependencias nuevas:** `node-pty` 1.1.0 (nativo), `@xterm/xterm` 6.0.0, `@xterm/addon-fit`, `@xterm/addon-webgl` 0.19.0, un addon de Unicode y `@xterm/headless` solo para tests. Versiones exactas al implementar.
- **CI:** en Ubuntu hay que instalar el toolchain C++ (`python3`, `make`, `g++`), porque `node-pty` no publica prebuilds para Linux (hallazgo del spike S1); en Windows basta el prebuild `win32-x64`, verificado funcionando en Electron 45.
- **npm:** aprobar el script de instalación de `node-pty` con `npm install-scripts approve`.
- Los tests ejecutan shells reales: solo con comandos inocuos y fijos, en un directorio temporal.

# Design

## Context

Parte de la base de `bootstrap-app-shell`: ventana aislada, contrato IPC único validado y localización en/es. Este change añade el PTY, la vista y las pestañas sobre ese contrato. Motivación y alcance en `proposal.md`; requisitos en `specs/`.

Hechos verificados en los spikes: `node-pty` 1.1.0 carga en Electron 45.3.3 (Node 24) y lanza PowerShell en Windows con el prebuild `win32-x64`; su paquete **no** trae prebuilds de Linux, así que allí se compila con `node-gyp`. xterm 6.0.0 con WebGL absorbió 100 000 líneas (~13 MB) en ~1,6 s en esta máquina, y con un filtro CSS de glow en ~1,7 s.

## Goals / Non-Goals

**Goals:**
- Sesiones de shell fiables, con flujo controlado y cierre sin huérfanos.
- Una vista de terminal fluida y una salida tratada como no confiable.

**Non-Goals:**
- Divisiones de panel (splits), bloques de comandos, paleta, integración de shell (OSC 7/133): changes posteriores.
- Selector de shell en la interfaz y persistencia de preferencias: `settings-persistence`. Aquí se usa el shell predeterminado y la lista detectada queda disponible vía contrato.
- Temas y efectos visuales: `theming-scifi`.

## Decisions

**D1. PTY en el proceso principal con `node-pty`**, un `SessionManager` con mapa `idSesión → pty`. La interfaz solo conoce el id. *Alternativa:* proceso utilitario aparte por sesión (aislaría caídas del PTY, pero añade IPC y empaquetado; se reevalúa si un PTY colgado afecta a la ventana).

**D2. Resolución de shells** en una función pura `resolveShells(env, fs, platform)` que devuelve la lista y el predeterminado según la spec; recibe el entorno y el sistema de archivos como parámetros para probarla sin tocar el equipo. El contrato expone identificadores (`pwsh`, `powershell`, `cmd`, `bash`…), nunca rutas.

**D3. Entorno del hijo:** copia del entorno del usuario menos las variables internas (`ELECTRON_RUN_AS_NODE`, `ELECTRON_*`, `NODE_OPTIONS` solo si lo puso la app), más `TERM` y `COLORTERM`. Sin esto, programas Electron lanzados desde el shell se comportan como Node.

**D4. Flujo de datos con confirmaciones (ack):** `onData` del PTY se agrupa en main (ventana de ~8 ms o 64 KB) y se emite como evento. La unidad de cuenta es la **longitud de la cadena** que entrega `node-pty` (unidades UTF-16), la misma que la interfaz recibe y confirma tras el callback de `term.write`; no se mezclan bytes y caracteres. Main cuenta lo no confirmado y **valida cada `ack`**: entero positivo y no mayor que lo pendiente, para que una confirmación abusiva no deje el contador negativo ni anule el tope. Umbrales: sobre el umbral alto (1 MB) llama a `pause()` y por debajo del bajo (256 KB) a `resume()`. *Alternativa:* `MessagePort` dedicado por sesión para mayor ancho de banda; se reevalúa solo si la medición muestra el IPC como cuello de botella (`// ponytail:` IPC con lotes hasta medir).

**D5. Cierre sin huérfanos:** cerrar la sesión mata el PTY; en Windows cerrar el pseudoconsole termina los procesos conectados y en Linux se envía la señal al grupo de procesos de la sesión. **Se verifica con un test real** (proceso `sleep` hijo que no debe sobrevivir) en cada plataforma, en lugar de suponerlo. Al salir la aplicación se cierran todas las sesiones antes de terminar.

**D6. Vista:** una instancia de `Terminal` de xterm por pestaña, mantenida viva (oculta) al cambiar de pestaña para conservar el historial. Addons: ajuste al contenedor, WebGL con manejador de pérdida de contexto que lo elimina y deja el dibujado alternativo, y el addon de Unicode apropiado para caracteres anchos (verificar cuál recomienda xterm 6 al implementar). Historial de 10 000 líneas.

**D7. Atajos:** todos los de la aplicación usan `Ctrl+Shift+…` o `Ctrl+RePág/AvPág`; `Ctrl+C`, `Ctrl+W`, `Ctrl+T` etc. pasan siempre al shell. Se interceptan con el manejador de teclas de xterm, no con atajos globales de la ventana.

**D8. Seguridad de la salida:** se registran manejadores del parser de xterm: OSC 52 se descarta; OSC 0/2 actualiza un título saneado (sin caracteres de control, 100 caracteres); no se responde a peticiones de informe de título. Los enlaces se detectan con el addon de enlaces y OSC 8 con el manejador de enlaces de xterm, y abren con `Ctrl+clic` a través del canal de apertura externa de `app-shell`. El pegado elimina la secuencia de cierre de pegado entre marcadores antes de enmarcar.

**D9. Contrato:** canales de petición `terminal:listShells`, `terminal:create`, `terminal:write`, `terminal:resize`, `terminal:ack`, `terminal:close`, y eventos `terminal:data` y `terminal:exit`, todos con esquema. Límites validados: 16 sesiones, dimensiones 1–500 × 1–200 y **64 KB como máximo por escritura**. El identificador de sesión es opaco y aleatorio (`crypto.randomUUID()`); operar sobre un id inexistente devuelve un error, nunca una excepción. `IpcError.code` se amplía con códigos específicos (`session_limit`, `invalid_directory`, `shell_not_found`, `session_not_found`, `payload_too_large`) y su validador y el catálogo es/en se actualizan juntos. En el preload, la suscripción entrega a la interfaz **solo el contenido validado**, nunca el objeto `event` de Electron (que expone `sender`).

**D10. Pruebas:** Vitest con un PTY simulado para el control de flujo y la resolución de shells; `@xterm/headless` para probar los manejadores de seguridad de la salida sin interfaz; e2e con la aplicación real que lanza el shell con comandos inocuos y fijos en un directorio temporal. El test de salida masiva mide el tiempo y lo registra; su tope en CI es holgado porque los runners son más lentos que el equipo de referencia, y el requisito de 5 s se verifica en local.

**D11. Sesiones ligadas a la interfaz:** cada sesión guarda el `webContents` que la creó. Al navegar o recargar (`did-start-navigation` en el marco principal), al perderse el proceso de la interfaz (`render-process-gone`) o al destruirse el contenido (`destroyed`), el gestor cierra todas sus sesiones con el mismo cierre escalonado de D5. Sin esto, recargar la interfaz dejaría shells vivos sin dueño.

**D12. Sin menú de aplicación:** `Menu.setApplicationMenu(null)` antes de crear la ventana. El menú por defecto de Electron asigna `Ctrl+R` (recargar), `Ctrl+W` (cerrar ventana) y `Ctrl+Shift+I` (DevTools); sin quitarlo, D7 no se cumple y la interfaz podría recargarse y matar las sesiones. El humo comprueba por comportamiento (la ventana sigue viva, la interfaz no se recarga y DevTools no se abre), no suponiendo cuál es el menú.

## Risks / Trade-offs

- **`node-pty` se compila en Linux** → el CI instala `build-essential` y `python3`; el empaquetado debe descomprimir el módulo nativo del archivo asar (se resuelve en `packaging-release`).
- **Procesos huérfanos tras cerrar** → test de cierre por plataforma (D5) y cierre ordenado al salir de la aplicación.
- **Pérdida de contexto WebGL** (suspensión, cambio de GPU) → manejador con respaldo; se prueba forzándola.
- **Sesión de shell que ignora la señal de cierre** → cierre escalonado: cierre cortés, espera corta y terminación forzada.
- **Conflicto de atajos con métodos de entrada (IME) en Linux** → atajos solo con `Ctrl+Shift`; se revisa al probar en una distro real.
- **Recarga o caída de la interfaz con sesiones abiertas** → D11 las cierra; test que recarga y comprueba que no queda ningún proceso.
- **Atajos del menú por defecto** (`Ctrl+R`, `Ctrl+W`, `Ctrl+Shift+I`) → D12 quita el menú; test de humo por comportamiento.
- **Tests de rendimiento intermitentes en CI** (ya ocurrió con el humo en Ubuntu, PR #6) → tope holgado en CI y límites de tiempo explícitos en cada test.
- **Enlaces que la apertura externa rechaza** (más de 2048 caracteres o con usuario y contraseña) → la vista muestra un aviso localizado en lugar de no hacer nada.
- **IPC con lotes puede quedarse corto para salidas gigantes** → control de flujo evita crecer; medir antes de pasar a `MessagePort`.
- **Pegado multilínea sin confirmación** puede ejecutar varias líneas → mitigado por el pegado entre marcadores; una confirmación explícita queda como pregunta abierta.

## Open Questions

- ¿Confirmar al cerrar una pestaña (o la aplicación) con un proceso en primer plano? No cambia los specs actuales; decisión de UX para `settings-persistence`.
- ¿Confirmar el pegado de texto multilínea cuando el programa no usa pegado entre marcadores? Mismo caso.

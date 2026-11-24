# Tasks

## 1. Menú de aplicación (`app-shell`)

- [x] 1.1 Quitar el menú de aplicación por defecto con `Menu.setApplicationMenu(null)` antes de crear la ventana; verificar con el test de humo, por comportamiento, que `Ctrl+R` no recarga (un marcador en `window` sobrevive), que `Ctrl+W` no cierra la ventana y que `Ctrl+Shift+I` no abre las herramientas de desarrollo

## 2. Dependencias y toolchain

- [x] 2.1 Añadir `node-pty`, `@xterm/xterm`, addons de ajuste, WebGL, enlaces (`@xterm/addon-web-links`) y Unicode, y `@xterm/headless` (dev) con versiones exactas, consultadas con Fredo; verificar que `npm ci` en Windows instala `node-pty` desde su prebuild, que `npm run typecheck` pasa, que xterm 6.0.0 y sus addons son compatibles y que `npm run build` deja `node-pty` como módulo externo del bundle de main
- [x] 2.2 Aprobar el script de instalación de `node-pty` con `npm install-scripts approve node-pty`; verificar que un `npm ci` en carpeta limpia deja el módulo nativo utilizable
- [x] 2.3 Instalar `build-essential` y `python3` en el job de Ubuntu del CI; verificar que `npm ci` compila `node-pty` y el job queda verde

## 3. Resolución de shells (`terminal-session`)

- [x] 3.1 Implementar `resolveShells(env, fs, platform)` con las reglas de Windows y Linux; verificar con tests Vitest de los cuatro escenarios (pwsh, sin pwsh, `$SHELL` válido, `$SHELL` inválido)
- [x] 3.2 Implementar la elección acotada por identificador y el rechazo de rutas arbitrarias; verificar con un test que una ruta no detectada no ejecuta ningún proceso

## 4. Gestor de sesiones

- [x] 4.1 Implementar `SessionManager` (crear, escribir, redimensionar, cerrar) con directorio inicial, validación de directorio existente y límites de dimensiones y de 16 sesiones; con identificadores de sesión opacos y aleatorios y error (sin excepción) ante un id inexistente; verificar con tests de los escenarios de dimensiones fuera de rango, directorio inexistente, límite alcanzado y sesión inexistente
- [x] 4.2 Construir el entorno del hijo (`TERM`, `COLORTERM`, sin variables internas); verificar con un test que un shell real imprime `TERM=xterm-256color` y no tiene `ELECTRON_RUN_AS_NODE`
- [x] 4.3 Notificar el fin de sesión con su código de salida y liberar recursos; verificar con shells reales que terminan con código 0 y con código distinto de 0
- [x] 4.4 Cerrar sin huérfanos con cierre escalonado (cortés, espera, forzado), capturando antes los descendientes del shell, y ofrecer `closeAll` para cerrar todas las sesiones al salir; verificar con un test real por plataforma que un proceso hijo de larga duración deja de existir tras cerrar, y en Linux que también muere un shell que ignora la señal de cierre con un hijo bajo `nohup`
- [x] 4.5 Atar cada sesión al contenido que la creó (`closeOwnedBy`) y enlazarlo a los eventos de `webContents` (`did-start-navigation` del marco principal y de otro documento, `render-process-gone`, `destroyed`) con `bindSessionLifecycle`; verificar con shells reales que, ante cada evento, el hijo vivo muere y el contenido nuevo no hereda sesiones, y que una navegación dentro del mismo documento no cierra nada

## 5. Flujo de datos

- [ ] 5.1 Agrupar la salida del PTY en lotes (~8 ms o 64 KB) conservando el orden; verificar con un test que 10 000 fragmentos llegan íntegros y en orden
- [ ] 5.2 Implementar el control de flujo por confirmaciones con umbrales de 1 MB y 256 KB sobre un PTY simulado; contando en unidades de longitud de la cadena; validar cada confirmación (entero positivo, no mayor que lo pendiente); verificar que pausa al superar el umbral alto, reanuda bajo el bajo, que los pendientes nunca superan el tope y que una confirmación inválida se rechaza sin alterar el contador

## 6. Contrato IPC (`ipc-contract`)

- [ ] 6.1 Ampliar el contrato con eventos del proceso principal (declaración, esquema, suscripción y cancelación en el preload, emisión solo hacia la ventana propia, y entrega a la interfaz solo del contenido validado, nunca del objeto `event` de Electron); verificar con tests de los escenarios de evento declarado, cancelación, evento no declarado, contenido ajeno y ausencia de objetos internos
- [ ] 6.2 Declarar los canales `terminal:listShells`, `terminal:create`, `terminal:write`, `terminal:resize`, `terminal:ack`, `terminal:close` y los eventos `terminal:data` y `terminal:exit` con sus esquemas y límites (16 sesiones, dimensiones y 64 KB por escritura); ampliar `IpcError.code` y su validador con los códigos específicos (`session_limit`, `invalid_directory`, `shell_not_found`, `session_not_found`, `payload_too_large`) y sus textos es/en; verificar que un mensaje inválido por canal se rechaza, que un código no declarado se descarta y que un cambio incompatible rompe `npm run typecheck`
- [ ] 6.3 Instanciar el `SessionManager` en main con `node-pty` y el control de procesos reales, enlazar `bindSessionLifecycle` a la ventana principal y cerrar todas las sesiones al salir (`before-quit` y `closeAll`); verificar con el e2e de la aplicación real que recargar la interfaz con un hijo vivo no deja ningún proceso, que la interfaz nueva no hereda sesiones y que cerrar la aplicación no deja ningún shell ni hijo

## 7. Vista del terminal (`terminal-view`)

- [ ] 7.1 Crear el componente de terminal con xterm, ajuste al contenedor, historial de 10 000 líneas y WebGL con manejador de pérdida de contexto; verificar con el humo que fuerza la pérdida de contexto y comprueba que el contenido sigue visible
- [ ] 7.2 Garantizar el manejo de UTF-8 y caracteres anchos; verificar en el e2e que "áéíóú ñ ¿¡" se muestra íntegro
- [ ] 7.3 Implementar copiar con `Ctrl+Shift+C`, pegar con `Ctrl+Shift+V` y paso de `Ctrl+C` al shell; verificar con los tres escenarios de la spec
- [ ] 7.4 Textos de la vista (sesión terminada, acciones) en los catálogos es/en; verificar que el test de paridad de catálogos sigue en verde y que el aviso aparece en español con ese idioma activo

## 8. Pestañas

- [ ] 8.1 Implementar pestañas con una instancia de xterm viva por pestaña y los atajos `Ctrl+Shift+T`, `Ctrl+Shift+W`, `Ctrl+RePág` y `Ctrl+AvPág`; verificar con el e2e los escenarios de nueva pestaña, aislamiento y cierre
- [ ] 8.2 Abrir una sesión nueva al cerrar la última pestaña y mostrar el estado "sesión terminada" con acción de reinicio; verificar con el e2e ambos escenarios

## 9. Seguridad de la salida (`terminal-output-safety`)

- [ ] 9.1 Descartar OSC 52 (lectura y escritura) y no responder a peticiones de informe de título; verificar con `@xterm/headless` y el portapapeles simulado que no cambia ni se escribe respuesta alguna
- [ ] 9.2 Sanear títulos (sin caracteres de control, 100 caracteres, solo en la etiqueta de la pestaña); verificar con un test del caso con control y longitud excesiva
- [ ] 9.3 Detectar enlaces y abrir solo con `Ctrl+clic`, solo `http`/`https`, con confirmación mostrando el destino real en OSC 8 engañosos; mostrando un aviso localizado cuando la apertura externa rechaza el enlace; verificar con tests de los cinco escenarios de enlaces
- [ ] 9.4 Implementar el pegado entre marcadores eliminando la secuencia de cierre incrustada, y sin marcadores si el programa no los activó; verificar con tests de ambos escenarios

## 10. Pruebas de integración con la aplicación real

- [ ] 10.1 Escribir el e2e que abre una sesión, ejecuta un comando fijo inocuo con acentos, redimensiona y cierra, en un directorio temporal; verificar que pasa en Windows en local
- [ ] 10.2 Añadir el test de salida masiva (100 000 líneas) con tope de 5 segundos y entrada aceptada durante el volcado; verificar el tiempo medido en esta máquina (tope de 5 s en local) y anotar el resultado; en CI registrar el tiempo con un tope holgado para que la medición no cause fallos intermitentes
- [ ] 10.3 Ejecutar todo el e2e en la matriz de CI; verificar que queda verde en Windows y Ubuntu, incluido el test de cierre sin huérfanos

## 11. Documentación

- [ ] 11.1 Documentar en el `README.md` los atajos, los shells soportados, el modelo de seguridad de la salida y el requisito de toolchain C++ en Linux, en español; verificar ejecutando los comandos documentados en una carpeta limpia

## Workflow follow-up

- `bootstrap-app-shell` ya está archivado (2026-11-24); este change amplía sus specs principales.
- Revisado con Fredo (revisión del 2026-11-24 incorporada); no se implementa nada hasta mergear su PR de revisión.
- Entregar en PRs de menos de 500 líneas, en este orden: menú y dependencias (1-2), shells y sesiones (3-4), flujo (5), contrato (6), vista y pestañas (7-8), seguridad de la salida (9), e2e y documentación (10-11).
- Archivar cuando el CI esté verde en Windows y Ubuntu.

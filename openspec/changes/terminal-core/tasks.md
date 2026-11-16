# Tasks

## 1. Dependencias y toolchain

- [ ] 1.1 Añadir `node-pty`, `@xterm/xterm`, addons de ajuste, WebGL y Unicode, y `@xterm/headless` (dev) con versiones exactas; verificar que `npm ci` en Windows instala `node-pty` desde su prebuild y que `npm run typecheck` pasa
- [ ] 1.2 Aprobar el script de instalación de `node-pty` con `npm install-scripts approve node-pty`; verificar que un `npm ci` en carpeta limpia deja el módulo nativo utilizable
- [ ] 1.3 Instalar `build-essential` y `python3` en el job de Ubuntu del CI; verificar que `npm ci` compila `node-pty` y el job queda verde

## 2. Resolución de shells (`terminal-session`)

- [ ] 2.1 Implementar `resolveShells(env, fs, platform)` con las reglas de Windows y Linux; verificar con tests Vitest de los cuatro escenarios (pwsh, sin pwsh, `$SHELL` válido, `$SHELL` inválido)
- [ ] 2.2 Implementar la elección acotada por identificador y el rechazo de rutas arbitrarias; verificar con un test que una ruta no detectada no ejecuta ningún proceso

## 3. Gestor de sesiones

- [ ] 3.1 Implementar `SessionManager` (crear, escribir, redimensionar, cerrar) con directorio inicial, validación de directorio existente y límites de dimensiones y de 16 sesiones; verificar con tests de los escenarios de dimensiones fuera de rango, directorio inexistente y límite alcanzado
- [ ] 3.2 Construir el entorno del hijo (`TERM`, `COLORTERM`, sin variables internas); verificar con un test que un shell real imprime `TERM=xterm-256color` y no tiene `ELECTRON_RUN_AS_NODE`
- [ ] 3.3 Notificar el fin de sesión con su código de salida y liberar recursos; verificar con shells reales que terminan con código 0 y con código distinto de 0
- [ ] 3.4 Cerrar sin huérfanos con cierre escalonado (cortés, espera, forzado) y cierre de todas las sesiones al salir; verificar con un test real por plataforma que un proceso hijo de larga duración deja de existir tras cerrar

## 4. Flujo de datos

- [ ] 4.1 Agrupar la salida del PTY en lotes (~8 ms o 64 KB) conservando el orden; verificar con un test que 10 000 fragmentos llegan íntegros y en orden
- [ ] 4.2 Implementar el control de flujo por confirmaciones con umbrales de 1 MB y 256 KB sobre un PTY simulado; verificar que pausa al superar el umbral alto, reanuda bajo el bajo y que los bytes pendientes nunca superan el tope

## 5. Contrato IPC (`ipc-contract`)

- [ ] 5.1 Ampliar el contrato con eventos del proceso principal (declaración, esquema, suscripción y cancelación en el preload, emisión solo hacia la ventana propia); verificar con tests de los escenarios de evento declarado, cancelación, evento no declarado y contenido ajeno
- [ ] 5.2 Declarar los canales `terminal:listShells`, `terminal:create`, `terminal:write`, `terminal:resize`, `terminal:ack`, `terminal:close` y los eventos `terminal:data` y `terminal:exit` con sus esquemas y límites; verificar que un mensaje inválido por canal se rechaza y que un cambio incompatible rompe `npm run typecheck`

## 6. Vista del terminal (`terminal-view`)

- [ ] 6.1 Crear el componente de terminal con xterm, ajuste al contenedor, historial de 10 000 líneas y WebGL con manejador de pérdida de contexto; verificar con el humo que fuerza la pérdida de contexto y comprueba que el contenido sigue visible
- [ ] 6.2 Garantizar el manejo de UTF-8 y caracteres anchos; verificar en el e2e que "áéíóú ñ ¿¡" se muestra íntegro
- [ ] 6.3 Implementar copiar con `Ctrl+Shift+C`, pegar con `Ctrl+Shift+V` y paso de `Ctrl+C` al shell; verificar con los tres escenarios de la spec
- [ ] 6.4 Textos de la vista (sesión terminada, acciones) en los catálogos es/en; verificar que el test de paridad de catálogos sigue en verde y que el aviso aparece en español con ese idioma activo

## 7. Pestañas

- [ ] 7.1 Implementar pestañas con una instancia de xterm viva por pestaña y los atajos `Ctrl+Shift+T`, `Ctrl+Shift+W`, `Ctrl+RePág` y `Ctrl+AvPág`; verificar con el e2e los escenarios de nueva pestaña, aislamiento y cierre
- [ ] 7.2 Abrir una sesión nueva al cerrar la última pestaña y mostrar el estado "sesión terminada" con acción de reinicio; verificar con el e2e ambos escenarios

## 8. Seguridad de la salida (`terminal-output-safety`)

- [ ] 8.1 Descartar OSC 52 (lectura y escritura) y no responder a peticiones de informe de título; verificar con `@xterm/headless` y el portapapeles simulado que no cambia ni se escribe respuesta alguna
- [ ] 8.2 Sanear títulos (sin caracteres de control, 100 caracteres, solo en la etiqueta de la pestaña); verificar con un test del caso con control y longitud excesiva
- [ ] 8.3 Detectar enlaces y abrir solo con `Ctrl+clic`, solo `http`/`https`, con confirmación mostrando el destino real en OSC 8 engañosos; verificar con tests de los cuatro escenarios de enlaces
- [ ] 8.4 Implementar el pegado entre marcadores eliminando la secuencia de cierre incrustada, y sin marcadores si el programa no los activó; verificar con tests de ambos escenarios

## 9. Pruebas de integración con la aplicación real

- [ ] 9.1 Escribir el e2e que abre una sesión, ejecuta un comando fijo inocuo con acentos, redimensiona y cierra, en un directorio temporal; verificar que pasa en Windows en local
- [ ] 9.2 Añadir el test de salida masiva (100 000 líneas) con tope de 5 segundos y entrada aceptada durante el volcado; verificar el tiempo medido en esta máquina y anotar el resultado
- [ ] 9.3 Ejecutar todo el e2e en la matriz de CI; verificar que queda verde en Windows y Ubuntu, incluido el test de cierre sin huérfanos

## 10. Documentación

- [ ] 10.1 Documentar en el `README.md` los atajos, los shells soportados, el modelo de seguridad de la salida y el requisito de toolchain C++ en Linux, en español; verificar ejecutando los comandos documentados en una carpeta limpia

## Workflow follow-up

- Implementar solo después de archivar `bootstrap-app-shell`.
- Revisar el change con Fredo antes de implementar.
- Archivar cuando el CI esté verde en Windows y Ubuntu.

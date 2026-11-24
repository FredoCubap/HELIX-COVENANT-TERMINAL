# HELIX COVENANT TERMINAL

Terminal de escritorio con interfaz de ciencia ficción, inspirada en [eDEX-UI](https://github.com/GitSquared/edex-ui) (abandonado desde 2021), con tecnologías actuales.

## Stack previsto

- Electron (`contextIsolation: true`, preload con IPC tipado)
- React + Vite + TypeScript
- `@xterm/xterm` + addon WebGL
- `node-pty` y `systeminformation`
- Objetivo: Windows y cualquier Linux (AppImage, deb, rpm)

## Estado

El esqueleto Electron/React está implementado. La ventana principal usa aislamiento de contexto y sandbox; la comunicación con main pasa por un contrato IPC validado. La base de localización en español e inglés está implementada; la terminal y los temas siguen pendientes.

## Desarrollo y verificación

Requiere Node.js `>=22.12.0` y npm. La instalación descarga el binario de Electron:

```bash
npm ci
npm run dev
```

`npm run dev` inicia la aplicación en desarrollo. Para detenerla, cierra la ventana o pulsa `Ctrl+C` en la terminal.

Ejecuta las comprobaciones y la compilación con:

```bash
npm run lint
npm run typecheck
npm test
npm run test:smoke
npm run build
```

`npm run test:smoke` compila y abre la aplicación real con un directorio temporal de usuario. Los tests no abren shells ni ejecutan comandos del usuario o tomados de su entorno; el humo solo inicia y cierra la aplicación de prueba y comprueba que la navegación externa no salga de ella.

El proyecto sigue SemVer: permanece en `0.x` hasta estabilizar el MVP y llegará a `1.0.0` al hacerlo. Las dependencias se fijan en versiones exactas.

## Referencias

Material de estudio en `Repos de referencia/` (no versionado). Ver el README de esa carpeta.

## Licencia

Apache-2.0. Ver [LICENSE](LICENSE). Las redistribuciones deben conservar [NOTICE](NOTICE) con la atribución a FredoCubap.

## Contribuir

Ver [`CONTRIBUTING.md`](CONTRIBUTING.md): ramas, commits, PRs y versionado.

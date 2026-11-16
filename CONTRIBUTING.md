# Cómo contribuir

Flujo corto y sin ceremonias:

```
Change de OpenSpec (o issue) → rama desde main → commits → PR a main → review → merge
```

---

## 1. Referencia obligatoria

Todo cambio parte de **una** de estas dos fuentes, y el PR la cita siempre:

- **Un change de OpenSpec** (`openspec/changes/<nombre>/`). Es la vía normal: los specs, el diseño y las tareas ya están escritos y revisados antes de tocar código.
- **Un issue de GitHub**, cuando no hay change: hotfix, CI, infraestructura, ideas o errores.

No se acepta ningún PR sin una de las dos referencias.

### Antes de crear la rama, planifica

Haz un esbozo de cinco minutos: nombre de la rama, commits previstos y si el trabajo cabe en [500 líneas](#tamaño-un-pr-debe-no-superar-500-líneas-cambiadas). Si no cabe, decide ya cómo dividirlo en varios PRs, no al final. Un change grande se reparte por grupos de `tasks.md`.

---

## 2. Ramas

```
<prefijo>/<ref>-descripcion-breve
```

| Origen | `<ref>` | Ejemplo |
|---|---|---|
| Change de OpenSpec | nombre del change; si se divide en varios PRs, se añade la parte | `feat/bootstrap-app-shell`, `feat/terminal-core-flujo-de-datos` |
| Issue de GitHub | `gh-` + número del issue | `fix/gh-12-glow-pierde-contexto` |

- Se crea desde `main` actualizado. Una rama por change (o por parte de un change) o por issue.
- Prefijo: el mismo que el del cambio principal (ver [prefijos](#prefijos)).
- Todo en minúsculas, kebab-case y **ASCII**: sin tildes, sin `ñ` y sin espacios.
- Sin guion final.
  - Mal: `feat/BootstrapAppShell`, `fix-12-arreglar-glow`, `feat/terminal-core-`, `feat/añadir-pestañas`
  - Bien: `feat/terminal-core`, `fix/gh-12-glow`
- La rama se borra al mergear el PR.

### Conflictos con `main`

Tu rama es tuya, así que la mantienes al día con **rebase**, no con merge. Así el PR solo contiene tus commits, sin merges de `main` por medio.

```bash
git fetch origin
git rebase origin/main
# en cada conflicto: edita los ficheros, git add <ficheros> y git rebase --continue
git push --force-with-lease
```

- Si te lías a mitad de un rebase, `git rebase --abort` te devuelve al punto de partida.
- Usa siempre `--force-with-lease`, nunca `--force`: se niega a pisar commits que no tienes en local.
- Haz el rebase antes de pedir review. Si lo haces después, avísalo en el PR, porque los hashes cambian.
- Nunca hagas rebase ni push forzado de `main`, ni de la rama de otra persona.

---

## 3. Commits

### Atómicos y en orden

- **Un commit, un cambio lógico.** No mezcles en el mismo commit un refactor, un fix y una funcionalidad.
- **Orden:** primero la preparación (refactors y cambios de estructura), después la funcionalidad y al final los tests o docs, si van aparte.

### Título

```
<prefijo>: <descripcion>
```

- Verbo en tercera persona singular del presente: *agrega*, *corrige*, *elimina*. Nunca en infinitivo (*agregar*) ni en participio (*adicionado*).
- Minúscula tras los dos puntos y sin punto final.
- Se permiten tildes y `ñ`.
- Sin paréntesis. Si hace falta aclarar algo, va en el body.
- Máximo 72 caracteres.
- No se referencia el change ni el issue: esa referencia ya está en la rama y en el PR.
- Prohibidos los títulos vacíos de contenido: `Update X.tsx`, `correcciones`, `cambios`, `wip`.

### Autoría de agentes

Los commits escritos por un agente de IA llevan al final su trailer `Co-Authored-By: <agente>`. Los commits de una persona no llevan ninguno.

### Prefijos

| Prefijo | Uso |
|---|---|
| `feat` | Funcionalidad nueva o cambio visible para el usuario |
| `fix` | Corrección de un error |
| `refactor` | Cambio interno sin cambio de comportamiento |
| `test` | Solo tests |
| `docs` | Solo documentación (incluye los specs de OpenSpec) |
| `chore` | Dependencias, configuración, tooling |
| `ci` | Workflows de GitHub Actions y scripts de CI |

### Body

**Obligatorio si el cambio no es trivial.** Explica el **porqué** (el qué ya lo cuenta el diff). Va separado del título por una línea en blanco y con líneas de 72 caracteres como máximo.

```
fix: recupera el terminal cuando se pierde el contexto WebGL

Al suspender el equipo la GPU invalida el contexto y la vista quedaba
en negro aunque la sesión seguía viva. Se descarta el addon y se
continúa con el dibujado alternativo sin perder el buffer.
```

```
fix: corrige typo en la etiqueta del botón de reinicio
```

---

## 4. Pull Requests

### Título

```
<Verbo en 3ª persona> <descripcion funcional>, rel <ref>
```

- Mayúscula inicial, sin prefijo `feat:`/`fix:` y sin paréntesis.
- `<ref>` sigue el mismo formato que en la rama: `rel bootstrap-app-shell` (change) o `rel gh-12` (issue).

```
Agrega la ventana principal aislada del sistema, rel bootstrap-app-shell
Recupera el terminal tras perder el contexto WebGL, rel gh-12
```

### Descripción

La plantilla [`.github/pull_request_template.md`](.github/pull_request_template.md) se carga sola al abrir el PR. Hay que rellenar todas sus secciones. En **Referencia** pon el nombre del change (con enlace a su carpeta) o `Closes #12`, que cierra el issue al mergear.

### Tamaño: un PR **debe** no superar 500 líneas cambiadas

Es una guía, no un bloqueo: un PR más grande no se rechaza por eso, pero sí tiene que estar justificado. Un PR pequeño se revisa antes y mejor.

- Se cuentan las líneas añadidas más las eliminadas.
- **No cuentan** los lockfiles y archivos generados, los tests, los catálogos de traducción (`locales/`) ni `openspec/`.
- Si vas a superar el límite, divide el trabajo: refactor previo en un PR aparte, o un change por grupos de tareas.
- Si dividirlo no tiene sentido, explica el motivo en la sección **Tamaño** del PR.

Para medirlo:

```bash
git diff --shortstat origin/main...HEAD -- . \
  ':(exclude,glob)**/package-lock.json' ':(exclude,glob)**/*.test.ts' \
  ':(exclude,glob)tests/**' ':(exclude,glob)e2e/**' \
  ':(exclude,glob)**/locales/**' ':(exclude,glob)openspec/**'
```

### Antes de pedir review

- `npm run ci` pasa en local (lint, tipos, tests, build y test de humo). Disponible desde el change `bootstrap-app-shell`.
- Lo has probado en local, abriendo la aplicación si el cambio es visible.
- Los pasos de `tasks.md` que cubre el PR están marcados solo si su verificación se ejecutó.

### Review y merge

- Nadie mergea su propio PR, y **ningún agente de IA mergea**: lo hace quien administra el repositorio (**FredoCubap**) tras revisar.
- Las correcciones pedidas en la review se suben como commits nuevos en la misma rama.
- Si `main` avanza y aparecen conflictos, el autor rebasea su rama y lo avisa en el PR (ver [Conflictos con `main`](#conflictos-con-main)).
- El merge se hace con **merge commit**. Por eso cada commit de la rama tiene que cumplir las reglas de la sección 3.
- Tras mergear, se borra la rama.
- Al archivar un change (`openspec archive`), se hace en su propio PR, después de mergear la implementación.

---

## 5. `main`

- No se hace push directo: todo entra por PR. Está protegida con una regla del repositorio.
- Los PRs tienen CI automático en Windows y Ubuntu desde que existe el workflow del change `bootstrap-app-shell`.

---

## 6. Versionado y changelog

- **SemVer** (`MAJOR.MINOR.PATCH`). El proyecto está en `0.x` hasta estabilizar el MVP; `1.0.0` al hacerlo. Las versiones se publican como tags `vX.Y.Z`.
- Todo cambio visible para el usuario se anota en [`CHANGELOG.md`](CHANGELOG.md), bajo `[Unreleased]`, siguiendo [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). La línea cita el PR (`#N`).
- Los cambios incompatibles se marcan **BREAKING**.

# Spec Delta

## Purpose

Define el ciclo de vida de las sesiones de shell: cómo se crean, cómo fluyen la entrada y la salida, cómo se redimensionan y cómo se cierran sin dejar procesos huérfanos. Es el núcleo funcional del terminal.

## ADDED Requirements

### Requirement: Shells disponibles
La aplicación SHALL detectar los shells disponibles del sistema y ofrecer solo esos; en Windows SHALL preferir PowerShell 7 si está instalado, si no Windows PowerShell, y también `cmd`; en Linux SHALL usar el shell del usuario (`$SHELL`) si figura en `/etc/shells`, con `bash` y `sh` como respaldo.

#### Scenario: Windows con PowerShell 7
- **WHEN** PowerShell 7 está instalado en Windows
- **THEN** es el shell predeterminado de las sesiones nuevas

#### Scenario: Windows sin PowerShell 7
- **WHEN** PowerShell 7 no está instalado
- **THEN** el shell predeterminado es Windows PowerShell

#### Scenario: Linux con shell del usuario
- **WHEN** `$SHELL` apunta a un shell listado en `/etc/shells`
- **THEN** ese shell es el predeterminado

#### Scenario: Linux con `$SHELL` inválido
- **WHEN** `$SHELL` no está definido o no figura en `/etc/shells`
- **THEN** se usa `bash` si existe y, si no, `sh`

### Requirement: Elección acotada del shell
La interfaz SHALL elegir el shell por un identificador de la lista detectada; el proceso principal SHALL rechazar cualquier identificador que no esté en esa lista y no SHALL ejecutar rutas ni argumentos proporcionados por la interfaz.

#### Scenario: Identificador válido
- **WHEN** la interfaz solicita una sesión con un identificador de shell detectado
- **THEN** se crea la sesión con ese shell

#### Scenario: Ruta arbitraria
- **WHEN** la interfaz solicita una sesión indicando una ruta ejecutable que no corresponde a un shell detectado
- **THEN** la solicitud se rechaza y no se ejecuta ningún proceso

### Requirement: Creación de sesión
Al crear una sesión, la aplicación SHALL iniciar el shell elegido en un pseudoterminal, con el directorio del usuario como directorio inicial salvo que se indique un directorio existente, y con las variables `TERM=xterm-256color` y `COLORTERM=truecolor`. El entorno heredado SHALL excluir las variables internas de la aplicación (`ELECTRON_RUN_AS_NODE` y análogas).

#### Scenario: Sesión por defecto
- **WHEN** el usuario abre una sesión sin indicar directorio
- **THEN** el shell arranca en el directorio personal del usuario

#### Scenario: Directorio indicado inexistente
- **WHEN** se solicita una sesión con un directorio que no existe
- **THEN** la solicitud se rechaza con un error claro y no se crea la sesión

#### Scenario: Entorno limpio
- **WHEN** el shell arranca
- **THEN** su entorno no contiene `ELECTRON_RUN_AS_NODE` ni otras variables de control de la aplicación

### Requirement: Entrada y salida ordenadas
Todo lo que el usuario escriba SHALL llegar al shell en el mismo orden, y toda salida del shell SHALL llegar a la interfaz en orden y sin pérdida.

#### Scenario: Eco de un comando
- **WHEN** el usuario ejecuta un comando que imprime texto con acentos y eñes
- **THEN** la interfaz muestra exactamente ese texto, sin caracteres alterados

### Requirement: Control de flujo
Si la interfaz no puede consumir la salida a la velocidad a la que el shell la produce, la aplicación SHALL pausar la lectura del shell y reanudarla cuando la interfaz se ponga al día, de modo que la memoria usada por datos pendientes tenga un tope.

#### Scenario: Salida masiva
- **WHEN** un comando produce salida continua mucho más rápida de lo que la interfaz dibuja
- **THEN** la aplicación pausa la lectura al superar el umbral alto de datos sin confirmar y la reanuda al bajar del umbral bajo

#### Scenario: Interfaz responsiva
- **WHEN** ocurre una salida masiva
- **THEN** la interfaz sigue respondiendo a la entrada del usuario y la cantidad de datos pendientes nunca supera el tope definido

### Requirement: Redimensionado
Cuando cambie el tamaño visible del terminal, la aplicación SHALL comunicar las nuevas columnas y filas al shell, dentro de los límites de 1 a 500 columnas y de 1 a 200 filas.

#### Scenario: Cambio de tamaño de ventana
- **WHEN** el usuario redimensiona la ventana
- **THEN** el shell recibe las nuevas dimensiones y programas como `less` o `vim` se redibujan al nuevo tamaño

#### Scenario: Dimensiones fuera de rango
- **WHEN** se solicita un redimensionado fuera de los límites
- **THEN** la solicitud se rechaza y las dimensiones actuales no cambian

### Requirement: Fin de sesión
Cuando el shell termine por sí mismo, la aplicación SHALL notificar a la interfaz su código de salida y SHALL liberar los recursos de la sesión.

#### Scenario: El usuario escribe `exit`
- **WHEN** el shell termina con código 0
- **THEN** la interfaz recibe el aviso de fin con código 0 y la sesión queda marcada como terminada

#### Scenario: Shell terminado con error
- **WHEN** el shell termina con un código distinto de 0
- **THEN** la interfaz recibe ese código y lo muestra

### Requirement: Cierre sin procesos huérfanos
Al cerrar una sesión, y al cerrar la aplicación, SHALL terminarse el shell y todos sus procesos descendientes.

#### Scenario: Cerrar pestaña con proceso en ejecución
- **WHEN** el usuario cierra una sesión mientras corre un proceso de larga duración lanzado desde el shell
- **THEN** ese proceso deja de existir poco después del cierre

#### Scenario: Cerrar la aplicación
- **WHEN** el usuario cierra la aplicación con varias sesiones abiertas
- **THEN** no queda ningún shell ni proceso descendiente de la aplicación

### Requirement: Límite de sesiones
La aplicación SHALL limitar a 16 el número de sesiones simultáneas.

#### Scenario: Límite alcanzado
- **WHEN** ya hay 16 sesiones abiertas y se solicita otra
- **THEN** se rechaza con un error claro y las sesiones existentes no se ven afectadas

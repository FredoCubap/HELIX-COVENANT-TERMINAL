# Spec Delta

## Purpose

Define el comportamiento base de la aplicación de escritorio: la ventana principal, el aislamiento de la interfaz respecto del sistema operativo, la política de navegación y el ciclo de vida. Es el cimiento de seguridad sobre el que se construye todo lo demás.

## ADDED Requirements

### Requirement: Ventana principal
La aplicación SHALL abrir una única ventana principal titulada "HELIX COVENANT TERMINAL" al iniciar, y SHALL terminar el proceso cuando se cierre la última ventana.

#### Scenario: Arranque normal
- **WHEN** el usuario inicia la aplicación
- **THEN** se muestra una ventana principal con el título "HELIX COVENANT TERMINAL"

#### Scenario: Cierre de la última ventana
- **WHEN** el usuario cierra la ventana principal
- **THEN** el proceso de la aplicación termina por completo en Windows y en Linux

### Requirement: Instancia única
La aplicación SHALL permitir una sola instancia en ejecución por usuario.

#### Scenario: Segundo lanzamiento
- **WHEN** el usuario lanza la aplicación mientras ya hay una instancia abierta
- **THEN** la segunda instancia termina sin abrir ventana y la ventana existente se restaura si estaba minimizada y recibe el foco

### Requirement: Interfaz aislada del sistema
La interfaz SHALL ejecutarse sin acceso directo a las APIs del sistema operativo ni del entorno de ejecución del proceso principal; su única superficie de acceso SHALL ser el contrato definido en `ipc-contract`.

#### Scenario: Sin acceso a módulos del sistema
- **WHEN** código en la interfaz intenta usar `require`, `process` o cualquier módulo del sistema de archivos o de procesos
- **THEN** esos símbolos no están disponibles y el intento falla

#### Scenario: Sin acceso remoto al proceso principal
- **WHEN** la interfaz intenta obtener una referencia directa a objetos del proceso principal
- **THEN** no existe ningún mecanismo que se lo permita

### Requirement: Origen de la interfaz verificado
La aplicación SHALL cargar en desarrollo únicamente un origen HTTP de loopback y en producción únicamente el archivo renderer empaquetado. SHALL rechazar navegación, redirecciones y mensajes IPC provenientes de cualquier otro origen.

#### Scenario: URL de desarrollo externa
- **WHEN** `ELECTRON_RENDERER_URL` apunta a un origen que no es HTTP loopback
- **THEN** la aplicación ignora esa URL y carga el renderer empaquetado

#### Scenario: Navegación o redirección externa
- **WHEN** el contenido intenta navegar o redirigir a un origen distinto del suyo
- **THEN** la navegación se cancela y no se abre un navegador externo

### Requirement: Política de contenido restrictiva
La interfaz SHALL cargar únicamente recursos propios de la aplicación; no SHALL ejecutar scripts remotos ni scripts incrustados en línea.

#### Scenario: Script remoto bloqueado
- **WHEN** el contenido de la interfaz intenta cargar un script desde un origen externo
- **THEN** el navegador lo bloquea y la aplicación sigue funcionando

#### Scenario: Script en línea bloqueado
- **WHEN** el contenido de la interfaz intenta ejecutar un script incrustado en línea
- **THEN** la política de contenido lo bloquea

### Requirement: Navegación bloqueada
La ventana SHALL permanecer siempre en el contenido propio de la aplicación; no SHALL navegar a otra URL ni abrir ventanas adicionales por iniciativa del contenido.

#### Scenario: Intento de navegar fuera
- **WHEN** el contenido intenta navegar la ventana a una URL externa
- **THEN** la navegación se cancela y la ventana conserva el contenido propio

#### Scenario: Intento de abrir una ventana nueva
- **WHEN** el contenido intenta abrir una ventana nueva
- **THEN** no se abre ninguna ventana dentro de la aplicación

### Requirement: Enlaces externos validados
La aplicación SHALL abrir en el navegador del sistema únicamente URLs con esquema `http` o `https` mediante el método explícito del contrato IPC, y SHALL ignorar cualquier otro esquema. La navegación y las redirecciones no SHALL abrir URLs externas automáticamente.

#### Scenario: Enlace https
- **WHEN** el usuario activa un enlace `https://example.com`
- **THEN** la URL se abre en el navegador predeterminado del sistema

#### Scenario: Esquema no permitido
- **WHEN** se solicita abrir una URL con esquema `file:`, `javascript:` u otro distinto de `http`/`https`
- **THEN** la solicitud se ignora y no se abre nada

### Requirement: Permisos de dispositivo denegados
La aplicación SHALL denegar por defecto toda solicitud de permisos de dispositivo hecha por la interfaz (cámara, micrófono, geolocalización, notificaciones y similares).

#### Scenario: Solicitud de cámara
- **WHEN** el contenido solicita acceso a la cámara
- **THEN** la solicitud se deniega sin mostrar diálogo al usuario

### Requirement: Pantalla completa
El usuario SHALL poder alternar el modo de pantalla completa con la tecla F11.

#### Scenario: Alternar pantalla completa
- **WHEN** el usuario pulsa F11 con la ventana enfocada
- **THEN** la ventana entra en pantalla completa, y al pulsar F11 otra vez vuelve al estado anterior

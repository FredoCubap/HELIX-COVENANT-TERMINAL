# Spec Delta

## Purpose

Establece el contrato único de comunicación entre la interfaz y el proceso principal: qué canales existen, cómo se validan los mensajes y qué ocurre con todo lo que quede fuera. Evita que la interfaz, cuya salida no es confiable, llegue a ejecutar acciones no previstas.

## ADDED Requirements

### Requirement: Canales explícitos
La interfaz SHALL poder comunicarse con el proceso principal únicamente a través de los canales declarados en el contrato; no SHALL existir un mecanismo genérico para enviar mensajes a canales arbitrarios.

#### Scenario: Canal declarado
- **WHEN** la interfaz invoca un canal que figura en el contrato con un mensaje válido
- **THEN** el proceso principal lo atiende y devuelve su resultado

#### Scenario: Canal desconocido
- **WHEN** la interfaz intenta invocar un canal que no figura en el contrato
- **THEN** la invocación se rechaza con un error y no se ejecuta ninguna acción

### Requirement: Validación de mensajes
El proceso principal SHALL validar cada mensaje recibido contra el esquema de su canal antes de actuar, y SHALL rechazar los que no lo cumplan.

#### Scenario: Mensaje con forma inválida
- **WHEN** la interfaz envía a un canal declarado un mensaje cuyos campos no cumplen el esquema
- **THEN** el mensaje se rechaza con un error de validación y la acción no se ejecuta

#### Scenario: Error sin filtración interna
- **WHEN** un mensaje es rechazado o la acción falla
- **THEN** el error devuelto a la interfaz no incluye rutas del sistema ni trazas internas

### Requirement: Origen del emisor
El proceso principal SHALL aceptar mensajes únicamente de la ventana principal y de su contenido propio; SHALL rechazar los provenientes de submarcos, otras ventanas u otros orígenes.

#### Scenario: Mensaje de origen no confiable
- **WHEN** llega un mensaje desde un contenido que no es el de la ventana principal propia
- **THEN** el mensaje se rechaza y no se ejecuta ninguna acción

### Requirement: Información de la aplicación
La interfaz SHALL poder consultar la versión de la aplicación y la plataforma en la que se ejecuta mediante un canal del contrato.

#### Scenario: Consulta de información
- **WHEN** la interfaz invoca el canal de información de la aplicación
- **THEN** recibe la versión (formato SemVer) y la plataforma (`win32` o `linux`)

### Requirement: Contrato tipado de extremo a extremo
El contrato SHALL estar definido una sola vez y compartido entre proceso principal e interfaz, de modo que un canal, su mensaje o su respuesta incompatibles produzcan un error de compilación.

#### Scenario: Cambio incompatible
- **WHEN** se modifica la forma de un mensaje en el contrato sin actualizar a quien lo usa
- **THEN** la comprobación de tipos del proyecto falla

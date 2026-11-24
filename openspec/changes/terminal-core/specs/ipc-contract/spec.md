# Spec Delta

## ADDED Requirements

### Requirement: Eventos del proceso principal
El contrato SHALL poder declarar eventos emitidos por el proceso principal hacia la interfaz; la interfaz SHALL poder suscribirse a un evento declarado y cancelar su suscripción, y SHALL recibir únicamente eventos declarados cuyo contenido cumpla su esquema.

#### Scenario: Suscripción a un evento declarado
- **WHEN** la interfaz se suscribe a un evento declarado y el proceso principal lo emite
- **THEN** la interfaz recibe el contenido validado

#### Scenario: Cancelar la suscripción
- **WHEN** la interfaz cancela su suscripción a un evento
- **THEN** no recibe más emisiones de ese evento y no quedan referencias retenidas

#### Scenario: Sin objetos internos
- **WHEN** la interfaz recibe un evento
- **THEN** su receptor obtiene únicamente el contenido validado y nunca el objeto de evento de Electron ni referencias al emisor

#### Scenario: Evento no declarado
- **WHEN** la interfaz intenta suscribirse a un evento que no figura en el contrato
- **THEN** la suscripción se rechaza y no se registra ningún receptor

### Requirement: Eventos solo hacia la ventana propia
El proceso principal SHALL emitir eventos únicamente hacia la ventana principal y su contenido propio.

#### Scenario: Contenido ajeno
- **WHEN** existe un contenido que no es el de la ventana principal propia
- **THEN** ese contenido no recibe ningún evento de la aplicación

### Requirement: Errores específicos
El contrato SHALL declarar códigos de error específicos para los fallos esperados de las sesiones (límite alcanzado, directorio inválido, shell no detectado, sesión inexistente, escritura demasiado grande), SHALL validarlos como el resto de errores y SHALL asociar a cada uno un texto localizado.

#### Scenario: Código declarado
- **WHEN** el proceso principal rechaza una solicitud por uno de esos motivos
- **THEN** la interfaz recibe el código específico y un mensaje localizado, sin rutas ni detalles internos

#### Scenario: Código no declarado
- **WHEN** una respuesta de error trae un código que el contrato no declara
- **THEN** la respuesta se descarta por no cumplir el contrato

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

#### Scenario: Evento no declarado
- **WHEN** la interfaz intenta suscribirse a un evento que no figura en el contrato
- **THEN** la suscripción se rechaza y no se registra ningún receptor

### Requirement: Eventos solo hacia la ventana propia
El proceso principal SHALL emitir eventos únicamente hacia la ventana principal y su contenido propio.

#### Scenario: Contenido ajeno
- **WHEN** existe un contenido que no es el de la ventana principal propia
- **THEN** ese contenido no recibe ningún evento de la aplicación

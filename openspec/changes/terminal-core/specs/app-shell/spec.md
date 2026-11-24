# Spec Delta

## ADDED Requirements

### Requirement: Sin menú de aplicación
La aplicación SHALL no mostrar el menú de aplicación por defecto de Electron, y sus atajos asociados (recargar la interfaz, cerrar la ventana, abrir las herramientas de desarrollo) SHALL no estar disponibles en la aplicación, de modo que todas las teclas lleguen a la interfaz y al shell.

#### Scenario: Recarga por teclado
- **WHEN** el usuario pulsa `Ctrl+R`
- **THEN** la interfaz no se recarga y su estado se conserva

#### Scenario: Cierre de ventana por teclado
- **WHEN** el usuario pulsa `Ctrl+W`
- **THEN** la ventana no se cierra y la tecla llega a la interfaz

#### Scenario: Herramientas de desarrollo
- **WHEN** el usuario pulsa `Ctrl+Shift+I`
- **THEN** no se abren las herramientas de desarrollo

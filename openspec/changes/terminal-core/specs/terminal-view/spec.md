# Spec Delta

## Purpose

Define cómo se presenta y se maneja el terminal en pantalla: dibujado, desplazamiento, selección, copiar y pegar, y manejo de varias sesiones en pestañas con atajos propios. Es lo que el usuario ve y toca.

## ADDED Requirements

### Requirement: Dibujado acelerado con respaldo
La vista SHALL dibujar el terminal con aceleración por GPU y, si el contexto gráfico se pierde, SHALL continuar con un dibujado alternativo sin perder el contenido del buffer.

#### Scenario: Pérdida del contexto gráfico
- **WHEN** el contexto gráfico de la aceleración se pierde con una sesión activa
- **THEN** la vista sigue mostrando el mismo contenido con el dibujado alternativo y la sesión no se interrumpe

### Requirement: Rendimiento ante salida masiva
La vista SHALL absorber un volcado de 100 000 líneas en menos de 5 segundos en el equipo de referencia sin dejar de responder a la entrada.

#### Scenario: Volcado grande
- **WHEN** un comando imprime 100 000 líneas de texto
- **THEN** la salida termina de dibujarse en menos de 5 segundos y la interfaz sigue aceptando teclas durante el volcado

### Requirement: Desplazamiento
La vista SHALL conservar al menos 10 000 líneas de historial por sesión y permitir recorrerlas con la rueda del ratón y con `Shift+RePág` / `Shift+AvPág`.

#### Scenario: Historial
- **WHEN** una sesión ha impreso más líneas de las que caben en pantalla
- **THEN** el usuario puede desplazarse hacia atrás hasta 10 000 líneas anteriores

### Requirement: Unicode
La vista SHALL mostrar texto UTF-8 correctamente, incluidos caracteres acentuados, eñes y caracteres de ancho doble, ocupando las columnas que corresponden.

#### Scenario: Texto en español
- **WHEN** la salida contiene "áéíóú ñ ¿¡"
- **THEN** cada carácter se muestra íntegro y la alineación de columnas no se rompe

### Requirement: Ajuste al tamaño
La vista SHALL ocupar toda el área disponible de la pestaña y recalcular columnas y filas cuando el área cambie.

#### Scenario: Redimensionar la ventana
- **WHEN** el usuario cambia el tamaño de la ventana
- **THEN** el terminal se reajusta y no queda espacio sin usar ni contenido cortado

### Requirement: Copiar y pegar
La vista SHALL copiar la selección con `Ctrl+Shift+C` y pegar con `Ctrl+Shift+V`; la combinación `Ctrl+C` SHALL llegar siempre al shell como interrupción.

#### Scenario: Copiar selección
- **WHEN** el usuario selecciona texto y pulsa `Ctrl+Shift+C`
- **THEN** el texto seleccionado queda en el portapapeles del sistema

#### Scenario: Pegar
- **WHEN** el usuario pulsa `Ctrl+Shift+V` con texto en el portapapeles
- **THEN** el texto se envía al shell como entrada

#### Scenario: Interrupción
- **WHEN** el usuario pulsa `Ctrl+C` con o sin texto seleccionado
- **THEN** el shell recibe la interrupción y el portapapeles no cambia

### Requirement: Pestañas independientes
La aplicación SHALL permitir varias sesiones simultáneas, cada una en su pestaña, con su propio historial y estado; cambiar de pestaña SHALL conservar el contenido de las demás.

#### Scenario: Nueva pestaña
- **WHEN** el usuario pulsa `Ctrl+Shift+T`
- **THEN** se abre una sesión nueva en una pestaña nueva con el foco en el terminal

#### Scenario: Aislamiento
- **WHEN** el usuario escribe en una pestaña y cambia a otra
- **THEN** la otra pestaña no muestra esa entrada y la primera conserva su contenido al volver

### Requirement: Cierre y navegación de pestañas
El usuario SHALL poder cerrar la pestaña activa con `Ctrl+Shift+W` y moverse entre pestañas con `Ctrl+RePág` y `Ctrl+AvPág`.

#### Scenario: Cerrar pestaña
- **WHEN** el usuario pulsa `Ctrl+Shift+W`
- **THEN** la sesión de esa pestaña se cierra y el foco pasa a una pestaña vecina

#### Scenario: Última pestaña
- **WHEN** el usuario cierra la última pestaña
- **THEN** se abre automáticamente una sesión nueva para no dejar la ventana vacía

### Requirement: Sesión terminada visible
Cuando una sesión termine, la pestaña SHALL indicar que terminó y con qué código, conservando el historial legible, y SHALL ofrecer reiniciar la sesión.

#### Scenario: Shell terminado
- **WHEN** el shell de una pestaña termina
- **THEN** la pestaña muestra "sesión terminada" con el código de salida y una acción para reiniciarla

### Requirement: Textos localizados
Todo texto propio de la vista (pestañas, avisos, acciones) SHALL provenir de los catálogos de `localization`.

#### Scenario: Idioma activo
- **WHEN** el idioma activo es español
- **THEN** el aviso de sesión terminada y las acciones de pestaña aparecen en español

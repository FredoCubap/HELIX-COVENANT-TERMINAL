# Spec Delta

## Purpose

Trata la salida del terminal como no confiable: un programa, un archivo o un servidor remoto pueden imprimir secuencias de escape que intenten leer el portapapeles, falsear títulos o inyectar comandos. Define qué hace la aplicación con ellas.

## ADDED Requirements

### Requirement: Portapapeles por secuencias de escape desactivado
La aplicación SHALL ignorar por defecto las secuencias OSC 52, tanto de lectura como de escritura del portapapeles del sistema.

#### Scenario: Escritura del portapapeles por secuencia
- **WHEN** la salida del shell contiene una secuencia OSC 52 que pide escribir en el portapapeles
- **THEN** el portapapeles del sistema no cambia

#### Scenario: Lectura del portapapeles por secuencia
- **WHEN** la salida del shell contiene una secuencia OSC 52 que pide leer el portapapeles
- **THEN** no se envía ningún contenido del portapapeles al shell

### Requirement: Enlaces
La vista SHALL abrir un enlace del terminal solo con `Ctrl+clic`, solo si su esquema es `http` o `https`, y a través de la apertura externa validada de `app-shell`. Para enlaces OSC 8 cuyo texto visible difiera del destino real, SHALL mostrar el destino y pedir confirmación antes de abrir.

#### Scenario: URL en la salida
- **WHEN** el usuario hace `Ctrl+clic` en una URL `https://` impresa en el terminal
- **THEN** se abre en el navegador del sistema

#### Scenario: Clic sin Ctrl
- **WHEN** el usuario hace clic simple sobre una URL
- **THEN** no se abre nada

#### Scenario: Enlace engañoso
- **WHEN** un enlace OSC 8 muestra el texto "https://banco.example" pero apunta a otro destino
- **THEN** antes de abrir se muestra el destino real y se pide confirmación

#### Scenario: Esquema no permitido
- **WHEN** un enlace del terminal usa un esquema distinto de `http` o `https`
- **THEN** no se abre

### Requirement: Títulos saneados
El título que un programa establezca por secuencia de escape SHALL mostrarse únicamente en la etiqueta de su pestaña, sin caracteres de control y truncado a 100 caracteres; no SHALL cambiar el título de la ventana ni ejecutar nada.

#### Scenario: Título con caracteres de control
- **WHEN** un programa establece un título con caracteres de control y más de 100 caracteres
- **THEN** la pestaña muestra el título sin los caracteres de control y recortado a 100 caracteres

### Requirement: Sin respuestas que filtren información
La aplicación SHALL no responder a peticiones de informe de título de ventana ni de icono hechas por secuencias de escape.

#### Scenario: Petición de título
- **WHEN** la salida contiene una secuencia que solicita al terminal informar su título
- **THEN** no se escribe ninguna respuesta en la entrada del shell

### Requirement: Pegado protegido
Cuando el programa haya activado el pegado entre marcadores (bracketed paste), la aplicación SHALL enmarcar el texto pegado y SHALL eliminar del texto pegado cualquier secuencia que cierre ese marco.

#### Scenario: Pegado con marcador de cierre incrustado
- **WHEN** el texto pegado contiene la secuencia de cierre de pegado seguida de comandos
- **THEN** la secuencia de cierre se elimina del texto y el shell recibe todo el contenido como una única entrada pegada

#### Scenario: Programa sin pegado protegido
- **WHEN** el programa no ha activado el pegado entre marcadores
- **THEN** el texto se envía tal cual, sin marcadores

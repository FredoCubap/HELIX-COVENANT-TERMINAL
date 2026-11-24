# localization Specification

## Purpose
Define los idiomas de la interfaz (español e inglés), cómo se elige el idioma activo y qué ocurre cuando falta un texto. Garantiza que la aplicación sea utilizable en ambos idiomas desde el primer arranque.

## Requirements

### Requirement: Idiomas soportados
La interfaz SHALL estar disponible en español (`es`) y en inglés (`en`).

#### Scenario: Textos en ambos idiomas
- **WHEN** se activa cada uno de los dos idiomas
- **THEN** todos los textos visibles de la interfaz se muestran en ese idioma

### Requirement: Resolución del idioma activo
La aplicación SHALL elegir el idioma activo así: la preferencia explícita del usuario si es válida; si no, el idioma del sistema si es español o inglés; en cualquier otro caso, inglés.

#### Scenario: Sistema en español
- **WHEN** no hay preferencia explícita y el idioma del sistema es `es-MX`, `es-ES` o cualquier variante de español
- **THEN** la interfaz arranca en español

#### Scenario: Sistema en otro idioma
- **WHEN** no hay preferencia explícita y el idioma del sistema es, por ejemplo, alemán
- **THEN** la interfaz arranca en inglés

#### Scenario: Preferencia explícita
- **WHEN** existe una preferencia explícita válida distinta del idioma del sistema
- **THEN** la preferencia explícita prevalece sobre el idioma del sistema

#### Scenario: Preferencia inválida
- **WHEN** la preferencia explícita no es un idioma soportado
- **THEN** se ignora y se aplica la resolución por idioma del sistema

### Requirement: Textos faltantes
Cuando falte un texto en el idioma activo, la interfaz SHALL mostrar el texto en inglés; si tampoco existe en inglés, SHALL mostrar la clave del texto y registrar una advertencia.

#### Scenario: Falta en español
- **WHEN** una clave existe en inglés pero no en español y el idioma activo es español
- **THEN** se muestra el texto en inglés

#### Scenario: Falta en ambos
- **WHEN** una clave no existe en ningún idioma
- **THEN** se muestra la clave literal y se registra una advertencia

### Requirement: Catálogos completos
Todo texto visible SHALL existir en ambos idiomas; la validación del proyecto SHALL fallar si algún idioma tiene claves que el otro no tiene.

#### Scenario: Clave solo en un idioma
- **WHEN** se añade una clave al catálogo en español sin su equivalente en inglés
- **THEN** la comprobación de catálogos del proyecto falla e indica la clave faltante

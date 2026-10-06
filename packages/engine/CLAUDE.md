# packages/engine — reglas del motor de cálculo

- Cero dependencias de ejecución. Sin E/S, sin Date.now(), sin Math.random(), sin estado global mutable.
  Debe funcionar igual en Node y en el navegador.
- Cada método es un MethodDefinition registrado: code, version (semver), kind, population, requiredInputs,
  citation y compute().
- Toda salida usa el mismo sobre: methodCode, methodVersion, engineVersion, inputs, inputsHash, outputs, warnings.
- inputsHash = SHA-256 del JSON canónico (claves ordenadas), con una implementación pura dentro del paquete.
- Unidades con marca de tipo y en los nombres. Sin redondeo interno.
- Validación fisiológica antes de calcular (RN-C04); advertencias con el código de la regla.
- Cambiar una fórmula o una constante = subir la versión del método y la del motor + entrada en CHANGELOG.md.
- Casos dorados G-01 a G-28 (Notion 03) en test/golden; propiedades con fast-check en test/properties.
  Cobertura de 90 % o más.
- Referencia: docs/reference/engine.ts y examples.ts. Al portarlos, ningún número cambia.

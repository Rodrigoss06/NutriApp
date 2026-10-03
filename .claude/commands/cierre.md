---
description: Cierra la sesión dejando el repositorio y STATUS.md al día
---
1. Corre pnpm check. Si algo falla, arréglalo o explica por qué queda pendiente.
2. Actualiza STATUS.md: estado del prompt, en curso, siguiente paso, bloqueos, deuda técnica y una línea en el
   registro de sesiones (deja solo las 5 últimas).
3. Si tomaste decisiones de diseño, agrégalas a DECISIONS.md como ADR nuevos.
4. Si cambió una regla, un requisito, una tabla o una convención, lista lo que habría que llevar a Notion y
   pregunta si corro /notion-sync.
5. Propón el mensaje de commit (Conventional Commits en español, citando RN o RF) y, si corresponde, el título
   y la descripción del PR. No hagas push sin mi confirmación.

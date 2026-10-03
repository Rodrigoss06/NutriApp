---
description: Ejecuta un prompt del plan (P0 a P16) leyéndolo desde Notion
argument-hint: P7
---
Prompt pedido: $ARGUMENTS

1. Con notion-fetch abre la página de prompts que lo contiene (P0 a P8: https://app.notion.com/p/3edc3fa6d4ce81cfa5d8ded9b7c2e483; P9 a P16: https://app.notion.com/p/3edc3fa6d4ce8197aeffd4b8fb5289b3)
   y lee completo el prompt $ARGUMENTS.
2. Lee todas las páginas de Notion que el prompt cita en "Lee primero".
3. Revisa STATUS.md: si alguna dependencia del prompt no está terminada, avísame y detente.
4. Planifica antes de tocar archivos: alcance, archivos a crear o cambiar, migraciones, pruebas (citando RN y RF)
   y riesgos. Espera mi aprobación.
5. Aprobado el plan: marca el prompt 🟨 en STATUS.md, implementa en pasos pequeños con pruebas primero en
   dominio y motor, y corre pnpm check al cerrar cada paso.
6. Marca ✅ solo cuando pasen todos los criterios de aceptación del prompt. Luego sigue /cierre.

# NutriCoach — instrucciones para Claude Code

Plataforma web para nutricionistas y entrenadores: evaluación antropométrica, composición corporal,
energía, dieta, rutinas y seguimiento diario del paciente. Versión 1.0, Paquete B. Plazo: 9 semanas.
Equipo: Rodrigo Sucapuca (arquitectura, backend, motor) e Iván Reaño (interfaz, app del paciente, despliegue).
"NutriCoach" es un nombre de trabajo; la marca final la define el cliente.

## Fuente de verdad: Notion (servidor MCP `notion`)
Antes de diseñar o escribir código, lee con `notion-fetch` las páginas que cita el prompt de la tarea.
Si el código, este archivo o un prompt contradicen Notion, manda Notion: detente y pregunta.
No edites Notion sin aprobación explícita: propón el cambio con /notion-sync y espera.

| Página | URL |
|---|---|
| Proyecto: alcance, cronograma, fuera de alcance | https://app.notion.com/p/3edc3fa6d4ce8169886def0c8ab97379 |
| Documento técnico: stack, decisiones, glosario | https://app.notion.com/p/3edc3fa6d4ce81cc9897c80e573f7ecf |
| 01 Infraestructura y despliegue | https://app.notion.com/p/3edc3fa6d4ce81099503f1a484982a30 |
| 02 Arquitectura | https://app.notion.com/p/3edc3fa6d4ce814099eefb07a1f975a0 |
| 03 Reglas de negocio (RN y casos dorados) | https://app.notion.com/p/3edc3fa6d4ce8168a99ad95dd0df8e78 |
| 04 Requisitos (RF y RNF) | https://app.notion.com/p/3edc3fa6d4ce819ebcb6f71965ed9037 |
| 05 Modelo de datos: convenciones, RLS, particiones, escalamiento | https://app.notion.com/p/3edc3fa6d4ce815b9f36dce97439104d |
| 05.1 DDL: iam, tenancy, clinical, assessment | https://app.notion.com/p/3edc3fa6d4ce81349117c615d05aee7a |
| 05.2 DDL: food, nutrition, exercise, training, tracking | https://app.notion.com/p/3edc3fa6d4ce81cb8baeda0b3d731d80 |
| 05.3 DDL: scheduling, content, documents, platform, audit, analytics | https://app.notion.com/p/3edc3fa6d4ce81459879e7fb2a8906b8 |
| 06 Convenciones | https://app.notion.com/p/3edc3fa6d4ce81c982e7f4e4a47ba6d1 |
| Creación del proyecto: flujo y orden | https://app.notion.com/p/3edc3fa6d4ce81ad931fd04dadc1e513 |
| Prompts P0 a P8 | https://app.notion.com/p/3edc3fa6d4ce81cfa5d8ded9b7c2e483 |
| Prompts P9 a P16 | https://app.notion.com/p/3edc3fa6d4ce8197aeffd4b8fb5289b3 |

## Memoria del repositorio
- `STATUS.md`: dónde estamos. Léelo al empezar (/inicio) y actualízalo al terminar (/cierre).
- `DECISIONS.md`: decisiones de diseño (ADR). Toda decisión nueva se registra ahí.
- `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md` y `packages/engine/CLAUDE.md` tienen reglas propias.
- `docs/reference/`: guía de dominio y motor de referencia (`engine.ts`, `examples.ts`).

## Reglas duras
1. Monolito modular hexagonal. Un módulo solo importa el `index.ts` de otro. `domain/` no importa NestJS,
   Prisma, Zod ni HTTP. `pnpm lint:arch` debe pasar.
2. El motor (`packages/engine`) es puro: sin E/S, sin reloj, sin azar. Todo resultado lleva método, versión,
   versión del motor e insumos con su hash (RN-D01).
3. Nada se recalcula en silencio: resultados, planes, rutinas y fichas publicados son inmutables (RN-D08, RN-E15).
4. Multi-organización: `organization_id` en toda tabla de negocio, RLS activa y forzada (RN-A01).
   Las pruebas de integración corren como `app_user`.
5. Base de datos primero: migraciones en SQL aplicadas con `pnpm db:migrate`; después `pnpm db:pull`.
   Nunca `prisma migrate dev` ni `migrate reset`. Nunca edites una migración que ya llegó a staging.
6. Unidades en los nombres (`weightKg`, `heightCm`, `tricepsMm`). Redondeo solo al presentar (RN-D09).
7. Datos personales: nunca en logs, fixtures, capturas ni commits. Datos de prueba sintéticos. No leas `.env`.
8. Pruebas primero en dominio y motor; cada prueba cita su regla (`RN-C02`). Casos dorados G-01 a G-28 siempre en verde.
9. Código en inglés; interfaz, documentación y commits en español (Conventional Commits).
10. Fuera de alcance (pasarela de pagos, SUNAT, IA en el producto, dispositivos, apps nativas): no se construye.
    Si una tarea lo roza, avísalo antes de seguir.
11. No inventes reglas clínicas: si falta un dato del dominio, pregunta.

## Comandos
- `pnpm dev` · `pnpm check` (lint, arquitectura, tipos, unitarias e integración) · `pnpm test:golden` · `pnpm e2e`
- `pnpm db:up` · `pnpm db:migrate` · `pnpm db:pull` · `pnpm db:seed` · `pnpm seed:load`

## Cómo trabajar
1. /inicio: resume STATUS.md y propone el siguiente paso.
2. /prompt PN: lee el prompt y sus páginas de Notion; plan primero y espera aprobación.
3. Pasos pequeños. `pnpm check` antes de declarar algo terminado.
4. /revision antes del PR; /cierre al final de la sesión; /notion-sync si cambió algo de Notion.
5. Ante una contradicción o un dato que falta: pregunta. Prefiere preguntar a suponer.

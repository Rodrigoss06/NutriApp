# STATUS — NutriCoach v1.0

Actualizado: 2026-10-03 · Por: Rodrigo, con Claude Code
Inicio del proyecto: POR CONFIRMAR (día siguiente al Pago 1) · Semana actual: 0 de 9
Próxima demo: Demo 1 · Base y evaluación · semana 2

## Prompts
| Prompt | Estado | Responsable | PR | Notas |
|---|---|---|---|---|
| P0 Andamiaje | 🟨 | Rodrigo | | Verificado en local; falta CI en verde en el primer PR |
| P1 Motor de cálculo | ⬜ | Rodrigo | | |
| P2 Base de datos y plataforma | ⬜ | Rodrigo | | |
| P3 Sistema de diseño | ⬜ | Iván | | |
| P4 Servidor y staging | ⬜ | Iván | | |
| P5 Identidad y organizaciones | ⬜ | Rodrigo | | |
| P6 Pacientes e historia clínica | ⬜ | Rodrigo | | |
| P7 Evaluación y cálculo, Demo 1 | ⬜ | Rodrigo e Iván | | |
| P8 Datos maestros de alimentos | ⬜ | Rodrigo | | |
| P9 Dieta por intercambios | ⬜ | Rodrigo | | |
| P10 Composición, menú y recetario | ⬜ | Rodrigo | | |
| P11 Fichas PDF, Demo 2 | ⬜ | Iván | | |
| P12 Ejercicios y rutinas | ⬜ | Iván | | |
| P13 App del paciente | ⬜ | Iván | | |
| P14 Analítica y evolución, Demo 3 | ⬜ | Rodrigo e Iván | | |
| P15 Marca, calendario, admin y migración | ⬜ | Iván y Rodrigo | | |
| P16 Producción y entrega, Demo 4 | ⬜ | Iván y Rodrigo | | |

Leyenda: ⬜ pendiente · 🟨 en curso · ✅ terminado · ⛔ bloqueado

## En curso
- P0 · andamiaje del monorepo en la rama `chore/andamiaje-monorepo`: criterios verificados en local;
  falta el primer PR con CI en verde

## Siguiente paso
- Subir `main` y `chore/andamiaje-monorepo` y abrir el PR de P0; con CI en verde, marcar P0 ✅

## Bloqueos y preguntas al cliente
- [ ] N9: límites y precio de los tramos de membresía; qué pasa al superar el límite
- [ ] N22: caducidad del enlace de acceso del paciente
- [ ] N19: confirmar la carga manual de bioimpedancia
- [ ] N13: confirmar regresiones y progresiones en la biblioteca
- [ ] N7: confirmar el estado diario (estrés, sueño, energía)
- [ ] R4: permiso de uso de las listas Dextre y ADA
- [ ] Textos legales revisados por el abogado del cliente
- [ ] docs/reference/ (guía de dominio, engine.ts y examples.ts) no está en el repositorio: P1 lo necesita

## Deuda técnica
- /api/health/ready es provisional: P2 agrega base, migraciones al día, cola activa y partición del mes siguiente
- engine, ui y web corren Vitest con --passWithNoTests hasta tener pruebas (P1 y P3)
- db:migrate, db:pull, db:seed, seed:load y e2e llaman scripts que llegan en P2, P3 y P7
- El worker solo late y `pnpm dev` no lo levanta (`pnpm --filter api dev:worker`): P2 decide al traer el outbox
- TypeScript fijado en 6.0 hasta que typescript-eslint soporte TypeScript 7 (ADR-018)

## Registro de sesiones (solo las 5 últimas)
- 2026-10-03 · P0 · monorepo pnpm y Turborepo, configuración compartida, reglas de arquitectura con su prueba,
  shared-kernel, API NestJS con salud y worker, web con cuatro grupos, compose local, CI y README; ADR-017 a
  ADR-021 · falta el primer PR con CI en verde

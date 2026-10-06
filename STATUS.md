# STATUS — NutriCoach v1.0

Actualizado: 2026-10-06 · Por: Rodrigo, con Claude Code
Inicio del proyecto: POR CONFIRMAR (día siguiente al Pago 1) · Semana actual: 0 de 9
Próxima demo: Demo 1 · Base y evaluación · semana 2

## Prompts
| Prompt | Estado | Responsable | PR | Notas |
|---|---|---|---|---|
| P0 Andamiaje | ✅ | Rodrigo | #1 | CI en verde; pendiente /notion-sync |
| P1 Motor de cálculo | ✅ | Rodrigo | #2 | G-01 a G-28 en verde; pendiente /notion-sync |
| P2 Base de datos y plataforma | ✅ | Rodrigo | | 61 pruebas de integración; falta PR y /notion-sync |
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
- P2 terminado en `feat/db-plataforma`: falta subirla, abrir el PR y aplicar /notion-sync

## Siguiente paso
- PR de P2 con CI en verde (tres jobs); /notion-sync de P0, P1 y P2; luego P3

## Bloqueos y preguntas al cliente
- [ ] N9: límites y precio de los tramos de membresía; qué pasa al superar el límite
- [ ] N22: caducidad del enlace de acceso del paciente
- [ ] N19: confirmar la carga manual de bioimpedancia
- [ ] N13: confirmar regresiones y progresiones en la biblioteca
- [ ] N7: confirmar el estado diario (estrés, sueño, energía)
- [ ] R4: permiso de uso de las listas Dextre y ADA
- [ ] Textos legales revisados por el abogado del cliente

## Deuda técnica
- ui y web corren Vitest con --passWithNoTests hasta tener pruebas de componentes (P3)
- db:seed, seed:load y e2e llaman scripts que llegan en P3 y P7
- La imagen de la API debe copiar apps/api/prisma/migrations: /api/health/ready las compara (ADR-026)
- No hay filtro global RFC 9457: la idempotencia arma su problema a mano hasta que llegue el filtro
- TypeScript fijado en 6.0 hasta que typescript-eslint soporte TypeScript 7 (ADR-018)
- Jackson y Pollock 7 deja de crecer con la suma de pliegues sobre 395 mm (hombres) y 419 mm (mujeres): consultar si se advierte

## Registro de sesiones (solo las 5 últimas)
- 2026-10-06 · P2 · init de superusuario, 16 migraciones con RLS, políticas y particiones, spike de Prisma 7,
  UnitOfWork, outbox con pg-boss, idempotencia, auditoría, cifrado, salud y CI; ADR-024 a ADR-026 · falta el PR
- 2026-10-06 · P1 · motor con los 39 métodos de 02 §9, validez por método, sobre con hash, G-01 a G-28,
  propiedades, paridad con la referencia y prueba en el navegador; ADR-022 y ADR-023 · falta el PR
- 2026-10-03 · P0 · monorepo pnpm y Turborepo, configuración compartida, reglas de arquitectura con su prueba,
  shared-kernel, API NestJS con salud y worker, web con cuatro grupos, compose local, CI y README; ADR-017 a
  ADR-021 · PR #1 con CI en verde; pendiente aplicar /notion-sync

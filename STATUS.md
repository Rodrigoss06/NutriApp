# STATUS — NutriCoach v1.0

Actualizado: 2026-10-06 · Por: Rodrigo, con Claude Code
Inicio del proyecto: POR CONFIRMAR (día siguiente al Pago 1) · Semana actual: 0 de 9
Próxima demo: Demo 1 · Base y evaluación · semana 2

## Prompts
| Prompt | Estado | Responsable | PR | Notas |
|---|---|---|---|---|
| P0 Andamiaje | ✅ | Rodrigo | #1 | CI en verde; pendiente /notion-sync |
| P1 Motor de cálculo | ✅ | Rodrigo | | G-01 a G-28 en verde; PR pendiente de subir |
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
- P1 terminado en la rama `feat/eng-motor`: falta subirla y abrir el PR

## Siguiente paso
- Subir `feat/eng-motor`, abrir el PR de P1 y, con CI en verde, fusionarlo; luego P2

## Bloqueos y preguntas al cliente
- [ ] N9: límites y precio de los tramos de membresía; qué pasa al superar el límite
- [ ] N22: caducidad del enlace de acceso del paciente
- [ ] N19: confirmar la carga manual de bioimpedancia
- [ ] N13: confirmar regresiones y progresiones en la biblioteca
- [ ] N7: confirmar el estado diario (estrés, sueño, energía)
- [ ] R4: permiso de uso de las listas Dextre y ADA
- [ ] Textos legales revisados por el abogado del cliente

## Deuda técnica
- /api/health/ready es provisional: P2 agrega base, migraciones al día, cola activa y partición del mes siguiente
- ui y web corren Vitest con --passWithNoTests hasta tener pruebas de componentes (P3)
- db:migrate, db:pull, db:seed, seed:load y e2e llaman scripts que llegan en P2, P3 y P7
- El worker solo late y `pnpm dev` no lo levanta (`pnpm --filter api dev:worker`): P2 decide al traer el outbox
- TypeScript fijado en 6.0 hasta que typescript-eslint soporte TypeScript 7 (ADR-018)
- Jackson y Pollock 7 deja de crecer con la suma de pliegues sobre 395 mm (hombres) y 419 mm (mujeres): consultar si se advierte

## Registro de sesiones (solo las 5 últimas)
- 2026-10-06 · P1 · motor con los 39 métodos de 02 §9, validez por método, sobre con hash, G-01 a G-28,
  propiedades, paridad con la referencia y prueba en el navegador; ADR-022 y ADR-023 · falta el PR
- 2026-10-03 · P0 · monorepo pnpm y Turborepo, configuración compartida, reglas de arquitectura con su prueba,
  shared-kernel, API NestJS con salud y worker, web con cuatro grupos, compose local, CI y README; ADR-017 a
  ADR-021 · PR #1 con CI en verde; pendiente aplicar /notion-sync

# STATUS — NutriCoach v1.0

Actualizado: 2026-10-07 · Por: Rodrigo, con Claude Code
Inicio del proyecto: POR CONFIRMAR (día siguiente al Pago 1) · Semana actual: 0 de 9
Próxima demo: Demo 1 · Base y evaluación · semana 2

## Prompts
| Prompt | Estado | Responsable | PR | Notas |
|---|---|---|---|---|
| P0 Andamiaje | ✅ | Rodrigo | #1 | CI en verde |
| P1 Motor de cálculo | ✅ | Rodrigo | #2 | G-01 a G-28 en verde; motor 1.1.0 con TEE_PAL (#4) |
| P2 Base de datos y plataforma | ✅ | Rodrigo | #3 | 61 pruebas de integración |
| P3 Sistema de diseño | ✅ | Rodrigo | #4 | Lighthouse móvil 99 en Hoy; axe sin violaciones graves |
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
- Nada en curso. Notion sincronizado con P0 a P3 (Documento técnico 1.2, 03 v1.3, 05 v1.2)

## Siguiente paso
- P4 · Servidor, staging y despliegue continuo (módulo 23; responsable según Notion: Iván). Empezar con /prompt P4

## Bloqueos y preguntas al cliente
- [ ] N9: límites y precio de los tramos de membresía; qué pasa al superar el límite
- [ ] N22: caducidad del enlace de acceso del paciente
- [ ] N19: confirmar la carga manual de bioimpedancia
- [ ] N13: confirmar regresiones y progresiones en la biblioteca
- [ ] N7: confirmar el estado diario (estrés, sueño, energía)
- [ ] R4: permiso de uso de las listas Dextre y ADA
- [ ] Textos legales revisados por el abogado del cliente

## Deuda técnica
- P7: columnas tee_method_code y tee_method_version en nutrition.energy_prescription (ADR-029)
- Por decidir en el prompt que lo use: quién escribe tracking.daily_target, si el paciente marca
  content.resource_assignment.viewed_at y que active_plan_view compare el publishedAt del snapshot
- Lighthouse móvil en CI sobre staging (RNF-03) cuando exista staging; hoy se mide en local
- CSP del despliegue: style-src con 'unsafe-inline' por BrandStyle (ADR-027)
- La marca y la organización activa son provisionales hasta la sesión (P5) y la personalización (P19)
- db:seed y seed:load llaman scripts que llegan en P7
- La imagen de la API debe copiar apps/api/prisma/migrations: /api/health/ready las compara (ADR-026)
- No hay filtro global RFC 9457: la idempotencia arma su problema a mano hasta que llegue el filtro
- TypeScript fijado en 6.0 hasta que typescript-eslint soporte TypeScript 7 (ADR-018)
- Jackson y Pollock 7 deja de crecer con la suma de pliegues sobre 395 mm (hombres) y 419 mm (mujeres): consultar si se advierte

## Registro de sesiones (solo las 5 últimas)
- 2026-10-07 · P3 y Notion · TEE_PAL en el motor (1.1.0, ADR-029), G-10 con valores exactos, ADR-028 y
  /notion-sync de P0 a P3 aplicado (32 cambios) · PR #4
- 2026-10-06 · P3 · tokens y marca en ejecución con contraste AA, 12 componentes base, layouts del panel y de la
  app, catálogo, PWA, Playwright con axe y Lighthouse móvil 99; ADR-027 · falta el PR
- 2026-10-06 · P2 · init de superusuario, 16 migraciones con RLS, políticas y particiones, spike de Prisma 7,
  UnitOfWork, outbox con pg-boss, idempotencia, auditoría, cifrado, salud y CI; ADR-024 a ADR-026 · falta el PR
- 2026-10-06 · P1 · motor con los 39 métodos de 02 §9, validez por método, sobre con hash, G-01 a G-28,
  propiedades, paridad con la referencia y prueba en el navegador; ADR-022 y ADR-023 · falta el PR
- 2026-10-03 · P0 · monorepo pnpm y Turborepo, configuración compartida, reglas de arquitectura con su prueba,
  shared-kernel, API NestJS con salud y worker, web con cuatro grupos, compose local, CI y README; ADR-017 a
  ADR-021 · PR #1 con CI en verde; pendiente aplicar /notion-sync

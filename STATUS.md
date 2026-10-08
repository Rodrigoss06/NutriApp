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
| P4 Servidor y staging | ⛔ | Iván | | En espera de la cuenta de Hetzner de Jeremy |
| P5 Identidad y organizaciones | 🟨 | Rodrigo | | 3 PR: base e iam · tenancy y plataforma · web, E2E y CI |
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
- P5, PR 1 de 3 fusionado (#6, CI en verde): base transversal, iam, guardias y límite de intentos
- P5, PR 2 de 3 listo en `feat/tenancy-membresias`: tenancy, invitaciones de staff, backoffice,
  RN-A02, auditoría desde eventos, semilla y CLI del primer PLATFORM_ADMIN (falta subirlo)

## Siguiente paso
- PR 3 de P5: web (entrar, invitación, recuperar, organización, cuenta, selector), E2E con Mailpit y CI con worker

## Bloqueos y preguntas al cliente
- [ ] Cuenta de Hetzner y dominio a nombre de Jeremy: bloquea P4
- [ ] N9: límites y precio de los tramos de membresía; qué pasa al superar el límite
- [ ] N22: caducidad del enlace de acceso del paciente
- [ ] N19: confirmar la carga manual de bioimpedancia
- [ ] N13: confirmar regresiones y progresiones en la biblioteca
- [ ] N7: confirmar el estado diario (estrés, sueño, energía)
- [ ] R4: permiso de uso de las listas Dextre y ADA
- [ ] Textos legales revisados por el abogado del cliente

## Deuda técnica
- Para P4: Caddy sin trusted_proxies, para que reescriba X-Forwarded-For con la IP real; en el Sentry de la web,
  quitar el fragmento de las URL (beforeSend y beforeBreadcrumb): ahí viajan los tokens de invitación y recuperación
- P7: columnas tee_method_code y tee_method_version en nutrition.energy_prescription (ADR-029)
- Por decidir en el prompt que lo use: quién escribe tracking.daily_target, si el paciente marca
  content.resource_assignment.viewed_at y que active_plan_view compare el publishedAt del snapshot
- Lighthouse móvil en CI sobre staging (RNF-03) cuando exista staging; hoy se mide en local
- CSP del despliegue: style-src con 'unsafe-inline' por BrandStyle (ADR-027)
- La marca y la organización activa son provisionales hasta la sesión (P5) y la personalización (P19)
- seed:load llama un script que llega en P7 y P8 (db:seed existe desde P5)
- Planes TRAMO_5 y TRAMO_50 con límites y precio provisionales (N9): corregir con migración de datos al cerrarse
- La imagen de la API debe copiar apps/api/prisma/migrations: /api/health/ready las compara (ADR-026)
- TypeScript fijado en 6.0 hasta que typescript-eslint soporte TypeScript 7 (ADR-018)
- Jackson y Pollock 7 deja de crecer con la suma de pliegues sobre 395 mm (hombres) y 419 mm (mujeres): consultar si se advierte

## Registro de sesiones (solo las 5 últimas)
- 2026-10-07 · P5 (2/3) · tenancy con QuotaPolicy y candado, invitaciones de un solo uso, organización activa,
  backoffice, vencimiento RN-A02, auditoría desde eventos, semilla y CLI; ADR-033 y 034
- 2026-10-07 · P5 (1/3) · filtro RFC 9457, guardias con negación por defecto, Origin, límite de intentos en la
  base, iam con argon2id, sesiones, bloqueo, recuperar y cambiar la contraseña, correos por el worker; ADR-030 a 032
- 2026-10-07 · P3 y Notion · TEE_PAL en el motor (1.1.0, ADR-029), G-10 con valores exactos, ADR-028 y
  /notion-sync de P0 a P3 aplicado (32 cambios) · PR #4
- 2026-10-06 · P3 · tokens y marca en ejecución con contraste AA, 12 componentes base, layouts del panel y de la
  app, catálogo, PWA, Playwright con axe y Lighthouse móvil 99; ADR-027 · falta el PR
- 2026-10-06 · P2 · init de superusuario, 16 migraciones con RLS, políticas y particiones, spike de Prisma 7,
  UnitOfWork, outbox con pg-boss, idempotencia, auditoría, cifrado, salud y CI; ADR-024 a ADR-026 · falta el PR

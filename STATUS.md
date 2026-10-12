# STATUS — NutriCoach v1.0

Actualizado: 2026-10-11 · Por: Rodrigo, con Claude Code
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
| P5 Identidad y organizaciones | ✅ | Rodrigo | #6, #7, #8 | 4 criterios en verde; despliegue a staging pendiente de P4 |
| P6 Pacientes e historia clínica | 🟨 | Rodrigo | #10, #11 | 3 PR: clinical y consentimiento (#10) · historia, auditoría e invitación (#11) · web, E2E |
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
- P6, PR 2 de 3 en revisión (#11, CI en verde): historia clínica v1 con revisiones, condiciones, objetivos y notas,
  línea de tiempo, READ en cada lectura, /audit-events para OWNER e invitación del paciente con sus consentimientos y
  sesión PATIENT (ADR-040 a 042)
- P6, PR 3 de 3 listo en `feat/web-pacientes`, sobre `feat/cli-historia` (falta subirlo): lista con búsqueda, alta,
  expediente con pestañas, consentimiento en consulta y en papel, historia con su 409, condiciones, objetivos, notas,
  línea de tiempo, auditoría del dueño, aceptación del paciente y /mi con sesión PATIENT (ADR-043). E2E de P6 con
  los 4 criterios en escritorio y en el celular

## Siguiente paso
- Fusionar #11 y el PR 3; luego /cierre de P6 (los 4 criterios ya están en la E2E) y /notion-sync
- Para el /notion-sync de P6, además de lo anotado en el PR 1: ADR-037 a 043; el 410 en la tabla de 06 §5; RF-06
  (LOGIN y LOGIN_FAILED solo para la plataforma); patient_invitation.ttl_days junto a N22; la regla de menores
  (ADR-042) como ajuste pendiente en la sección 9 del Proyecto; 02 §8 (PATIENT_ENROLLMENT síncrono, eventos nuevos
  de clinical y el consumidor iam.patient-sessions); 03 RN-A06 y RN-B02; las reglas nuevas de apps/api/CLAUDE.md

## Bloqueos y preguntas al cliente
- [ ] Cuenta de Hetzner y dominio a nombre de Jeremy: bloquea P4
- [ ] N9: límites y precio de los tramos de membresía; qué pasa al superar el límite
- [ ] ⚠️ Historia clínica v1 en texto libre por bloque: provisional hasta tener la ficha que usa Jeremy
- [ ] Antes de P16: cargar en producción los valores definitivos de TRAMO_5 y TRAMO_50 (la semilla no corre en
  producción): migración de datos o panel interno de P15
- [ ] N22: caducidad del enlace de acceso del paciente (provisional: 7 días, ajustable por organización en
  patient_invitation.ttl_days, de 1 a 30)
- [ ] N19: confirmar la carga manual de bioimpedancia
- [ ] N13: confirmar regresiones y progresiones en la biblioteca
- [ ] N7: confirmar el estado diario (estrés, sueño, energía)
- [ ] R4: permiso de uso de las listas Dextre y ADA
- [ ] Textos legales revisados por el abogado del cliente, en lenguaje claro: desde los 14 años los acepta el propio
  paciente (ADR-042)
- [ ] ⚠️ Menores: desde los 14 consienten como un adulto; antes, solo en papel firmado por su padre, madre o tutor, sin
  registrar quién es el tutor (ADR-042). Pendiente de confirmar con el abogado

## Deuda técnica
- P14: medir care_team_scope con seed:load. Si el costo por fila pesa en tracking, pasar a
  patient_id = ANY((SELECT app.visible_patient_ids())), que se evalúa una vez por consulta (ADR-037)
- P5 sin desplegar a staging (06 §9): queda pendiente de P4. Al desplegar: APP_URL con https,
  SESSION_COOKIE_NAME=__Host-nc_session, API_INTERNAL_URL al compilar, SEED_DEMO_PASSWORD y la CLI
  create-platform-admin para el primer PLATFORM_ADMIN
- Para P4: Caddy sin trusted_proxies, para que reescriba X-Forwarded-For con la IP real; en el Sentry de la web,
  quitar el fragmento de las URL (beforeSend y beforeBreadcrumb): ahí viajan los tokens de invitación y recuperación
- P7: columnas tee_method_code y tee_method_version en nutrition.energy_prescription (ADR-029)
- Por decidir en el prompt que lo use: quién escribe tracking.daily_target, si el paciente marca
  content.resource_assignment.viewed_at y que active_plan_view compare el publishedAt del snapshot
- Lighthouse móvil en CI sobre staging (RNF-03) cuando exista staging; hoy se mide en local
- CSP del despliegue: style-src con 'unsafe-inline' por BrandStyle (ADR-027)
- La marca es provisional hasta la personalización (P19); la organización activa ya sale de la sesión (P5)
- seed:load llama un script que llega en P7 y P8 (db:seed existe desde P5)
- Planes TRAMO_5 y TRAMO_50 con límites y precio provisionales (N9): corregir con migración de datos al cerrarse
- La imagen de la API debe copiar apps/api/prisma/migrations: /api/health/ready las compara (ADR-026)
- TypeScript fijado en 6.0 hasta que typescript-eslint soporte TypeScript 7 (ADR-018)
- Jackson y Pollock 7 deja de crecer con la suma de pliegues sobre 395 mm (hombres) y 419 mm (mujeres): consultar si se advierte

## Registro de sesiones (solo las 5 últimas)
- 2026-10-12 · P6 (3/3) · web del expediente, auditoría y aceptación del paciente, /mi con sesión PATIENT, búsqueda
  de documento sin tipo; E2E de P6 en escritorio y celular; ADR-043
- 2026-10-12 · P6 (2/3) · revisión del PR 2: menores con umbral de 14 años (ADR-042), OBESITY solo el equipo, 410
  único para todo enlace que ya no sirve, 409 si una invitación de staff choca con la de un paciente y la CLI sin
  clinical, con adaptadores explícitos
- 2026-10-11 · P6 (2/3) · historia clínica versionada, condiciones, objetivos y notas inmutables, línea de tiempo,
  READ en cada lectura, módulo audit con /audit-events, invitación y aceptación del paciente con PATIENT_ENROLLMENT,
  sesión PATIENT y cierre de sesiones al revocar o archivar; ADR-040 y 041
- 2026-10-09 · P6 (1/3) · care_team_scope en la base, StoragePort local, pacientes con documento cifrado e índice
  ciego, equipo de atención, consentimiento con evidencia y cupo real; ADR-037 a 039
- 2026-10-08 · P5 cerrado · PR 3 fusionado (#8): web de acceso, organización y cuenta, E2E con Mailpit en
  escritorio y celular, CI con la pila completa; ADR-035 y 036; P5 ✅ con sus 4 criterios; /notion-sync de P5
  aplicado (23 cambios en 01, 02, 03, 05, 05.1, 05.3, 06, Documento técnico y Archivos del repositorio)

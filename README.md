# NutriCoach

Plataforma web para nutricionistas y entrenadores: evaluación antropométrica, composición corporal,
energía, dieta, rutinas y seguimiento diario del paciente. Versión 1.0, Paquete B.
«NutriCoach» es un nombre de trabajo; la marca final la define el cliente.

## Requisitos

- Node.js 24 LTS, fijado en `.nvmrc` (con fnm: `fnm install && fnm use`).
- pnpm por corepack (`corepack enable`); la versión exacta está en `packageManager` de `package.json`.
- Docker con Compose.
- Git y, de manera opcional, GitHub CLI.

## Cómo levantar

```bash
pnpm install
cp apps/api/env.local.example apps/api/.env   # valores locales; nunca secretos reales
pnpm db:up       # PostgreSQL 18 en 127.0.0.1:5432 y Mailpit en http://127.0.0.1:8025
pnpm db:migrate  # roles y base los crea infra/db/init al crear el volumen; esto aplica las migraciones
pnpm dev         # web en :3000, API en http://localhost:3001/api/health/ready y el worker
```

`pnpm dev` levanta también el worker (outbox, colas y mantenimiento). La lista completa de variables de
staging y producción está en `.env.example` (Notion 01 §12). Si el volumen de PostgreSQL es anterior a P2,
se recrea con `docker compose -f infra/docker/compose.local.yml down -v` para que corra infra/db/init.

## Comandos

| Comando                                             | Qué hace                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm check`                                        | Lint, reglas de arquitectura, tipos, unitarias e integración: la puerta |
| `pnpm lint:arch`                                    | Reglas de dependencia de Notion 02 §4 con dependency-cruiser            |
| `pnpm test:golden`                                  | Casos dorados del motor, G-01 a G-28 (desde P1)                         |
| `pnpm build`                                        | Compila los paquetes, la API y la web                                   |
| `pnpm db:migrate` · `pnpm db:pull` · `pnpm db:seed` | Base de datos primero: migraciones SQL y cliente Prisma (desde P2)      |
| `pnpm e2e`                                          | Recorridos de cada demo con Playwright (desde P3)                       |

## Estructura

```text
apps/api      NestJS: proceso HTTP (main.ts) y worker (worker.ts) con el mismo código
apps/web      Next.js: grupos (public), (panel), (paciente) y (admin)
packages/     engine, shared-kernel, contracts, ui y config
infra/        Docker Compose, Caddy, base de datos, respaldos, pruebas de carga y runbooks
```

## Documentación

Notion es la fuente de verdad y manda sobre el código. El estado del trabajo está en `STATUS.md`,
las decisiones en `DECISIONS.md` y las instrucciones para Claude Code en `CLAUDE.md`.

- [Proyecto: alcance, cronograma y fuera de alcance](https://app.notion.com/p/3edc3fa6d4ce8169886def0c8ab97379)
- [Documento técnico: stack, decisiones y glosario](https://app.notion.com/p/3edc3fa6d4ce81cc9897c80e573f7ecf)
- [01 Infraestructura y despliegue](https://app.notion.com/p/3edc3fa6d4ce81099503f1a484982a30)
- [02 Arquitectura](https://app.notion.com/p/3edc3fa6d4ce814099eefb07a1f975a0)
- [03 Reglas de negocio y casos dorados](https://app.notion.com/p/3edc3fa6d4ce8168a99ad95dd0df8e78)
- [04 Requisitos](https://app.notion.com/p/3edc3fa6d4ce819ebcb6f71965ed9037)
- [05 Modelo de datos](https://app.notion.com/p/3edc3fa6d4ce815b9f36dce97439104d)
- [06 Convenciones](https://app.notion.com/p/3edc3fa6d4ce81c982e7f4e4a47ba6d1)
- [Creación del proyecto: flujo y orden de los prompts](https://app.notion.com/p/3edc3fa6d4ce81ad931fd04dadc1e513)

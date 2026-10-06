#!/usr/bin/env bash
# Lo que exige superusuario (Notion 05 §3), una sola vez por servidor: roles, base, extensiones y zona
# horaria. Todo lo demás (esquemas, funciones app.*, permisos y tablas) llega por migraciones que corre
# app_owner con `pnpm db:migrate`, también en producción.
#
# La imagen de postgres ejecuta este archivo al crear el volumen. En staging y producción se corre a mano
# con las mismas variables (runbook de alta del servidor). Las contraseñas pasan a psql con -v: un .sql no
# lee variables de entorno.
set -euo pipefail

: "${APP_OWNER_PASSWORD:?Falta APP_OWNER_PASSWORD}"
: "${APP_USER_PASSWORD:?Falta APP_USER_PASSWORD}"
: "${APP_READONLY_PASSWORD:?Falta APP_READONLY_PASSWORD}"
DB_NAME="${APP_DB_NAME:-nutricoach}"

psql -v ON_ERROR_STOP=1 --no-psqlrc \
  --username "${POSTGRES_USER:-postgres}" --dbname postgres \
  -v owner_password="$APP_OWNER_PASSWORD" \
  -v user_password="$APP_USER_PASSWORD" \
  -v readonly_password="$APP_READONLY_PASSWORD" \
  -v db_name="$DB_NAME" <<'SQL'
-- app_owner: dueño de los esquemas; solo corre migraciones. app_user: api y worker, siempre sujeto a RLS.
-- app_readonly: reportes y soporte técnico, sujeto a RLS.
CREATE ROLE app_owner    LOGIN BYPASSRLS PASSWORD :'owner_password';
CREATE ROLE app_user     LOGIN PASSWORD :'user_password';
CREATE ROLE app_readonly LOGIN PASSWORD :'readonly_password';

-- app_owner crea el esquema pgboss con AUTHORIZATION app_user (ADR-024). PostgreSQL 16+ lo exige poder
-- asumir app_user; sin INHERIT no recibe sus permisos.
GRANT app_user TO app_owner WITH INHERIT FALSE, SET TRUE;

CREATE DATABASE :"db_name" OWNER app_owner;
SQL

psql -v ON_ERROR_STOP=1 --no-psqlrc \
  --username "${POSTGRES_USER:-postgres}" --dbname "$DB_NAME" \
  -v db_name="$DB_NAME" <<'SQL'
-- Instantes en UTC (05 §2): también fija las fronteras de las particiones por timestamptz.
ALTER DATABASE :"db_name" SET timezone = 'UTC';

-- Solo los tres roles de la aplicación se conectan.
REVOKE CONNECT, TEMPORARY ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO app_owner, app_user, app_readonly;
GRANT TEMPORARY ON DATABASE :"db_name" TO app_owner;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SQL

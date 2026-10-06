import { id, pool } from './database.js';

/**
 * Datos sintéticos (RN-B08) insertados como app_owner, que salta la RLS. Cada llamada crea filas nuevas
 * con identificadores al azar: los archivos de prueba comparten la base sin pisarse.
 */
export interface Tenant {
  readonly orgId: string;
  readonly memberUserId: string;
  readonly patientId: string;
  readonly otherPatientId: string;
}

const LOCAL_DATE = '2026-10-15';

async function owner(sql: string, params: unknown[]): Promise<void> {
  await pool('owner').query(sql, params);
}

export async function createTenant(label: string): Promise<Tenant> {
  const tenant: Tenant = { orgId: id(), memberUserId: id(), patientId: id(), otherPatientId: id() };
  await owner(`INSERT INTO tenancy.organization (id, name, slug) VALUES ($1, $2, $3)`, [
    tenant.orgId,
    `Organización ${label}`,
    `org-${tenant.orgId}`,
  ]);
  await owner(
    `INSERT INTO tenancy.member (id, organization_id, user_id, role) VALUES ($1, $2, $3, 'OWNER')`,
    [id(), tenant.orgId, tenant.memberUserId],
  );
  for (const [patientId, code] of [
    [tenant.patientId, 'P-000001'],
    [tenant.otherPatientId, 'P-000002'],
  ]) {
    await owner(
      `INSERT INTO clinical.patient (id, organization_id, code, first_name, last_name, sex, birth_date,
                                     responsible_member_id, created_by)
       VALUES ($1, $2, $3, 'Paciente', 'Sintético', 'M', '1998-01-01', $4, $4)`,
      [patientId, tenant.orgId, code, tenant.memberUserId],
    );
    await owner(
      `INSERT INTO tracking.food_log (id, local_date, organization_id, patient_id, logged_at, meal_slot_code,
                                      item_type, item_name, kcal, cho_g, protein_g, fat_g, in_plan, client_id,
                                      created_by)
       VALUES ($1, $2, $3, $4, now(), 'LUNCH', 'FOOD', 'Arroz', 200, 44, 4, 0.5, false, $5, $4)`,
      [id(), LOCAL_DATE, tenant.orgId, patientId, id()],
    );
  }
  await owner(
    `INSERT INTO clinical.clinical_history (id, organization_id, patient_id, revision, form_code, form_version,
                                            answers, recorded_by)
     VALUES ($1, $2, $3, 1, 'ANAMNESIS', '1', '{}', $4)`,
    [id(), tenant.orgId, tenant.patientId, tenant.memberUserId],
  );
  await owner(
    `INSERT INTO food.food (id, organization_id, source_code, name_es) VALUES ($1, $2, 'ORG', $3)`,
    [id(), tenant.orgId, `Alimento propio ${label}`],
  );
  await owner(
    `INSERT INTO audit.audit_log (id, occurred_at, organization_id, action, resource_type)
     VALUES ($1, now(), $2, 'READ', 'patient')`,
    [id(), tenant.orgId],
  );
  return tenant;
}

/** Catálogo mínimo global que usan las pruebas. */
export async function ensureGlobalCatalog(): Promise<void> {
  await owner(
    `INSERT INTO food.source (code, name, license) VALUES ('ORG', 'Propio de la organización', 'Privada')
     ON CONFLICT DO NOTHING`,
    [],
  );
  await owner(
    `INSERT INTO assessment.measurement_site (code, family, name_es, unit, min_value, max_value, tolerance_pct,
                                              in_basic, in_isak1, in_isak2, display_order)
     VALUES ('SKF_TRICEPS', 'SKINFOLD', 'Tríceps', 'mm', 0, 80, 5, false, true, true, 1)
     ON CONFLICT DO NOTHING`,
    [],
  );
}

export { LOCAL_DATE };

import { readFile } from 'node:fs/promises';
import type { UserId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PatientExportSources } from '../../src/modules/clinical/index.js';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, PASSWORD, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P15 (PR 6a) · la supresión del paciente por anonimización, contra PostgreSQL como app_user (RN-B05, RF-07; ADR-133). Criterio 4 de P15
 * en su parte de supresión: la de Luis no deja ninguno de sus archivos. Cada texto libre que se escribe lleva la marca ZQX; después de
 * suprimir, ninguna fila de sus tablas tiene la marca, su nombre ni su correo. Y la prueba del catálogo: cada columna de texto de las
 * tablas del paciente está decidida (se vacía, se limpia por dentro o queda, con su motivo). Datos sintéticos.
 */

/**
 * Cada columna de texto, JSON, lista o bytes de las tablas del paciente (las de su exportación) y qué hace la supresión. CLEAR: queda
 * vacía o con un texto fijo; SCRUB: un JSON que pierde sus textos libres; lo demás queda, con su motivo.
 */
const CLEAR = 'CLEAR';
const SCRUB = 'SCRUB';
const CODE = 'Código, enumerado o versión: no identifica.';
const ENGINE = 'Insumos, resultados o avisos del motor: números y códigos.';
const HASH = 'Huella de un contenido: no se lee.';
const CATALOG = 'Viene de un catálogo (alimento, receta, ejercicio, medida o tabla de fases).';

const COLUMNS: Readonly<Record<string, string>> = {
  'assessment.bia_reading.device_brand': 'La marca del equipo.',
  'assessment.bia_reading.device_model': 'El modelo del equipo.',
  'assessment.bia_reading.readings': ENGINE,
  'assessment.calculation_result.method_code': CODE,
  'assessment.calculation_result.method_version': CODE,
  'assessment.calculation_result.engine_version': CODE,
  'assessment.calculation_result.inputs': ENGINE,
  'assessment.calculation_result.inputs_hash': HASH,
  'assessment.calculation_result.outputs': ENGINE,
  'assessment.calculation_result.warnings': ENGINE,
  'assessment.calculation_result.status': CODE,
  'assessment.evaluation.kind': CODE,
  'assessment.evaluation.level': CODE,
  'assessment.evaluation.conditions': SCRUB,
  'assessment.evaluation.patient_snapshot': 'Sexo, edad y población: lo agregado.',
  'assessment.evaluation.status': CODE,
  'assessment.evaluation.amend_reason': CLEAR,
  'assessment.evaluation.notes': CLEAR,
  'assessment.evaluation.moment': CODE,
  'assessment.measurement.site_code': CODE,
  'assessment.measurement.consolidation': CODE,
  'assessment.measurement.side': CODE,
  'assessment.method_preference.population': CODE,
  'assessment.method_preference.purpose': CODE,
  'assessment.method_preference.method_code': CODE,
  'assessment.movement_screen.test_code': CODE,
  'assessment.movement_screen.status': CODE,
  'assessment.movement_screen.rule_version': CODE,
  'assessment.movement_screen.modality': CODE,
  'assessment.movement_screen.observation': CLEAR,
  'assessment.movement_screen.action_note': CLEAR,
  'assessment.movement_screen.reliability_note': CLEAR,
  'assessment.movement_screen.evidence_url': CLEAR,
  'assessment.physical_test_result.test_code': CODE,
  'assessment.physical_test_result.unit': CODE,
  'assessment.physical_test_result.modality': CODE,
  'assessment.physical_test_result.notes': CLEAR,
  'assessment.physical_test_result.evidence_url': CLEAR,
  'assessment.result_metric.metric_code': CODE,
  'assessment.result_metric.method_code': CODE,
  'assessment.result_metric.unit': CODE,
  'clinical.care_team_member.role': CODE,
  'clinical.care_team_member.access': CODE,
  'clinical.clinical_history.form_code': CODE,
  'clinical.clinical_history.form_version': CODE,
  'clinical.clinical_history.answers': CLEAR,
  'clinical.clinical_note.body': CLEAR,
  'clinical.clinical_note.visibility': CODE,
  'clinical.condition.kind': CODE,
  'clinical.condition.code_system': CODE,
  'clinical.condition.code': 'El código de la condición (CIE-10): lo agregado.',
  'clinical.condition.label': CLEAR,
  'clinical.condition.status': CODE,
  'clinical.condition.notes': CLEAR,
  'clinical.consent.purpose': CODE,
  'clinical.consent.channel': CODE,
  'clinical.consent.ip': CLEAR,
  'clinical.consent.user_agent': CLEAR,
  'clinical.goal.kind': CODE,
  'clinical.goal.metric_code': CODE,
  'clinical.goal.status': CODE,
  'clinical.goal.notes': CLEAR,
  'clinical.patient.code': 'El número de registro, sin identificación (05 §11).',
  'clinical.patient.first_name': CLEAR,
  'clinical.patient.last_name': CLEAR,
  'clinical.patient.sex': CODE,
  'clinical.patient.gender_identity': CLEAR,
  'clinical.patient.document_type': CLEAR,
  'clinical.patient.document_number_enc': CLEAR,
  'clinical.patient.document_number_bidx': CLEAR,
  'clinical.patient.email': CLEAR,
  'clinical.patient.phone_enc': CLEAR,
  'clinical.patient.timezone': CODE,
  'clinical.patient.population': CODE,
  'clinical.patient.status': CODE,
  'clinical.patient.tags': CLEAR,
  'clinical.performance_profile.method_code': CODE,
  'clinical.performance_profile.method_version': CODE,
  'clinical.performance_profile.engine_version': CODE,
  'clinical.performance_profile.inputs':
    'Respuestas codificadas de la anamnesis V2 (escalas y opciones).',
  'clinical.performance_profile.inputs_hash': HASH,
  'clinical.performance_profile.domain_scores': ENGINE,
  'clinical.performance_profile.classes': ENGINE,
  'clinical.pre_exercise_screening.form_version': CODE,
  'clinical.pre_exercise_screening.answers': 'Sí o no por pregunta.',
  'clinical.pre_exercise_screening.status': CODE,
  'clinical.pre_exercise_screening.rule_version': CODE,
  'clinical.pre_exercise_screening.review_decision': CODE,
  'clinical.pre_exercise_screening.review_note': CLEAR,
  'clinical.record_document.category': CODE,
  'clinical.record_document.title': CLEAR,
  'clinical.record_document.status': CODE,
  'clinical.record_document.link_url': CLEAR,
  'clinical.record_document.review_note': CLEAR,
  'clinical.record_document.created_by_role': CODE,
  'clinical.record_document.content_by_role': CODE,
  'content.motivational_message.body': CLEAR,
  'content.motivational_message.schedule': CODE,
  'content.patient_app_setting.theme_color': CODE,
  'content.patient_app_setting.welcome_message': CLEAR,
  'content.patient_app_setting.enabled_sections': CODE,
  'documents.generated_document.kind': CODE,
  'documents.generated_document.source_type': CODE,
  'documents.generated_document.source_hash': HASH,
  'documents.generated_document.template_version': CODE,
  'documents.generated_document.branding_hash': HASH,
  'documents.generated_document.sha256': HASH,
  'nutrition.energy_prescription.ffm_method_code': CODE,
  'nutrition.energy_prescription.rmr_method_code': CODE,
  'nutrition.energy_prescription.rmr_method_version': CODE,
  'nutrition.energy_prescription.sex': CODE,
  'nutrition.energy_prescription.strategy': CODE,
  'nutrition.energy_prescription.activities': SCRUB,
  'nutrition.energy_prescription.goal': CODE,
  'nutrition.energy_prescription.projection': ENGINE,
  'nutrition.energy_prescription.engine_version': CODE,
  'nutrition.energy_prescription.inputs_hash': HASH,
  'nutrition.energy_prescription.tee_method_code': CODE,
  'nutrition.energy_prescription.tee_method_version': CODE,
  'nutrition.energy_prescription.components': ENGINE,
  'nutrition.plan.modality': CODE,
  'nutrition.plan.status': CODE,
  'nutrition.plan.exchange_list_version': CODE,
  'nutrition.plan.instructions': CLEAR,
  'nutrition.plan.snapshot': SCRUB,
  'nutrition.plan.snapshot_hash': HASH,
  'nutrition.plan_day_profile.code': CODE,
  'nutrition.plan_day_profile.name':
    'El nombre del perfil de día (Entrenamiento, Descanso): la estructura.',
  'nutrition.plan_exchange.group_code': CODE,
  'nutrition.plan_item.item_type': CODE,
  'nutrition.plan_item.household_text': CATALOG,
  'nutrition.plan_item.option_label': 'A o B.',
  'nutrition.plan_item_profile.profile_code': CODE,
  'nutrition.plan_item_profile.household_text': CATALOG,
  'nutrition.plan_meal.slot_code': CODE,
  'nutrition.plan_meal.name_es': 'El nombre del tiempo de comida: la estructura.',
  'nutrition.plan_meal_allowed_food.group_code': CODE,
  'nutrition.plan_meal_allowed_food.household_text': CATALOG,
  'nutrition.plan_meal_exchange.group_code': CODE,
  'nutrition.plan_meal_profile_exchange.profile_code': CODE,
  'nutrition.plan_meal_profile_exchange.group_code': CODE,
  'scheduling.appointment.kind': CODE,
  'scheduling.appointment.mode': CODE,
  'scheduling.appointment.location': CLEAR,
  'scheduling.appointment.meeting_url': CLEAR,
  'scheduling.appointment.status': CODE,
  'scheduling.appointment.notes': CLEAR,
  'tracking.active_plan_view.nutrition_snapshot': SCRUB,
  'tracking.active_plan_view.training_snapshot': SCRUB,
  'tracking.daily_checkin.source': CODE,
  'tracking.daily_checkin.status': CODE,
  'tracking.daily_readiness.method_code': CODE,
  'tracking.daily_readiness.method_version': CODE,
  'tracking.daily_readiness.engine_version': CODE,
  'tracking.daily_readiness.inputs': ENGINE,
  'tracking.daily_readiness.inputs_hash': HASH,
  'tracking.daily_readiness.components': ENGINE,
  'tracking.daily_readiness.indication': CODE,
  'tracking.daily_readiness.status': CODE,
  'tracking.daily_target.planned_sets': ENGINE,
  'tracking.daily_target.day_kind': CODE,
  'tracking.daily_target.day_profile_code': CODE,
  'tracking.daily_target.day_profile_name': 'El nombre del perfil de día: la estructura.',
  'tracking.day_change.kind': CODE,
  'tracking.day_change.day_profile_code': CODE,
  'tracking.day_change.created_by_role': CODE,
  'tracking.device_reading.provider': CODE,
  'tracking.device_reading.external_id': CLEAR,
  'tracking.device_reading.metric_code': CODE,
  'tracking.device_reading.unit': CODE,
  'tracking.device_reading.raw': CLEAR,
  'tracking.food_log.meal_slot_code': CODE,
  'tracking.food_log.item_type': CODE,
  'tracking.food_log.item_name': CATALOG,
  'tracking.food_log.exchange_group_code': CODE,
  'tracking.food_log.household_text': CATALOG,
  'tracking.food_log.nutrients': ENGINE,
  'tracking.food_log.source': CODE,
  'tracking.food_log.status': CODE,
  'tracking.hydration_log.beverage': CODE,
  'tracking.hydration_log.source': CODE,
  'tracking.hydration_log.status': CODE,
  'tracking.log_adjustment.target_type': CODE,
  'tracking.log_adjustment.action': CODE,
  'tracking.log_adjustment.corrected_values': 'Los valores corregidos: números.',
  'tracking.log_adjustment.reason': CLEAR,
  'tracking.metric_log.metric_code': CODE,
  'tracking.metric_log.source': CODE,
  'tracking.metric_log.status': CODE,
  'tracking.note_log.body': CLEAR,
  'tracking.set_log.exercise_name': CATALOG,
  'tracking.set_log.muscle_contributions': ENGINE,
  'tracking.set_log.status': CODE,
  'tracking.weekly_checkin.status': CODE,
  'tracking.workout_log.outcome': CODE,
  'tracking.workout_log.notes': CLEAR,
  'tracking.workout_log.source': CODE,
  'tracking.workout_log.status': CODE,
  'training.athlete_profile.objective': CODE,
  'training.athlete_profile.level': CODE,
  'training.athlete_profile.equipment_codes': CODE,
  'training.athlete_profile.medical_clearance': CODE,
  'training.athlete_profile.injuries_note': CLEAR,
  'training.athlete_profile.restrictions_note': CLEAR,
  'training.athlete_profile.test_targets': ENGINE,
  'training.athlete_profile.notes': CLEAR,
  'training.mesocycle.name': CLEAR,
  'training.mesocycle.focus': CLEAR,
  'training.mesocycle_report.status': CODE,
  'training.mesocycle_report.achievement': CLEAR,
  'training.mesocycle_report.limitation': CLEAR,
  'training.mesocycle_report.adjustment': CLEAR,
  'training.mesocycle_report.priority': CLEAR,
  'training.mesocycle_report.student_comment': CLEAR,
  'training.mesocycle_report.snapshot': SCRUB,
  'training.mesocycle_report.snapshot_hash': HASH,
  'training.prescribed_exercise.superset_group': CODE,
  'training.prescribed_exercise.notes': CLEAR,
  'training.prescribed_exercise.movement_pattern': CODE,
  'training.prescribed_exercise.substitution_note': CLEAR,
  'training.prescribed_set.set_type': CODE,
  'training.prescribed_set.load_kind': CODE,
  'training.prescribed_set.tempo': CODE,
  'training.program.name': CLEAR,
  'training.program.goal': CODE,
  'training.program.status': CODE,
  'training.program.one_rm_formula': CODE,
  'training.program.snapshot': SCRUB,
  'training.program.snapshot_hash': HASH,
  'training.program.objective': CODE,
  'training.program.level': CODE,
  'training.program.split': CODE,
  'training.program.template_version': CODE,
  'training.program.origin': CODE,
  'training.program_week.phase_es': CATALOG,
  'training.program_week.phase_goal_es': CATALOG,
  'training.program_week.intensity': CODE,
  'training.program_week.review_kind': CODE,
  'training.progress_photo.view': CODE,
  'training.progress_photo.uploaded_by_role': CODE,
  'training.session.name': CLEAR,
  'training.session.notes': CLEAR,
  'training.session.day_profile_code': CODE,
  'training.weekly_review.method_code': CODE,
  'training.weekly_review.method_version': CODE,
  'training.weekly_review.engine_version': CODE,
  'training.weekly_review.inputs': ENGINE,
  'training.weekly_review.inputs_hash': HASH,
  'training.weekly_review.light': CODE,
  'training.weekly_review.suggested_action': CODE,
  'training.weekly_review.coach_decision': CODE,
  'training.weekly_review.decision_note': CLEAR,
  'training.weekly_review.status': CODE,
};

/** Lo que la supresión deja escrito en lugar de un texto obligatorio. */
const PLACEHOLDERS = ['Anonimizado', 'Documento', 'Programa', 'Mesociclo', 'Sesión', '', '{}'];
const MARK = 'ZQX';
const PDF = Buffer.from('%PDF-1.4\n%ZQX contrato sintético\n');
const SEEDS = new URL('../../../../seeds/', import.meta.url);
const DAY_MS = 86_400_000;

const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let ownerCookie: string;
let patientId: string;
let patientEmail: string;
let patientUserId: string;

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];
const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Las tablas del paciente, con el filtro de su exportación ($1 = el paciente). Las notas, todas: también las «Solo el autor», que la
 * exportación filtra por quien la pide.
 */
function patientTables(): { table: string; where: string }[] {
  return harness.app
    .get(PatientExportSources)
    .all()
    .flatMap((source) =>
      source.tables.map((t) => ({
        table: t.table,
        where: t.where?.includes('$2') ? 'patient_id = $1' : (t.where ?? 'patient_id = $1'),
      })),
    );
}

async function publishedProgram(squatId: string): Promise<void> {
  type Program = {
    id: string;
    version: number;
    document: { mesocycles: { weeks: { id: string }[] }[] };
  };
  const created = await harness.post(
    `/patients/${patientId}/training-programs`,
    { name: `${MARK} Macrociclo de Luis`, startDate: addDays(today(), -21) },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  let program = (
    await harness.get(`/training-programs/${(created.body as { id: string }).id}`, cookie)
  ).body as Program;
  const added = await harness
    .post(`/training-programs/${program.id}/mesocycles`, { name: `${MARK} Base`, weeks: 4 }, cookie)
    .set('If-Match', String(program.version));
  program = added.body as Program;
  const set = { repsMin: 8, repsMax: 8, loadKind: 'KG', loadValue: 60, restSeconds: 90 };
  for (const week of program.document.mesocycles.flatMap((mesocycle) => mesocycle.weeks)) {
    const saved = await harness
      .put(
        `/training-programs/${program.id}/weeks/${week.id}`,
        {
          sessions: [
            {
              name: `${MARK} Pierna de Luis`,
              notes: `${MARK} cuidar la rodilla`,
              exercises: [{ exerciseId: squatId, notes: `${MARK} sin dolor`, sets: [set] }],
            },
          ],
        },
        cookie,
      )
      .set('If-Match', String(program.version));
    program = saved.body as Program;
  }
  const published = await harness
    .post(`/training-programs/${program.id}/publish`, undefined, cookie)
    .set('If-Match', String(program.version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  await harness.deliver('tracking.programs');
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  ownerCookie = org.staff.owner.cookie;
  const report = await harness.app.get(CatalogImporter).run({
    kind: 'EXERCISE_LIBRARY',
    fileName: 'exercise/ejercicios-base.csv',
    content: Buffer.concat([
      await readFile(new URL('exercise/ejercicios-base.csv', SEEDS)),
      Buffer.from('\n\n\n\n\n\n\n\n\n'),
    ]),
    organizationId: null,
    startedBy: uuid() as UserId,
  });
  expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  const [squat] = await owner<{ id: string }>(
    `SELECT id FROM exercise.exercise WHERE organization_id IS NULL AND code = 'SQ01'`,
  );

  ({ patientId } = await luisWithPrescription(harness, org));
  patientEmail = `luis-${uuid()}@demo.test`;
  const current = await harness.get(`/patients/${patientId}`, cookie);
  const updated = await harness
    .patch(
      `/patients/${patientId}`,
      { phone: '999888777', document: { type: 'DNI', number: '45678912' } },
      cookie,
    )
    .set('If-Match', String((current.body as { version: number }).version));
  expect(updated.status, JSON.stringify(updated.body)).toBeLessThan(300);
  await publishedProgram(squat?.id ?? '');
  for (const body of [
    { body: `${MARK} impresión del responsable`, visibility: 'AUTHOR_ONLY' },
    { body: `${MARK} primera consulta de Luis` },
  ]) {
    expect((await harness.post(`/patients/${patientId}/notes`, body, cookie)).status).toBe(201);
  }
  const condition = await harness.post(
    `/patients/${patientId}/conditions`,
    { kind: 'DISEASE', label: `${MARK} hipotiroidismo`, codeSystem: 'CIE-10', code: 'E03.9' },
    cookie,
  );
  expect(condition.status, JSON.stringify(condition.body)).toBe(201);
  const document = await harness
    .post(`/patients/${patientId}/record-documents`, undefined, cookie)
    .field('title', `${MARK} contrato de Luis`)
    .field('category', 'ADMINISTRATIVE')
    .attach('file', PDF, { filename: 'contrato.pdf' });
  expect(document.status, JSON.stringify(document.body)).toBe(201);
  const start = new Date(Date.now() + 3 * DAY_MS);
  start.setUTCMinutes(0, 0, 0);
  const appointment = await harness.post(
    '/appointments',
    {
      patientId,
      kind: 'CONSULTATION',
      mode: 'IN_PERSON',
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
      location: `${MARK} consultorio de Miraflores`,
      notes: `${MARK} traer análisis`,
    },
    cookie,
  );
  expect(appointment.status, JSON.stringify(appointment.body)).toBe(201);

  // Su cuenta de la app.
  const invited = await harness.post(
    `/patients/${patientId}/invitation`,
    { email: patientEmail },
    cookie,
  );
  expect(invited.status, JSON.stringify(invited.body)).toBeLessThan(300);
  const token = await harness.invitationTokenFor(patientEmail);
  const inspected = await harness.post('/invitations/inspect', { token });
  const accepted = await harness.post('/invitations/accept', {
    token,
    password: PASSWORD,
    acceptedConsentDocumentIds: (inspected.body as { consents: { id: string }[] }).consents.map(
      (consent) => consent.id,
    ),
  });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  const [linked] = await owner<{ user_id: string }>(
    `SELECT user_id FROM clinical.patient WHERE id = $1`,
    [patientId],
  );
  patientUserId = linked?.user_id ?? '';

  // Una exportación lista, para ver que su ZIP también se borra.
  expect((await harness.post(`/patients/${patientId}/exports`, undefined, cookie)).status).toBe(
    202,
  );
  await harness.deliver('clinical.exports');
}, 180_000);

afterAll(async () => {
  await harness.stop();
});

describe('RN-B05 · cada columna de texto de las tablas del paciente está decidida', () => {
  it('toda columna de texto, JSON, lista o bytes está en la lista: se vacía, se limpia por dentro o queda con su motivo', async () => {
    const tables = patientTables().map((t) => t.table);
    const columns = await owner<{ name: string }>(
      `SELECT table_schema || '.' || table_name || '.' || column_name AS name
       FROM information_schema.columns
       WHERE table_schema || '.' || table_name = ANY($1)
         AND data_type IN ('text', 'character varying', 'character', 'USER-DEFINED', 'jsonb', 'ARRAY', 'inet', 'bytea')`,
      [tables],
    );
    const names = columns.map((c) => c.name);
    expect(names.filter((name) => !(name in COLUMNS))).toEqual([]);
    expect(Object.keys(COLUMNS).filter((name) => !names.includes(name))).toEqual([]);
  });
});

describe('RN-B05 · suprimir a Luis (criterio 4 de P15)', () => {
  it('solo el dueño, solo archivado y con su código', async () => {
    const asResponsible = await harness.post(
      `/patients/${patientId}/anonymize`,
      { code: 'P-000001' },
      cookie,
    );
    expect(asResponsible.status).toBe(403);
    const [{ code } = { code: '' }] = await owner<{ code: string }>(
      `SELECT code FROM clinical.patient WHERE id = $1`,
      [patientId],
    );
    const active = await harness.post(`/patients/${patientId}/anonymize`, { code }, ownerCookie);
    expect(active.status).toBe(409);
    expect(active.body).toMatchObject({ code: 'NC-CLI-047', rule: 'RN-B05' });

    expect((await harness.post(`/patients/${patientId}/archive`, undefined, cookie)).status).toBe(
      204,
    );
    const wrong = await harness.post(
      `/patients/${patientId}/anonymize`,
      { code: 'P-999999' },
      ownerCookie,
    );
    expect(wrong.status).toBe(422);
    expect(wrong.body).toMatchObject({ code: 'NC-CLI-049', rule: 'RN-B05' });
    expect((await harness.post(`/patients/${patientId}/anonymize`, {}, ownerCookie)).status).toBe(
      400,
    );

    const done = await harness.post(
      `/patients/${patientId}/anonymize`,
      { code: code.toLowerCase() },
      ownerCookie,
    );
    expect(done.status, JSON.stringify(done.body)).toBe(204);
  });

  it('ninguna fila de sus tablas guarda la marca, su nombre, su correo ni su documento', async () => {
    const leaks: string[] = [];
    for (const { table, where } of patientTables()) {
      const rows = await owner<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} t WHERE ${where}
           AND (to_jsonb(t)::text ILIKE '%' || $2 || '%' OR to_jsonb(t)::text ILIKE '%Luis%'
                OR to_jsonb(t)::text ILIKE '%Ejemplo Sintético%' OR to_jsonb(t)::text ILIKE '%' || $3 || '%')`,
        [patientId, MARK, patientEmail],
      );
      if ((rows[0]?.n ?? 0) > 0) leaks.push(table);
    }
    expect(leaks).toEqual([]);
  });

  it('cada columna que se vacía queda vacía o con su texto fijo', async () => {
    const dirty: string[] = [];
    for (const { table, where } of patientTables()) {
      for (const [name, rule] of Object.entries(COLUMNS)) {
        if (rule !== CLEAR || !name.startsWith(`${table}.`)) continue;
        const column = name.slice(table.length + 1);
        const rows = await owner<{ n: number }>(
          `SELECT count(*)::int AS n FROM ${table} t WHERE ${where}
             AND t.${column} IS NOT NULL AND t.${column}::text <> ALL($2::text[])
             AND t.${column}::text NOT LIKE 'anonimizado-%'`,
          [patientId, PLACEHOLDERS],
        );
        if ((rows[0]?.n ?? 0) > 0) dirty.push(name);
      }
    }
    expect(dirty).toEqual([]);
  });

  it('la ficha: «Anonimizado», solo el año de nacimiento, sin documento, teléfono ni correo, y archivado', async () => {
    const [patient] = await owner<Record<string, unknown>>(
      `SELECT first_name, last_name, birth_date::text AS birth_date, document_number_enc, phone_enc, email, status,
              anonymized_at IS NOT NULL AS anonymized, user_id
       FROM clinical.patient WHERE id = $1`,
      [patientId],
    );
    expect(patient).toEqual({
      first_name: 'Anonimizado',
      last_name: 'Anonimizado',
      birth_date: '1998-01-01',
      document_number_enc: null,
      phone_enc: null,
      email: null,
      status: 'ARCHIVED',
      anonymized: true,
      user_id: null,
    });
    const shown = await harness.get(`/patients/${patientId}`, ownerCookie);
    const body = shown.body as { firstName: string; anonymizedAt: string | null };
    expect(body.firstName).toBe('Anonimizado');
    expect(typeof body.anonymizedAt).toBe('string');
  });

  it('no deja ninguno de sus archivos: fotos, expediente, fichas ni exportaciones', async () => {
    const files = await owner<{ purpose: string; deleted: boolean }>(
      `SELECT purpose, deleted_at IS NOT NULL AS deleted FROM platform.file_object WHERE patient_id = $1`,
      [patientId],
    );
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.filter((f) => !f.deleted)).toEqual([]);
    expect(files.some((f) => f.purpose === 'RECORD_DOCUMENT')).toBe(true);
    expect(files.some((f) => f.purpose === 'PATIENT_EXPORT')).toBe(true);
  });

  it('su cuenta queda desactivada, sin correo ni nombre, y ya no entra', async () => {
    const [account] = await owner<{
      email: string;
      display_name: string;
      status: string;
      sessions: number;
    }>(
      `SELECT email, display_name, status,
              (SELECT count(*)::int FROM iam.session s WHERE s.user_id = u.id) AS sessions
       FROM iam.user_account u WHERE id = $1`,
      [patientUserId],
    );
    expect(account).toEqual({
      email: `anonimizado-${patientUserId}@anonimizado.invalid`,
      display_name: 'Anonimizado',
      status: 'DISABLED',
      sessions: 0,
    });
    const login = await harness.post('/auth/login', { email: patientEmail, password: PASSWORD });
    expect(login.status).toBe(401);
    const [invitation] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM iam.invitation WHERE patient_id = $1 AND email NOT LIKE 'anonimizado-%'`,
      [patientId],
    );
    expect(invitation?.n).toBe(0);
  });

  it('no se reactiva ni se suprime dos veces, y la auditoría lo registra', async () => {
    const reactivated = await harness.post(`/patients/${patientId}/reactivate`, undefined, cookie);
    expect(reactivated.status).toBe(409);
    expect(reactivated.body).toMatchObject({ code: 'NC-CLI-048', rule: 'RN-B05' });
    const [{ code } = { code: '' }] = await owner<{ code: string }>(
      `SELECT code FROM clinical.patient WHERE id = $1`,
      [patientId],
    );
    const twice = await harness.post(`/patients/${patientId}/anonymize`, { code }, ownerCookie);
    expect(twice.status).toBe(409);
    await harness.deliver('audit.events');
    const [audited] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit.audit_log
       WHERE action = 'UPDATE' AND resource_type = 'clinical.patient' AND resource_id = $1
         AND actor_user_id = $2 AND 'anonymized_at' = ANY(changed_fields)`,
      [patientId, org.staff.owner.userId],
    );
    expect(audited?.n).toBe(1);
  });

  it('en la base: nadie más llama a la supresión ni se salta lo inmutable con la variable', async () => {
    const client = await pool('user').connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.org_id', $1, true), set_config('app.user_id', $2, true),
                set_config('app.role', 'PROFESSIONAL', true), set_config('app.member_id', $3, true)`,
        [org.organizationId, org.staff.responsible.userId, org.staff.responsible.memberId],
      );
      await client.query('SAVEPOINT a');
      await expect(
        client.query(`SELECT * FROM clinical.anonymize_patient($1)`, [patientId]),
      ).rejects.toThrow(/Solo el dueño/);
      await client.query('ROLLBACK TO SAVEPOINT a');
      await client.query(`SELECT set_config('app.anonymizing', 'on', true)`);
      await expect(
        client.query(
          `UPDATE training.program SET name = 'Otro' WHERE patient_id = $1 AND status = 'PUBLISHED'`,
          [patientId],
        ),
      ).rejects.toThrow(/inmutable|RN-F12|RN-E15|publicado/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

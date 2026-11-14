import { createHash, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  anonymousContext,
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  systemContext,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type Id,
  type IdGenerator,
  type OrganizationId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import {
  ImportBatchStore,
  ImportRecordStore,
  parseCsv,
  type ImportedEntity,
  type ImportOrigin,
} from '../../../platform/index.js';
import { EvaluationImportCommands } from '../../assessment/index.js';
import { PatientImportCommands, type PatientImportInput } from '../../clinical/index.js';
import { IamApi } from '../../iam/index.js';
import { ImportedPlanCommands, type ImportedPlanInput } from '../../nutrition/index.js';
import { TenancyApi } from '../../tenancy/index.js';
import {
  instantAt,
  localDateIn,
  pickSample,
  readTemplate,
  type ImportableEvaluation,
  type RowMessages,
  type TemplateInput,
} from '../domain/account-import.js';
import {
  TEMPLATE_FILES,
  type PatientRow,
  type PlanRow,
  type TemplateFile,
} from '../domain/account-template.js';

export interface AccountFile {
  readonly name: string;
  readonly content: Uint8Array;
}

export interface AccountImportRequest {
  readonly organizationId: OrganizationId;
  /** El correo de la cuenta del nutricionista, miembro activo de la organización: queda como responsable y autor. */
  readonly accountEmail: string;
  /** El correo del administrador de plataforma que corre la importación: queda en cada lote. */
  readonly adminEmail: string;
  /** null: el archivo no está en la carpeta. */
  readonly files: Readonly<Record<TemplateFile, AccountFile | null>>;
  /** Solo valida y cuenta lo que ya entró: no escribe nada. */
  readonly dryRun: boolean;
  /** Cuántas filas de cada tipo se vuelven a leer en el muestreo. */
  readonly sampleSize: number;
}

export type FileStatus = 'VALIDATED' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';

/** Lo que pasó con cada archivo (RN-I05): nunca nombres ni documentos, solo números de fila e id_origen. */
export interface FileReport {
  readonly file: TemplateFile;
  readonly fileName: string | null;
  /** null en la validación: no se escribe el lote. */
  readonly batchId: string | null;
  readonly status: FileStatus;
  readonly total: number;
  /** Entraron en esta corrida (en la validación, las que entrarían). */
  readonly created: number;
  /** Ya habían entrado: no se tocaron. */
  readonly already: number;
  readonly failed: number;
  readonly errors: readonly RowMessages[];
  readonly warnings: readonly RowMessages[];
}

/** Los conteos contra la base: las filas del archivo que tienen su registro de importación. */
export interface CountCheck {
  readonly entity: ImportedEntity;
  readonly expected: number;
  readonly inDatabase: number;
  readonly ok: boolean;
}

/** El muestreo: filas al azar vueltas a leer campo por campo. */
export interface SampleCheck {
  readonly entity: ImportedEntity;
  readonly checked: number;
  readonly mismatches: readonly {
    readonly externalId: string;
    readonly fields: readonly string[];
  }[];
}

export interface AccountReport {
  readonly dryRun: boolean;
  readonly organizationId: string;
  readonly accountMemberId: string;
  readonly files: readonly FileReport[];
  readonly counts: readonly CountCheck[];
  readonly samples: readonly SampleCheck[];
  /** Sin errores de fila, con los conteos cuadrados y el muestreo sin diferencias. */
  readonly ok: boolean;
}

const KINDS: Readonly<Record<TemplateFile, string>> = {
  pacientes: 'ACCOUNT_PATIENTS',
  evaluaciones: 'ACCOUNT_EVALUATIONS',
  tomas: 'ACCOUNT_MEASUREMENTS',
  planes: 'ACCOUNT_PLANS',
};

/** Los primeros errores van al lote; el informe los trae todos. */
const MAX_STORED_ERRORS = 100;

type Outcome =
  | { readonly kind: 'CREATED' | 'ALREADY'; readonly id: string }
  | { readonly kind: 'ERROR'; readonly messages: readonly string[] };

const describe = (error: DomainError): string =>
  `${error.message} (${error.code}${error.rule ? `, ${error.rule}` : ''})`;

/** Un error técnico, sin su mensaje: el de la base puede traer valores de la fila. */
const technical = (error: unknown): string => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : 'desconocido';
  return `No se pudo guardar: error técnico (${code}).`;
};

const random = (): number => randomInt(0, 2 ** 30) / 2 ** 30;

/**
 * La migración de una cuenta de nutricionista (RF-40, RN-I05; ADR-135): valida la carpeta, importa cada paciente con su
 * consentimiento, cada evaluación con sus tomas y cada plan, cada fila en su transacción y con su registro de importación, y arma el
 * informe con los conteos contra la base y un muestreo. Correrla dos veces no duplica: lo que ya entró se salta.
 */
@Injectable()
export class AccountImporter {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly iam: IamApi,
    private readonly tenancy: TenancyApi,
    private readonly patients: PatientImportCommands,
    private readonly evaluations: EvaluationImportCommands,
    private readonly plans: ImportedPlanCommands,
    private readonly batches: ImportBatchStore,
    private readonly records: ImportRecordStore,
  ) {}

  async run(request: AccountImportRequest): Promise<Result<AccountReport, string>> {
    const organizationId = request.organizationId;
    const admin = await this.uow.query(anonymousContext(), () =>
      this.iam.activePlatformAdmin(request.adminEmail),
    );
    if (!admin)
      return err(
        `«${request.adminEmail}» no es la cuenta activa de un administrador de plataforma.`,
      );
    const userId = await this.uow.query(anonymousContext(), () =>
      this.iam.activeAccount(request.accountEmail),
    );
    const found = await this.uow.query(systemContext(organizationId), async () => ({
      organization: await this.tenancy.organization(organizationId),
      member: userId ? await this.tenancy.activeMemberOfUser(organizationId, userId) : null,
    }));
    if (!found.organization) return err(`No existe la organización ${organizationId}.`);
    if (!userId || !found.member) {
      return err(`«${request.accountEmail}» no es un miembro activo de esa organización.`);
    }
    const context: SecurityContext = {
      organizationId,
      userId,
      role: found.member.role,
      patientId: null,
      memberId: found.member.memberId as Id<'MemberId'>,
    };
    const timeZone = found.organization.timezone;
    const template = readTemplate(
      this.#inputOf(request.files),
      localDateIn(this.clock.now(), timeZone),
    );
    const accountMemberId = found.member.memberId;
    const before = await this.#imported(context, accountMemberId);

    if (request.dryRun) {
      const files = TEMPLATE_FILES.map((file) =>
        this.#dryRunReport(file, request.files[file], template, before),
      );
      return ok({
        dryRun: true,
        organizationId,
        accountMemberId,
        files,
        counts: [],
        samples: [],
        ok: files.every((f) => f.errors.length === 0),
      });
    }

    const batchIds = Object.fromEntries(
      TEMPLATE_FILES.map((file) => [file, this.ids.newId<'ImportBatchId'>() as string]),
    ) as Record<TemplateFile, string>;
    const origin = (file: TemplateFile, externalId: string): ImportOrigin => ({
      accountMemberId,
      externalId,
      batchId: batchIds[file],
    });
    const startedAt = this.clock.now();

    const patientInputs = new Map<string, PatientImportInput>();
    const patientOutcomes = new Map<string, Outcome>();
    const warnings: RowMessages[] = [];
    for (const row of template.patients) {
      const input = this.#patientInput(row, origin('pacientes', row.externalId));
      patientInputs.set(row.externalId, input);
      const outcome = await this.#attempt(() => this.patients.importPatient(context, input));
      patientOutcomes.set(row.externalId, outcome.outcome);
      if (outcome.healthData === 'NOT_GIVEN') {
        warnings.push({
          row: row.row,
          messages: [
            'Sin consentimiento de datos de salud: sus evaluaciones y planes no entran hasta registrarlo en la app.',
          ],
        });
      } else if (outcome.healthData === 'MINOR') {
        warnings.push({
          row: row.row,
          messages: [
            'Tenía menos de 14 años al consentir: solo vale el papel firmado por su tutor. Regístralo en la app con el escaneo.',
          ],
        });
      }
    }
    const patientOf = (externalId: string): Outcome => {
      const outcome = patientOutcomes.get(externalId);
      return outcome && outcome.kind !== 'ERROR'
        ? outcome
        : { kind: 'ERROR', messages: [`Su paciente (id_origen ${externalId}) no entró.`] };
    };

    const evaluationOutcomes = new Map<string, Outcome>();
    const evaluationInputs = new Map<string, ImportableEvaluation & { patientId: string }>();
    for (const row of template.evaluations) {
      const patient = patientOf(row.patientExternalId);
      if (patient.kind === 'ERROR') {
        evaluationOutcomes.set(row.externalId, patient);
        continue;
      }
      evaluationInputs.set(row.externalId, { ...row, patientId: patient.id });
      const outcome = await this.#attempt(() =>
        this.evaluations.importEvaluation(context, {
          origin: origin('evaluaciones', row.externalId),
          ...this.#evaluationInput(row, patient.id, timeZone),
        }),
      );
      evaluationOutcomes.set(row.externalId, outcome.outcome);
    }

    const planOutcomes = new Map<string, Outcome>();
    const planInputs = new Map<string, Omit<ImportedPlanInput, 'origin'>>();
    for (const row of template.plans) {
      const patient = patientOf(row.patientExternalId);
      if (patient.kind === 'ERROR') {
        planOutcomes.set(row.externalId, patient);
        continue;
      }
      const input = this.#planInput(row, patient.id);
      planInputs.set(row.externalId, input);
      const outcome = await this.#attempt(() =>
        this.plans.importPlan(context, { ...input, origin: origin('planes', row.externalId) }),
      );
      planOutcomes.set(row.externalId, outcome.outcome);
    }

    const files: FileReport[] = [
      this.#fileReport(
        'pacientes',
        request,
        batchIds,
        template,
        template.patients,
        patientOutcomes,
        warnings,
      ),
      this.#fileReport(
        'evaluaciones',
        request,
        batchIds,
        template,
        template.evaluations,
        evaluationOutcomes,
        [],
      ),
      this.#measurementsReport(request, batchIds, template, evaluationOutcomes),
      this.#fileReport('planes', request, batchIds, template, template.plans, planOutcomes, []),
    ];
    await this.uow.run(context, async () => {
      for (const report of files) {
        const file = request.files[report.file];
        await this.batches.insert({
          id: batchIds[report.file],
          organizationId,
          kind: KINDS[report.file],
          fileName: report.fileName ?? `${report.file}.csv`,
          fileSha256: createHash('sha256')
            .update(file?.content ?? new Uint8Array())
            .digest(),
          status: report.status === 'VALIDATED' ? 'COMPLETED' : report.status,
          rowsTotal: report.total,
          rowsOk: report.created + report.already,
          rowsFailed: report.failed,
          errors: report.errors.slice(0, MAX_STORED_ERRORS),
          startedBy: admin,
          startedAt,
          finishedAt: this.clock.now(),
        });
      }
    });

    const after = await this.#imported(context, accountMemberId);
    const counts: CountCheck[] = [
      this.#count('PATIENT', files[0], template.patients, after.PATIENT),
      this.#count('EVALUATION', files[1], template.evaluations, after.EVALUATION),
      this.#count('PLAN', files[3], template.plans, after.PLAN),
    ];
    const samples: SampleCheck[] = [
      await this.#sample('PATIENT', patientOutcomes, request.sampleSize, (id, externalId) => {
        const input = patientInputs.get(externalId);
        return input ? this.patients.verify(context, id, input) : Promise.resolve(['fila']);
      }),
      await this.#sample('EVALUATION', evaluationOutcomes, request.sampleSize, (id, externalId) => {
        const row = evaluationInputs.get(externalId);
        return row
          ? this.evaluations.verify(
              context,
              id,
              this.#evaluationInput(row, row.patientId, timeZone),
            )
          : Promise.resolve(['fila']);
      }),
      await this.#sample('PLAN', planOutcomes, request.sampleSize, (id, externalId) => {
        const input = planInputs.get(externalId);
        return input ? this.plans.verify(context, id, input) : Promise.resolve(['fila']);
      }),
    ];
    return ok({
      dryRun: false,
      organizationId,
      accountMemberId,
      files,
      counts,
      samples,
      ok:
        files.every((f) => f.errors.length === 0) &&
        counts.every((c) => c.ok) &&
        samples.every((s) => s.mismatches.length === 0),
    });
  }

  #inputOf(files: AccountImportRequest['files']): TemplateInput {
    const read = (file: TemplateFile): TemplateInput[TemplateFile] => {
      const found = files[file];
      if (!found) return { error: `Falta ${file}.csv en la carpeta.` };
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(found.content);
      } catch {
        return { error: 'El archivo no está en UTF-8: guárdalo como «CSV UTF-8».' };
      }
      const records = parseCsv(text);
      if (!records.ok) {
        return { error: `Fila ${String(records.error.row)}: ${records.error.message}` };
      }
      return { records: records.value };
    };
    return {
      pacientes: read('pacientes'),
      evaluaciones: read('evaluaciones'),
      tomas: read('tomas'),
      planes: read('planes'),
    };
  }

  #imported(
    context: SecurityContext,
    accountMemberId: string,
  ): Promise<Record<ImportedEntity, ReadonlyMap<string, string>>> {
    const organizationId = context.organizationId as OrganizationId;
    return this.uow.query(context, async () => ({
      PATIENT: await this.records.list(organizationId, accountMemberId, 'PATIENT'),
      EVALUATION: await this.records.list(organizationId, accountMemberId, 'EVALUATION'),
      PLAN: await this.records.list(organizationId, accountMemberId, 'PLAN'),
    }));
  }

  async #attempt(
    work: () => Promise<
      Result<{ id: string; created: boolean; healthData?: string | null }, DomainError>
    >,
  ): Promise<{ outcome: Outcome; healthData: string | null }> {
    try {
      const result = await work();
      if (!result.ok)
        return { outcome: { kind: 'ERROR', messages: [describe(result.error)] }, healthData: null };
      return {
        outcome: { kind: result.value.created ? 'CREATED' : 'ALREADY', id: result.value.id },
        healthData: result.value.healthData ?? null,
      };
    } catch (error) {
      return { outcome: { kind: 'ERROR', messages: [technical(error)] }, healthData: null };
    }
  }

  #patientInput(row: PatientRow, origin: ImportOrigin): PatientImportInput {
    return {
      origin,
      patient: {
        firstName: row.firstName,
        lastName: row.lastName,
        sex: row.sex,
        birthDate: row.birthDate,
        document: row.document,
        email: row.email,
        phone: row.phone,
        population: row.population,
      },
      active: row.active,
      healthDataConsentDate: row.healthDataConsentDate,
    };
  }

  #evaluationInput(row: ImportableEvaluation, patientId: string, timeZone: string) {
    return {
      patientId,
      level: row.level,
      measuredAt: instantAt(row.localDate, row.minutesOfDay, timeZone),
      fasting: row.fasting,
      intenseActivityLast24h: row.intenseActivityLast24h,
      measurements: row.measurements.map((m) => ({
        siteCode: m.siteCode,
        attempts: m.attempts,
        side: m.side,
      })),
    };
  }

  #planInput(row: PlanRow, patientId: string): Omit<ImportedPlanInput, 'origin'> {
    return {
      patientId,
      validFrom: row.validFrom,
      validTo: row.validTo,
      targetKcal: row.targetKcal,
      targetProteinG: row.targetProteinG,
      targetFatG: row.targetFatG,
      targetChoG: row.targetChoG,
      hydrationTargetMl: row.hydrationTargetMl,
      instructions: row.instructions,
    };
  }

  #fileReport(
    file: TemplateFile,
    request: AccountImportRequest,
    batchIds: Record<TemplateFile, string>,
    template: ReturnType<typeof readTemplate>,
    rows: readonly { readonly row: number; readonly externalId: string }[],
    outcomes: ReadonlyMap<string, Outcome>,
    warnings: readonly RowMessages[],
  ): FileReport {
    let created = 0;
    let already = 0;
    const errors: RowMessages[] = [...template.errors[file]];
    for (const row of rows) {
      const outcome = outcomes.get(row.externalId);
      if (outcome?.kind === 'CREATED') created += 1;
      else if (outcome?.kind === 'ALREADY') already += 1;
      else {
        const messages = outcome?.kind === 'ERROR' ? outcome.messages : ['No se procesó.'];
        errors.push({ row: row.row, messages });
      }
    }
    return this.#closeReport(
      file,
      request,
      batchIds[file],
      template.totals[file],
      created,
      already,
      errors,
      warnings,
    );
  }

  /** Las tomas cuentan con su evaluación: entran, ya estaban o fallan con ella. */
  #measurementsReport(
    request: AccountImportRequest,
    batchIds: Record<TemplateFile, string>,
    template: ReturnType<typeof readTemplate>,
    evaluations: ReadonlyMap<string, Outcome>,
  ): FileReport {
    let created = 0;
    let already = 0;
    const errors: RowMessages[] = [...template.errors.tomas];
    for (const evaluation of template.evaluations) {
      const outcome = evaluations.get(evaluation.externalId);
      for (const measurement of evaluation.measurements) {
        if (outcome?.kind === 'CREATED') created += 1;
        else if (outcome?.kind === 'ALREADY') already += 1;
        else {
          errors.push({
            row: measurement.row,
            messages: [`Su evaluación (id_origen ${evaluation.externalId}) no entró.`],
          });
        }
      }
    }
    return this.#closeReport(
      'tomas',
      request,
      batchIds.tomas,
      template.totals.tomas,
      created,
      already,
      errors,
      [],
    );
  }

  #closeReport(
    file: TemplateFile,
    request: AccountImportRequest,
    batchId: string | null,
    total: number,
    created: number,
    already: number,
    errors: RowMessages[],
    warnings: readonly RowMessages[],
  ): FileReport {
    errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
    const fileError = errors.some((e) => e.row === null);
    const failed = Math.max(errors.filter((e) => e.row !== null).length, fileError ? total : 0);
    const status: FileStatus =
      batchId === null
        ? 'VALIDATED'
        : fileError || (total > 0 && created + already === 0)
          ? 'FAILED'
          : errors.length > 0
            ? 'COMPLETED_WITH_ERRORS'
            : 'COMPLETED';
    return {
      file,
      fileName: request.files[file]?.name ?? null,
      batchId,
      status,
      total,
      created,
      already,
      failed,
      errors,
      warnings,
    };
  }

  #dryRunReport(
    file: TemplateFile,
    found: AccountFile | null,
    template: ReturnType<typeof readTemplate>,
    before: Record<ImportedEntity, ReadonlyMap<string, string>>,
  ): FileReport {
    const ids = (entity: ImportedEntity, rows: readonly { externalId: string }[]) => {
      const already = rows.filter((r) => before[entity].has(r.externalId)).length;
      return { already, created: rows.length - already };
    };
    const counts =
      file === 'pacientes'
        ? ids('PATIENT', template.patients)
        : file === 'evaluaciones'
          ? ids('EVALUATION', template.evaluations)
          : file === 'planes'
            ? ids('PLAN', template.plans)
            : {
                already: template.evaluations
                  .filter((e) => before.EVALUATION.has(e.externalId))
                  .reduce((sum, e) => sum + e.measurements.length, 0),
                created: template.evaluations
                  .filter((e) => !before.EVALUATION.has(e.externalId))
                  .reduce((sum, e) => sum + e.measurements.length, 0),
              };
    const errors = [...template.errors[file]];
    return {
      file,
      fileName: found?.name ?? null,
      batchId: null,
      status: 'VALIDATED',
      total: template.totals[file],
      created: counts.created,
      already: counts.already,
      failed: Math.max(
        errors.filter((e) => e.row !== null).length,
        errors.some((e) => e.row === null) ? template.totals[file] : 0,
      ),
      errors,
      warnings: [],
    };
  }

  #count(
    entity: ImportedEntity,
    report: FileReport | undefined,
    rows: readonly { readonly externalId: string }[],
    imported: ReadonlyMap<string, string>,
  ): CountCheck {
    const expected = (report?.created ?? 0) + (report?.already ?? 0);
    const inDatabase = rows.filter((row) => imported.has(row.externalId)).length;
    const total = report ? report.created + report.already + report.failed : 0;
    return {
      entity,
      expected,
      inDatabase,
      ok: inDatabase === expected && total === (report?.total ?? 0),
    };
  }

  async #sample(
    entity: ImportedEntity,
    outcomes: ReadonlyMap<string, Outcome>,
    size: number,
    verify: (id: string, externalId: string) => Promise<readonly string[]>,
  ): Promise<SampleCheck> {
    const imported = [...outcomes.entries()].flatMap(([externalId, outcome]) =>
      outcome.kind === 'ERROR' ? [] : [{ externalId, id: outcome.id }],
    );
    const sample = pickSample(imported, size, random);
    const mismatches: { externalId: string; fields: readonly string[] }[] = [];
    for (const { externalId, id } of sample) {
      const fields = await verify(id, externalId);
      if (fields.length > 0) mismatches.push({ externalId, fields });
    }
    return { entity, checked: sample.length, mismatches };
  }
}

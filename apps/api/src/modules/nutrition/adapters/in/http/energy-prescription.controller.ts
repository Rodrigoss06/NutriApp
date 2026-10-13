import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  HttpCode,
  HttpStatus,
  Query,
  Req,
} from '@nestjs/common';
import {
  createEnergyPrescriptionSchema,
  type EnergyBasisResponse,
  type EnergyPrescription,
  type EnergyPrescriptionListResponse,
  type EnergyPrescriptionPreview,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import {
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../../../clinical/index.js';
import { EnergyPrescriptionCommands } from '../../../application/commands/energy-prescription.commands.js';
import type { EnergyComponent } from '../../../application/energy-calculation.js';
import type { EnergyPrescriptionRecord } from '../../../application/ports/nutrition.ports.js';
import { EnergyPrescriptionQueries } from '../../../application/queries/energy-prescription.queries.js';
import { NO_CLOSED_EVALUATION, PRESCRIPTION_NOT_FOUND } from '../../../domain/energy-rules.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PRESCRIPTION_NOT_FOUND.code]: 404,
  [PATIENT_NOT_FOUND.code]: 404,
  [PATIENT_ARCHIVED.code]: 409,
  [WRITE_ACCESS_REQUIRED.code]: 403,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);
const notFound = (code = PATIENT_NOT_FOUND.code) =>
  new ProblemException(404, { title: 'No encontrado.', code });

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

const num = (component: EnergyComponent, key: string): number => {
  const value = component.outputs[key];
  if (typeof value !== 'number') throw new Error(`Salida ${key} sin número.`);
  return value;
};

const envelope = (component: EnergyComponent) => ({
  methodCode: component.methodCode,
  methodVersion: component.methodVersion,
  inputsHash: component.inputsHash,
  warnings: component.warnings.map((warning) => ({ ...warning })),
});

/** La prescripción con cada componente y su método (RN-D02), con los valores sin redondear (RN-D09). */
function previewOf(record: EnergyPrescriptionRecord): EnergyPrescriptionPreview {
  const { rmr, exercise, tee, adjustment, projection, macros } = record.components;
  const burned = (exercise.outputs.activities ?? []) as {
    grossKcalPerSession: number;
    netKcalPerSession: number;
  }[];
  return {
    patientId: record.patientId,
    evaluationId: record.evaluationId,
    calculationResultId: record.calculationResultId,
    sex: record.sex,
    ageYears: record.ageYears,
    weightKg: record.weightKg,
    heightCm: record.heightCm,
    fatFreeMassKg: record.fatFreeMassKg,
    fatFreeMassMethodCode: record.ffmMethodCode,
    rmr: { ...envelope(rmr), rmrKcal: num(rmr, 'rmrKcal') },
    strategy: record.strategy,
    pal: record.pal,
    exercise: {
      ...envelope(exercise),
      activities: record.activities.map((activity, index) => ({
        activityCode: activity.activityCode,
        descriptionEs: activity.descriptionEs,
        met: activity.met,
        minutesPerSession: activity.minutes,
        sessionsPerWeek: activity.sessionsPerWeek,
        grossKcalPerSession: burned[index]?.grossKcalPerSession ?? 0,
        netKcalPerSession: burned[index]?.netKcalPerSession ?? 0,
      })),
      dailyAverageNetKcal: num(exercise, 'dailyAverageNetKcal'),
    },
    tee: {
      ...envelope(tee),
      baseKcal: num(tee, 'baseKcal'),
      exerciseKcal: num(tee, 'exerciseKcal'),
      teeKcal: num(tee, 'teeKcal'),
    },
    goal: record.goal,
    adjustment: {
      ...envelope(adjustment),
      kind: record.adjustmentKind,
      adjustmentKcal: -num(adjustment, 'deficitKcal'),
      fatKgPerMonth: record.fatKgPerMonth,
      weeklyRatePct: num(adjustment, 'weeklyRatePct'),
    },
    targetKcal: num(adjustment, 'targetKcal'),
    projection: projection
      ? {
          ...envelope(projection),
          kind: 'INITIAL_ESTIMATE',
          targetFatPct: Number(projection.inputs.targetFatPct),
          targetWeightKg: num(projection, 'targetWeightKg'),
          weightChangeKg: num(projection, 'weightChangeKg'),
          monthsToTarget:
            typeof projection.outputs.monthsToTarget === 'number'
              ? projection.outputs.monthsToTarget
              : null,
          estimatedDate: projection.estimatedDate,
        }
      : null,
    macros: {
      ...envelope(macros),
      proteinGPerKg: record.proteinGPerKg,
      fatPctKcal: record.fatPctKcal,
      proteinG: num(macros, 'proteinG'),
      fatG: num(macros, 'fatG'),
      choG: num(macros, 'choG'),
    },
    engineVersion: record.engineVersion,
    inputsHash: record.inputsHash,
  };
}

const prescriptionOf = (record: EnergyPrescriptionRecord): EnergyPrescription => ({
  ...previewOf(record),
  id: record.id,
  createdBy: record.createdBy,
  createdAt: record.createdAt.toISOString(),
});

/** Prescripción energética de un paciente (RF-17): base con las cinco TMR, vista previa, crear y listar. */
@Controller('patients/:patientId')
export class PatientEnergyController {
  constructor(
    private readonly commands: EnergyPrescriptionCommands,
    private readonly queries: EnergyPrescriptionQueries,
  ) {}

  @Get('energy-basis')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async basis(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('evaluationId') evaluationId: string | undefined,
  ): Promise<EnergyBasisResponse> {
    if (evaluationId !== undefined && !/^[0-9a-f-]{36}$/i.test(evaluationId)) throw notFound();
    const view = await this.queries.basis(contextOf(request), patientId, evaluationId ?? null);
    if (!view) throw notFound();
    if (view === 'NO_EVALUATION') throw problem(NO_CLOSED_EVALUATION);
    const { basis } = view;
    return {
      evaluation: {
        id: basis.evaluationId,
        measuredAt: basis.measuredAt.toISOString(),
        level: basis.level,
      },
      sex: basis.sex,
      ageYears: basis.ageYears,
      population: basis.population,
      weightKg: basis.weightKg,
      heightCm: basis.heightCm,
      fatFreeMass: basis.fatFreeMass ? { ...basis.fatFreeMass } : null,
      rmrOptions: view.rmrOptions.map((option) => ({
        ...option,
        issues: option.issues.map((issue) => ({ ...issue })),
      })),
      preferredRmrMethodCode:
        view.preferredRmrMethodCode as EnergyBasisResponse['preferredRmrMethodCode'],
    };
  }

  @Post('energy-prescriptions/preview')
  @RequirePermission('patients.read')
  @HttpCode(HttpStatus.OK)
  async preview(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<EnergyPrescriptionPreview> {
    const input = parseBody(createEnergyPrescriptionSchema, body);
    const result = await this.queries.preview(contextOf(request), patientId, input);
    if (!result) throw notFound();
    if (isErr(result)) throw problem(result.error);
    return previewOf(result.value.record);
  }

  @Post('energy-prescriptions')
  @RequirePermission('patients.write')
  async create(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<EnergyPrescription> {
    const context = contextOf(request);
    const result = await this.commands.create(
      context,
      patientId,
      parseBody(createEnergyPrescriptionSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    const record = await this.queries.get(context, result.value.id);
    if (!record) throw notFound(PRESCRIPTION_NOT_FOUND.code);
    return prescriptionOf(record);
  }

  @Get('energy-prescriptions')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<EnergyPrescriptionListResponse> {
    const records = await this.queries.list(contextOf(request), patientId);
    if (!records) throw notFound();
    return {
      prescriptions: records.map((record) => ({
        id: record.id,
        evaluationId: record.evaluationId,
        createdAt: record.createdAt.toISOString(),
        goal: record.goal,
        rmrMethodCode: record.components.rmr
          .methodCode as EnergyPrescriptionListResponse['prescriptions'][number]['rmrMethodCode'],
        teeKcal: num(record.components.tee, 'teeKcal'),
        targetKcal: num(record.components.adjustment, 'targetKcal'),
      })),
    };
  }
}

/** Una prescripción guardada (RN-D01): cada componente con su método e insumos con su hash. */
@Controller('energy-prescriptions')
export class EnergyPrescriptionController {
  constructor(private readonly queries: EnergyPrescriptionQueries) {}

  @Get(':id')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async get(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EnergyPrescription> {
    const record = await this.queries.get(contextOf(request), id);
    if (!record) throw notFound(PRESCRIPTION_NOT_FOUND.code);
    return prescriptionOf(record);
  }
}

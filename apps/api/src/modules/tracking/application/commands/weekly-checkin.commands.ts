import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import { ContentApi } from '../../../content/index.js';
import { METRIC_OUT_OF_RANGE, WEIGHT_LOG_DISABLED } from '../../domain/tracking-errors.js';
import { weeklyCheckinProblem } from '../../domain/weekly-checkin.js';
import { RECORD_STORE, type RecordStore } from '../ports/records.ports.js';
import {
  WEEKLY_CHECKIN_STORE,
  type StoredWeeklyCheckin,
  type WeeklyCheckinStore,
} from '../ports/weekly-checkin.ports.js';
import { patientOf, RecordGate, type Logged, type PatientContext } from './record-gate.js';
import { itemClientId } from './record.commands.js';

export interface WeeklyCheckinInput {
  readonly clientId: string;
  /** El domingo de la semana. */
  readonly weekDate: string;
  readonly nutritionCompliancePct: number;
  readonly bodyWeightKg: number | null;
  readonly comment: string | null;
}

/** El peso y el comentario son registros propios: su clientId sale del del check-in, siempre igual (RN-G08). */
const WEIGHT_ITEM = 1;
const NOTE_ITEM = 2;

/**
 * El check-in de la semana (P14.5, PR 5a; P-21 y P-22; ADR-109): el paciente declara su alimentación de la semana y, si quiere,
 * su peso y un comentario, del domingo al martes siguiente. Todo en una transacción:
 * - el peso queda como su medida BODY_WEIGHT del día en que lo envía, con las mismas reglas que el peso en casa (su app debe
 *   permitirlo y va de 20 a 300 kg, RN-C04);
 * - el comentario queda como una nota del paciente sin leer para su equipo (RN-G13);
 * - enviarlo otra vez dentro del plazo lo corrige: anula el anterior y su peso, nunca los borra (RN-G12). Una nota no se anula.
 * Exige HEALTH_DATA vigente (RN-B01) y no duplica un clientId (RN-G08). El control semanal lee la alimentación (P-22).
 */
@Injectable()
export class WeeklyCheckinCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(RECORD_STORE) private readonly records: RecordStore,
    @Inject(WEEKLY_CHECKIN_STORE) private readonly store: WeeklyCheckinStore,
    @Inject(RecordGate) private readonly gate: RecordGate,
    @Inject(ContentApi) private readonly content: ContentApi,
  ) {}

  log(
    context: SecurityContext,
    input: WeeklyCheckinInput,
  ): Promise<Result<Logged<StoredWeeklyCheckin>, DomainError>> {
    const patient = patientOf(context);
    return atomically<Logged<StoredWeeklyCheckin>>(this.uow, context, async () => {
      const lookup = () => this.store.byClientId(patient.patientId, input.weekDate, input.clientId);
      const replay = await lookup();
      if (replay) return ok({ value: replay, replayed: true });
      const today = await this.gate.today(patient);
      if (!today.ok) return today;
      const problem = weeklyCheckinProblem(input.weekDate, today.value);
      if (problem) return err(problem);
      const open = await this.gate.ensureOpen(patient, today.value);
      if (!open.ok) return open;
      const weight = await this.#weightProblem(patient, input.bodyWeightKg);
      if (weight) return err(weight);

      const previous = await this.store.active(patient.patientId, input.weekDate);
      if (previous) {
        await this.store.void(previous.id, this.clock.now());
        if (previous.metricLogId) {
          await this.records.voidMetric(previous.metricLogId, previous.loggedOn);
          await this.gate.emit(context, 'tracking.metric.voided', previous.metricLogId, {
            patientId: patient.patientId,
            localDate: previous.loggedOn,
          });
        }
      }
      const metricLogId = await this.#logWeight(context, patient, input, today.value);
      const noteId = await this.#logNote(context, patient, input, today.value);
      const id = this.ids.newId<'WeeklyCheckinId'>();
      await this.store.insert({
        id,
        organizationId: patient.organizationId,
        patientId: patient.patientId,
        weekDate: input.weekDate,
        clientId: input.clientId,
        loggedOn: today.value,
        nutritionCompliancePct: input.nutritionCompliancePct,
        metricLogId,
        noteId,
        createdAt: this.clock.now(),
      });
      const stored = await lookup();
      if (!stored) throw new Error('El check-in de la semana no quedó guardado.');
      if (stored.id !== id) return ok({ value: stored, replayed: true });
      await this.gate.emit(context, 'tracking.weeklycheckin.logged', id, {
        patientId: patient.patientId,
        localDate: input.weekDate,
      });
      return ok({ value: stored, replayed: false });
    });
  }

  async #weightProblem(
    patient: PatientContext,
    bodyWeightKg: number | null,
  ): Promise<DomainError | null> {
    if (bodyWeightKg === null) return null;
    if (!(await this.content.allowsWeightLog(patient.patientId))) return WEIGHT_LOG_DISABLED;
    const range = await this.records.metricRange('BODY_WEIGHT');
    if (
      !range ||
      (range.min !== null && bodyWeightKg < range.min) ||
      (range.max !== null && bodyWeightKg > range.max)
    ) {
      return METRIC_OUT_OF_RANGE;
    }
    return null;
  }

  async #logWeight(
    context: SecurityContext,
    patient: PatientContext,
    input: WeeklyCheckinInput,
    today: string,
  ): Promise<string | null> {
    if (input.bodyWeightKg === null) return null;
    const id = this.ids.newId<'MetricLogId'>();
    await this.records.insertMetric({
      organizationId: patient.organizationId,
      patientId: patient.patientId,
      localDate: today,
      clientId: itemClientId(input.clientId, WEIGHT_ITEM),
      id,
      metricCode: 'BODY_WEIGHT',
      value: input.bodyWeightKg,
      measuredAt: this.clock.now(),
    });
    await this.gate.emit(context, 'tracking.metric.logged', id, {
      patientId: patient.patientId,
      localDate: today,
    });
    return id;
  }

  async #logNote(
    context: SecurityContext,
    patient: PatientContext,
    input: WeeklyCheckinInput,
    today: string,
  ): Promise<string | null> {
    if (input.comment === null) return null;
    const id = this.ids.newId<'NoteLogId'>();
    await this.records.insertNote({
      organizationId: patient.organizationId,
      patientId: patient.patientId,
      localDate: today,
      clientId: itemClientId(input.clientId, NOTE_ITEM),
      id,
      body: input.comment,
    });
    await this.gate.emit(context, 'tracking.note.logged', id, {
      patientId: patient.patientId,
      localDate: today,
    });
    return id;
  }
}

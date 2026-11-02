import { Inject, Injectable } from '@nestjs/common';
import { sha256Hex } from '@nutricoach/engine';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import { ContentApi } from '../../../content/index.js';
import { FoodApi } from '../../../food/index.js';
import type { PlanSnapshot } from '../../../nutrition/index.js';
import { TenancyApi } from '../../../tenancy/index.js';
import { localDate as localDateOf } from '../../domain/active-plan.js';
import {
  catalogFoodDraft,
  planDrafts,
  recordWindow,
  type FoodLogDraft,
  type LoggablePlan,
} from '../../domain/records.js';
import {
  FOOD_NOT_FOUND,
  FUTURE_DATE,
  METRIC_OUT_OF_RANGE,
  NO_ACTIVE_PLAN,
  NOT_IN_PLAN,
  RECORD_NOT_FOUND,
  RECORD_VOIDED,
  WEIGHT_LOG_DISABLED,
  WINDOW_CLOSED,
} from '../../domain/tracking-errors.js';
import {
  RECORD_STORE,
  type RecordStore,
  type StoredFoodLog,
  type StoredHydrationLog,
  type StoredMetric,
  type StoredNote,
} from '../ports/records.ports.js';
import {
  trackingEvent,
  type TrackingEventPayload,
  type TrackingEventType,
} from '../tracking-events.js';

/** Lo que el paciente eligió, como llega del contrato (RN-G05). */
export type FoodSource =
  | {
      readonly kind: 'EXCHANGE';
      readonly mealId: string;
      readonly groupCode: string;
      readonly foodId: string;
      readonly servings: number | null;
    }
  | {
      readonly kind: 'FOOD';
      readonly mealId: string;
      readonly foodId: string;
      readonly grams: number | null;
    }
  | { readonly kind: 'MENU'; readonly mealId: string; readonly option: 'A' | 'B' }
  | {
      readonly kind: 'CATALOG';
      readonly mealSlotCode: string;
      readonly foodId: string;
      readonly grams: number;
    };

/** Lo registrado y si ya estaba: un reintento con el mismo clientId devuelve lo de la primera vez (RN-G08). */
export interface Logged<T> {
  readonly value: T;
  readonly replayed: boolean;
}

/** Cuántos registros puede dejar una sola petición: la opción de un menú tiene un registro por alimento o receta. */
const MAX_ITEMS_PER_REQUEST = 50;

/**
 * El clientId del registro n de una misma petición: el primero es el del celular y los demás salen de él, siempre iguales, así un
 * reintento encuentra todos (RN-G08). UUID versión 8 (RFC 9562), hecho con SHA-256.
 */
export function itemClientId(clientId: string, index: number): string {
  if (index === 0) return clientId;
  const hex = sha256Hex(`${clientId}:${String(index)}`);
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

const requestClientIds = (clientId: string): string[] =>
  Array.from({ length: MAX_ITEMS_PER_REQUEST }, (_, index) => itemClientId(clientId, index));

interface PatientContext {
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly userId: UserId;
}

function patientOf(context: SecurityContext): PatientContext {
  if (!context.organizationId || !context.patientId || !context.userId) {
    throw new Error('Un registro necesita la sesión del paciente.');
  }
  return {
    organizationId: context.organizationId,
    patientId: context.patientId,
    userId: context.userId,
  };
}

/**
 * Lo que el paciente registra sobre sí mismo (RN-G01, 02 §7): comida, agua, notas y peso. Cada caso de uso exige HEALTH_DATA
 * vigente (RN-B01), un día dentro de la ventana (RN-G10) y no duplica un clientId (RN-G08). Corregir o anular no borra (RN-G12).
 * Cada registro deja su evento para la analítica (02 §8).
 */
@Injectable()
export class RecordCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(RECORD_STORE) private readonly store: RecordStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(FoodApi) private readonly food: FoodApi,
    @Inject(ContentApi) private readonly content: ContentApi,
  ) {}

  /** Una comida de su plan en tres toques o menos (RN-G06), o algo fuera del plan desde el catálogo (RN-G05). */
  logFood(
    context: SecurityContext,
    input: { readonly clientId: string; readonly localDate: string; readonly source: FoodSource },
  ): Promise<Result<Logged<readonly StoredFoodLog[]>, DomainError>> {
    const patient = patientOf(context);
    return atomically<Logged<readonly StoredFoodLog[]>>(this.uow, context, async () => {
      const replay = await this.#foodReplay(patient.patientId, input.localDate, input.clientId);
      if (replay) return ok({ value: replay, replayed: true });
      const open = await this.#ensureOpen(patient, input.localDate);
      if (!open.ok) return open;
      const drafts = await this.#drafts(patient.patientId, input.localDate, input.source);
      if (!drafts.ok) return drafts;
      const stored = await this.#insertFoods(patient, input, drafts.value);
      return ok({ value: stored, replayed: false });
    });
  }

  /** Corregir: lo anterior queda anulado y lo nuevo, en su mismo día, lo reemplaza (RN-G12). */
  correctFood(
    context: SecurityContext,
    id: string,
    input: { readonly clientId: string; readonly source: FoodSource },
  ): Promise<Result<Logged<readonly StoredFoodLog[]>, DomainError>> {
    const patient = patientOf(context);
    return atomically<Logged<readonly StoredFoodLog[]>>(this.uow, context, async () => {
      const current = await this.store.foodLog(id);
      if (!current) return err(RECORD_NOT_FOUND);
      const replay = await this.#foodReplay(patient.patientId, current.localDate, input.clientId);
      if (replay) return ok({ value: replay, replayed: true });
      if (current.status === 'VOIDED') return err(RECORD_VOIDED);
      const open = await this.#ensureOpen(patient, current.localDate);
      if (!open.ok) return open;
      const drafts = await this.#drafts(patient.patientId, current.localDate, input.source);
      if (!drafts.ok) return drafts;
      const stored = await this.#insertFoods(
        patient,
        { clientId: input.clientId, localDate: current.localDate },
        drafts.value,
      );
      const replacement = stored[0]?.id ?? null;
      await this.store.voidFoodLog(id, current.localDate, replacement);
      await this.#emit(context, 'tracking.food.voided', id, {
        patientId: patient.patientId,
        localDate: current.localDate,
        replacedById: replacement,
      });
      return ok({ value: stored, replayed: false });
    });
  }

  voidFood(context: SecurityContext, id: string): Promise<Result<StoredFoodLog, DomainError>> {
    const patient = patientOf(context);
    return atomically(this.uow, context, async () => {
      const current = await this.store.foodLog(id);
      if (!current) return err(RECORD_NOT_FOUND);
      if (current.status === 'VOIDED') return err(RECORD_VOIDED);
      const open = await this.#ensureOpen(patient, current.localDate);
      if (!open.ok) return open;
      await this.store.voidFoodLog(id, current.localDate, null);
      await this.#emit(context, 'tracking.food.voided', id, {
        patientId: patient.patientId,
        localDate: current.localDate,
        replacedById: null,
      });
      return ok({ ...current, status: 'VOIDED' });
    });
  }

  logHydration(
    context: SecurityContext,
    input: { readonly clientId: string; readonly localDate: string; readonly volumeMl: number },
  ): Promise<Result<Logged<StoredHydrationLog>, DomainError>> {
    const patient = patientOf(context);
    return atomically<Logged<StoredHydrationLog>>(this.uow, context, async () => {
      const lookup = () =>
        this.store.hydrationByClientId(patient.patientId, input.localDate, input.clientId);
      const replay = await lookup();
      if (replay) return ok({ value: replay, replayed: true });
      const open = await this.#ensureOpen(patient, input.localDate);
      if (!open.ok) return open;
      const id = this.ids.newId<'HydrationLogId'>();
      await this.store.insertHydration({
        ...this.#base(patient, input),
        id,
        loggedAt: this.clock.now(),
        volumeMl: input.volumeMl,
      });
      const stored = await lookup();
      if (!stored) throw new Error('El registro de agua no quedó guardado.');
      if (stored.id === id) {
        await this.#emit(context, 'tracking.hydration.logged', id, {
          patientId: patient.patientId,
          localDate: input.localDate,
        });
      }
      return ok({ value: stored, replayed: stored.id !== id });
    });
  }

  voidHydration(
    context: SecurityContext,
    id: string,
  ): Promise<Result<StoredHydrationLog, DomainError>> {
    const patient = patientOf(context);
    return atomically(this.uow, context, async () => {
      const current = await this.store.hydrationLog(id);
      if (!current) return err(RECORD_NOT_FOUND);
      if (current.status === 'VOIDED') return err(RECORD_VOIDED);
      const open = await this.#ensureOpen(patient, current.localDate);
      if (!open.ok) return open;
      await this.store.voidHydration(id, current.localDate);
      await this.#emit(context, 'tracking.hydration.voided', id, {
        patientId: patient.patientId,
        localDate: current.localDate,
      });
      return ok({ ...current, status: 'VOIDED' });
    });
  }

  /** Una nota para el equipo de atención (RN-G13). No se anula: queda como la escribió. */
  logNote(
    context: SecurityContext,
    input: { readonly clientId: string; readonly localDate: string; readonly body: string },
  ): Promise<Result<Logged<StoredNote>, DomainError>> {
    const patient = patientOf(context);
    return atomically<Logged<StoredNote>>(this.uow, context, async () => {
      const lookup = () =>
        this.store.noteByClientId(patient.patientId, input.localDate, input.clientId);
      const replay = await lookup();
      if (replay) return ok({ value: replay, replayed: true });
      const open = await this.#ensureOpen(patient, input.localDate);
      if (!open.ok) return open;
      const id = this.ids.newId<'NoteLogId'>();
      await this.store.insertNote({ ...this.#base(patient, input), id, body: input.body });
      const stored = await lookup();
      if (!stored) throw new Error('La nota no quedó guardada.');
      if (stored.id === id) {
        await this.#emit(context, 'tracking.note.logged', id, {
          patientId: patient.patientId,
          localDate: input.localDate,
        });
      }
      return ok({ value: stored, replayed: stored.id !== id });
    });
  }

  /** El peso en casa, si su app lo permite (content), con el rango de su métrica (RN-C04). */
  logMetric(
    context: SecurityContext,
    input: {
      readonly clientId: string;
      readonly localDate: string;
      readonly metricCode: string;
      readonly value: number;
    },
  ): Promise<Result<Logged<StoredMetric>, DomainError>> {
    const patient = patientOf(context);
    return atomically<Logged<StoredMetric>>(this.uow, context, async () => {
      const lookup = () =>
        this.store.metricByClientId(patient.patientId, input.localDate, input.clientId);
      const replay = await lookup();
      if (replay) return ok({ value: replay, replayed: true });
      if (
        input.metricCode === 'BODY_WEIGHT' &&
        !(await this.content.allowsWeightLog(patient.patientId))
      ) {
        return err(WEIGHT_LOG_DISABLED);
      }
      const range = await this.store.metricRange(input.metricCode);
      if (
        !range ||
        (range.min !== null && input.value < range.min) ||
        (range.max !== null && input.value > range.max)
      ) {
        return err(METRIC_OUT_OF_RANGE);
      }
      const open = await this.#ensureOpen(patient, input.localDate);
      if (!open.ok) return open;
      const id = this.ids.newId<'MetricLogId'>();
      await this.store.insertMetric({
        ...this.#base(patient, input),
        id,
        metricCode: input.metricCode,
        value: input.value,
        measuredAt: this.clock.now(),
      });
      const stored = await lookup();
      if (!stored) throw new Error('La medida no quedó guardada.');
      if (stored.id === id) {
        await this.#emit(context, 'tracking.metric.logged', id, {
          patientId: patient.patientId,
          localDate: input.localDate,
        });
      }
      return ok({ value: stored, replayed: stored.id !== id });
    });
  }

  voidMetric(context: SecurityContext, id: string): Promise<Result<StoredMetric, DomainError>> {
    const patient = patientOf(context);
    return atomically(this.uow, context, async () => {
      const current = await this.store.metricLog(id);
      if (!current) return err(RECORD_NOT_FOUND);
      if (current.status === 'VOIDED') return err(RECORD_VOIDED);
      const open = await this.#ensureOpen(patient, current.localDate);
      if (!open.ok) return open;
      await this.store.voidMetric(id, current.localDate);
      await this.#emit(context, 'tracking.metric.voided', id, {
        patientId: patient.patientId,
        localDate: current.localDate,
      });
      return ok({ ...current, status: 'VOIDED' });
    });
  }

  #base(patient: PatientContext, input: { readonly clientId: string; readonly localDate: string }) {
    return {
      organizationId: patient.organizationId,
      patientId: patient.patientId,
      localDate: input.localDate,
      clientId: input.clientId,
    };
  }

  /** Los registros de una petición anterior con el mismo clientId, o null si es nueva (RN-G08). */
  async #foodReplay(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<readonly StoredFoodLog[] | null> {
    const found = await this.store.foodLogsByClientIds(
      patientId,
      localDate,
      requestClientIds(clientId),
    );
    return found.length > 0 ? found : null;
  }

  /** HEALTH_DATA vigente (RN-B01) y un día ni futuro ni cerrado, en la fecha local del paciente (RN-G04, RN-G10). */
  async #ensureOpen(
    patient: PatientContext,
    localDate: string,
  ): Promise<Result<void, DomainError>> {
    const consent = await this.clinical.ensureHealthDataConsent(patient.patientId);
    if (!consent.ok) return consent;
    const ref = await this.clinical.patientRef(patient.patientId);
    if (!ref) return err(PATIENT_NOT_FOUND);
    const today = localDateOf(this.clock.now(), ref.timezone);
    const windowDays = await this.tenancy.trackingEditWindowDays(patient.organizationId);
    const verdict = recordWindow(localDate, today, windowDays);
    if (verdict === 'FUTURE') return err(FUTURE_DATE);
    if (verdict === 'CLOSED') return err(WINDOW_CLOSED);
    return ok(undefined);
  }

  /** Lo que aporta lo elegido: del snapshot del plan vigente ese día (RN-E15) o del catálogo (RN-G05). */
  async #drafts(
    patientId: string,
    localDate: string,
    source: FoodSource,
  ): Promise<
    Result<
      { readonly planId: string | null; readonly drafts: readonly FoodLogDraft[] },
      DomainError
    >
  > {
    if (source.kind === 'CATALOG') {
      const [food] = await this.food.foodsById([source.foodId]);
      if (!food) return err(FOOD_NOT_FOUND);
      const nutrientsPer100g = Object.fromEntries(
        food.nutrients.map((nutrient) => [nutrient.nutrientCode, nutrient.valuePer100g]),
      );
      return ok({
        planId: null,
        drafts: [
          catalogFoodDraft(
            { id: food.id, name: food.name, nutrientsPer100g },
            { mealSlotCode: source.mealSlotCode, grams: source.grams },
          ),
        ],
      });
    }
    const active = await this.store.activeNutrition(patientId);
    if (!active || localDate < active.effectiveFrom) return err(NO_ACTIVE_PLAN);
    // El snapshot lo escribió nutrition (RN-E15): su tipo cumple el de tracking, y el compilador lo comprueba aquí.
    const plan: LoggablePlan = active.snapshot as PlanSnapshot;
    const drafts = planDrafts(plan, source);
    if (!drafts || drafts.length > MAX_ITEMS_PER_REQUEST) return err(NOT_IN_PLAN);
    return ok({ planId: active.id, drafts });
  }

  async #insertFoods(
    patient: PatientContext,
    request: { readonly clientId: string; readonly localDate: string },
    resolved: { readonly planId: string | null; readonly drafts: readonly FoodLogDraft[] },
  ): Promise<readonly StoredFoodLog[]> {
    const loggedAt = this.clock.now();
    const rows = resolved.drafts.map((draft, index) => ({
      ...this.#base(patient, { ...request, clientId: itemClientId(request.clientId, index) }),
      id: this.ids.newId<'FoodLogId'>(),
      loggedAt,
      planId: resolved.planId,
      createdBy: patient.userId,
      draft,
    }));
    await this.store.insertFoodLogs(rows);
    const stored = await this.store.foodLogsByClientIds(
      patient.patientId,
      request.localDate,
      rows.map((row) => row.clientId),
    );
    const inserted = new Set<string>(rows.map((row) => row.id));
    for (const record of stored.filter((r) => inserted.has(r.id))) {
      await this.#emit(
        { organizationId: patient.organizationId, userId: patient.userId, role: 'PATIENT' },
        'tracking.food.logged',
        record.id,
        { patientId: patient.patientId, localDate: record.localDate, inPlan: record.inPlan },
      );
    }
    return stored;
  }

  async #emit(
    context: Pick<SecurityContext, 'organizationId' | 'userId' | 'role'>,
    type: TrackingEventType,
    aggregateId: string,
    payload: TrackingEventPayload,
  ): Promise<void> {
    if (!context.organizationId) throw new Error('Un evento de tracking necesita la organización.');
    await this.outbox.append(
      [
        trackingEvent(type, context.organizationId, aggregateId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

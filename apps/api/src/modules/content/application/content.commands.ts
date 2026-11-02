import { Inject, Injectable } from '@nestjs/common';
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
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../platform/index.js';
import { ClinicalApi } from '../../clinical/index.js';
import {
  MESSAGE_DATES,
  MESSAGE_NOT_FOUND,
  settingsOrDefault,
  type AppSection,
  type AppSettingsView,
  type MessageRecord,
} from '../domain/app-content.js';
import { contentEvent, type ContentEventType } from './content-events.js';
import { CONTENT_STORE, type ContentStore } from './ports/content.ports.js';

export interface SettingsInput {
  readonly themeColor: string | null;
  readonly welcomeMessage: string | null;
  readonly enabledSections: readonly AppSection[];
  readonly allowWeightLog: boolean;
}

export interface MessageInput {
  readonly body: string;
  readonly activeFrom: string | null;
  readonly activeTo: string | null;
}

const SETTINGS_FIELDS = {
  themeColor: 'theme_color',
  welcomeMessage: 'welcome_message',
  enabledSections: 'enabled_sections',
  allowWeightLog: 'allow_weight_log',
} as const;

const MESSAGE_FIELDS = { body: 'body', activeFrom: 'active_from', activeTo: 'active_to' } as const;

/**
 * Ajustes de la app del paciente y mensajes motivacionales (RF-27, 02 §2). Lo de un paciente lo escribe su equipo de atención con
 * acceso de escritura (RN-A05); lo de todos, el dueño o un administrador (permiso en la ruta). Cada cambio deja su evento para la
 * auditoría (RN-B03).
 */
@Injectable()
export class ContentCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(CONTENT_STORE) private readonly store: ContentStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
  ) {}

  updateSettings(
    context: SecurityContext,
    patientId: string,
    input: SettingsInput,
  ): Promise<Result<AppSettingsView, DomainError>> {
    const organizationId = organizationOf(context);
    return atomically(this.uow, context, async () => {
      const writable = await this.clinical.ensurePatientWritable(context, patientId);
      if (!writable.ok) return writable;
      const before = settingsOrDefault(await this.store.settings(patientId));
      const updatedAt = this.clock.now();
      await this.store.saveSettings({ ...input, patientId, organizationId, updatedAt });
      const fields = (Object.keys(SETTINGS_FIELDS) as (keyof typeof SETTINGS_FIELDS)[])
        .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(input[key]))
        .map((key) => SETTINGS_FIELDS[key]);
      await this.#emit(context, 'content.settings.changed', patientId, { patientId, fields });
      return ok({ ...input, updatedAt });
    });
  }

  createMessage(
    context: SecurityContext,
    patientId: string | null,
    input: MessageInput,
  ): Promise<Result<MessageRecord, DomainError>> {
    const organizationId = organizationOf(context);
    return atomically(this.uow, context, async () => {
      if (patientId !== null) {
        const writable = await this.clinical.ensurePatientWritable(context, patientId);
        if (!writable.ok) return writable;
      }
      const id = this.ids.newId<'MotivationalMessageId'>();
      await this.store.insertMessage({
        ...input,
        id,
        organizationId,
        patientId,
        createdBy: actorOf(context),
      });
      await this.#emit(context, 'content.message.created', id, { patientId });
      const created = await this.store.message(id);
      return created ? ok(created) : err(MESSAGE_NOT_FOUND);
    });
  }

  /** Cambia el texto o las fechas de un mensaje del paciente indicado, o de uno para todos con patientId null. */
  updateMessage(
    context: SecurityContext,
    patientId: string | null,
    messageId: string,
    changes: Partial<MessageInput>,
  ): Promise<Result<MessageRecord, DomainError>> {
    return atomically(this.uow, context, async () => {
      if (patientId !== null) {
        const writable = await this.clinical.ensurePatientWritable(context, patientId);
        if (!writable.ok) return writable;
      }
      const current = await this.store.message(messageId);
      if (!current || current.patientId !== patientId) return err(MESSAGE_NOT_FOUND);
      const next = { ...current, ...changes };
      if (next.activeFrom !== null && next.activeTo !== null && next.activeFrom > next.activeTo) {
        return err(MESSAGE_DATES);
      }
      await this.store.updateMessage(messageId, changes);
      const fields = (Object.keys(changes) as (keyof typeof MESSAGE_FIELDS)[]).map(
        (key) => MESSAGE_FIELDS[key],
      );
      await this.#emit(context, 'content.message.updated', messageId, { patientId, fields });
      return ok(next);
    });
  }

  async #emit(
    context: SecurityContext,
    type: ContentEventType,
    aggregateId: string,
    payload: { readonly patientId: string | null; readonly fields?: readonly string[] },
  ): Promise<void> {
    await this.outbox.append(
      [
        contentEvent(type, organizationOf(context), aggregateId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

function organizationOf(context: SecurityContext): OrganizationId {
  if (!context.organizationId) throw new Error('content necesita la organización activa.');
  return context.organizationId;
}

function actorOf(context: SecurityContext): string {
  if (!context.userId) throw new Error('content necesita el usuario.');
  return context.userId;
}

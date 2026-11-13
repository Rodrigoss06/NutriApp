import { Inject, Injectable } from '@nestjs/common';
import type { Features } from '@nutricoach/contracts';
import { FeatureFlags } from '../../../platform/index.js';
import {
  CLOCK,
  err,
  ok,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../clinical/index.js';
import {
  localDateIn,
  messageOfTheDay,
  settingsOrDefault,
  type AppSettingsView,
  type MessageRecord,
} from '../domain/app-content.js';
import { CONTENT_STORE, type ContentStore } from './ports/content.ports.js';

/** Lecturas de content con la RLS de quien pide: el equipo de atención (RN-A05) o el propio paciente (02 §10). */
@Injectable()
export class ContentQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONTENT_STORE) private readonly store: ContentStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(FeatureFlags) private readonly flags: FeatureFlags,
  ) {}

  /** Los ajustes de la app de un paciente que se ve; sin guardar, los de por defecto. */
  settings(
    context: SecurityContext,
    patientId: string,
  ): Promise<Result<AppSettingsView, DomainError>> {
    return this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return err(PATIENT_NOT_FOUND);
      return ok(settingsOrDefault(await this.store.settings(patientId)));
    });
  }

  /** Los mensajes de un paciente que se ve, o con null los de todos. */
  messages(
    context: SecurityContext,
    patientId: string | null,
  ): Promise<Result<readonly MessageRecord[], DomainError>> {
    return this.uow.query(context, async () => {
      if (patientId !== null && !(await this.clinical.patientRef(patientId))) {
        return err(PATIENT_NOT_FOUND);
      }
      return ok(await this.store.messages(patientId));
    });
  }

  /** La app del paciente de la sesión: sus ajustes y el mensaje de hoy, en su fecha local (RN-G04). */
  meApp(
    context: SecurityContext,
  ): Promise<
    AppSettingsView & { readonly message: MessageRecord | null; readonly features: Features }
  > {
    const patientId = context.patientId;
    const organizationId = context.organizationId;
    if (!patientId || !organizationId) throw new Error('La app del paciente necesita su paciente.');
    return this.uow.query(context, async () => {
      const patient = await this.clinical.patientRef(patientId);
      const today = localDateIn(this.clock.now(), patient?.timezone ?? 'America/Lima');
      const [settings, messages] = await Promise.all([
        this.store.settings(patientId),
        this.store.messagesFor(patientId),
      ]);
      return {
        ...settingsOrDefault(settings),
        message: messageOfTheDay(messages, today),
        // Las banderas de su organización (ADR-127): la app oculta lo que la API negaría.
        features: await this.flags.features(organizationId),
      };
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { settingsOrDefault } from '../domain/app-content.js';
import { CONTENT_STORE, type ContentStore } from './ports/content.ports.js';

/** API pública de content (02 §3): lo que otros contextos consultan, en la transacción de quien llama. */
@Injectable()
export class ContentApi {
  constructor(@Inject(CONTENT_STORE) private readonly store: ContentStore) {}

  /** Si la app del paciente permite registrar el peso en casa (07 §9); sin ajustes guardados, sí. */
  async allowsWeightLog(patientId: string): Promise<boolean> {
    return settingsOrDefault(await this.store.settings(patientId)).allowWeightLog;
  }
}

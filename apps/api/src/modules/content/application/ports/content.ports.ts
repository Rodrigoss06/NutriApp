import type { AppSection, AppSettingsView, MessageRecord } from '../../domain/app-content.js';

export interface SettingsRow {
  readonly patientId: string;
  readonly organizationId: string;
  readonly themeColor: string | null;
  readonly welcomeMessage: string | null;
  readonly enabledSections: readonly AppSection[];
  readonly allowWeightLog: boolean;
  readonly updatedAt: Date;
}

export interface MessageRow {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string | null;
  readonly body: string;
  readonly activeFrom: string | null;
  readonly activeTo: string | null;
  readonly createdBy: string;
}

/**
 * content.patient_app_setting y content.motivational_message, con la transacción de quien llama y su RLS: el equipo de atención
 * ve lo de sus pacientes y lo de todos (RN-A05); el paciente, lo suyo y lo de todos.
 */
export interface ContentStore {
  settings(patientId: string): Promise<AppSettingsView | null>;
  saveSettings(row: SettingsRow): Promise<void>;
  /** Los del paciente, o con null los de todos. */
  messages(patientId: string | null): Promise<readonly MessageRecord[]>;
  /** Los del paciente y los de todos, para elegir el de hoy. */
  messagesFor(patientId: string): Promise<readonly MessageRecord[]>;
  message(id: string): Promise<MessageRecord | null>;
  insertMessage(row: MessageRow): Promise<void>;
  updateMessage(
    id: string,
    changes: Partial<Pick<MessageRecord, 'body' | 'activeFrom' | 'activeTo'>>,
  ): Promise<void>;
}

export const CONTENT_STORE = Symbol.for('nutricoach.content.ContentStore');

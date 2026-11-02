import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type { AppSection, AppSettingsView, MessageRecord } from '../../../domain/app-content.js';
import type {
  ContentStore,
  MessageRow,
  SettingsRow,
} from '../../../application/ports/content.ports.js';

const isoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;
const asDate = (value: string | null): Date | null =>
  value ? new Date(`${value}T00:00:00Z`) : null;

interface MessageModel {
  readonly id: string;
  readonly patientId: string | null;
  readonly body: string;
  readonly activeFrom: Date | null;
  readonly activeTo: Date | null;
  readonly createdAt: Date;
}

const toMessage = (row: MessageModel): MessageRecord => ({
  id: row.id,
  patientId: row.patientId,
  body: row.body,
  activeFrom: isoDate(row.activeFrom),
  activeTo: isoDate(row.activeTo),
  createdAt: row.createdAt,
});

const MESSAGE = {
  id: true,
  patientId: true,
  body: true,
  activeFrom: true,
  activeTo: true,
  createdAt: true,
} as const;

/** content con Prisma, en la transacción de la UnitOfWork (su RLS decide qué se ve). */
@Injectable()
export class PrismaContentStore implements ContentStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async settings(patientId: string): Promise<AppSettingsView | null> {
    const row = await this.db.tx.patientAppSetting.findUnique({ where: { patientId } });
    return row
      ? {
          themeColor: row.themeColor,
          welcomeMessage: row.welcomeMessage,
          enabledSections: row.enabledSections as AppSection[],
          allowWeightLog: row.allowWeightLog,
          updatedAt: row.updatedAt,
        }
      : null;
  }

  async saveSettings(row: SettingsRow): Promise<void> {
    const values = {
      themeColor: row.themeColor,
      welcomeMessage: row.welcomeMessage,
      enabledSections: [...row.enabledSections],
      allowWeightLog: row.allowWeightLog,
      updatedAt: row.updatedAt,
    };
    await this.db.tx.patientAppSetting.upsert({
      where: { patientId: row.patientId },
      create: { patientId: row.patientId, organizationId: row.organizationId, ...values },
      update: values,
    });
  }

  async messages(patientId: string | null): Promise<readonly MessageRecord[]> {
    const rows = await this.db.tx.motivationalMessage.findMany({
      where: { patientId },
      select: MESSAGE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toMessage);
  }

  async messagesFor(patientId: string): Promise<readonly MessageRecord[]> {
    const rows = await this.db.tx.motivationalMessage.findMany({
      where: { OR: [{ patientId }, { patientId: null }] },
      select: MESSAGE,
    });
    return rows.map(toMessage);
  }

  async message(id: string): Promise<MessageRecord | null> {
    const row = await this.db.tx.motivationalMessage.findUnique({ where: { id }, select: MESSAGE });
    return row ? toMessage(row) : null;
  }

  async insertMessage(row: MessageRow): Promise<void> {
    await this.db.tx.motivationalMessage.create({
      data: {
        id: row.id,
        organizationId: row.organizationId,
        patientId: row.patientId,
        body: row.body,
        activeFrom: asDate(row.activeFrom),
        activeTo: asDate(row.activeTo),
        createdBy: row.createdBy,
      },
    });
  }

  async updateMessage(
    id: string,
    changes: Partial<Pick<MessageRecord, 'body' | 'activeFrom' | 'activeTo'>>,
  ): Promise<void> {
    await this.db.tx.motivationalMessage.update({
      where: { id },
      data: {
        ...(changes.body === undefined ? {} : { body: changes.body }),
        ...(changes.activeFrom === undefined ? {} : { activeFrom: asDate(changes.activeFrom) }),
        ...(changes.activeTo === undefined ? {} : { activeTo: asDate(changes.activeTo) }),
      },
    });
  }
}

import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  ID_GENERATOR,
  type IdGenerator,
  type OrganizationId,
  type UserId,
} from '@nutricoach/shared-kernel';
import type { Db } from '../database/prisma.provider.js';
import { sniffMime, type AllowedMime } from './file-type.js';
import { STORAGE, type StoragePort } from './storage.port.js';

export interface StoredFile {
  readonly id: string;
  readonly mimeType: AllowedMime;
  readonly sizeBytes: number;
}

export const UNSUPPORTED_FILE = 'NC-PLT-415';

/**
 * Archivos subidos: guarda los bytes en StoragePort y su fila en platform.file_object dentro de la transacción del
 * caso de uso. Si la transacción falla, quien llama descarta los bytes con `discard`. El tipo sale de los bytes.
 */
@Injectable()
export class FileRegistry {
  constructor(
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(TransactionHost) private readonly db: Db,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /** Escribe los bytes; aún no registra nada. Devuelve null si el tipo no es admitido. */
  async write(
    organizationId: OrganizationId,
    content: Uint8Array,
  ): Promise<{ id: string; key: string; mimeType: AllowedMime; sha256: Uint8Array } | null> {
    const mimeType = sniffMime(content);
    if (!mimeType) return null;
    const id = this.ids.newId<'FileId'>();
    const key = `${organizationId}/${id}`;
    await this.storage.put(key, content);
    return { id, key, mimeType, sha256: createHash('sha256').update(content).digest() };
  }

  /** Registra en la transacción activa un archivo ya escrito. */
  async register(file: {
    id: string;
    key: string;
    mimeType: AllowedMime;
    sha256: Uint8Array;
    sizeBytes: number;
    organizationId: OrganizationId;
    purpose: string;
    uploadedBy: UserId | null;
  }): Promise<void> {
    await this.db.tx.fileObject.createMany({
      data: [
        {
          id: file.id,
          organizationId: file.organizationId,
          storageDriver: this.storage.driver,
          storageKey: file.key,
          mimeType: file.mimeType,
          sizeBytes: BigInt(file.sizeBytes),
          sha256: new Uint8Array(file.sha256),
          purpose: file.purpose,
          uploadedBy: file.uploadedBy,
        },
      ],
    });
  }

  discard(key: string): Promise<void> {
    return this.storage.discard(key);
  }

  /** Lee un archivo visible con el contexto de la transacción activa (RLS). */
  async read(fileId: string): Promise<{ content: Buffer; mimeType: string } | null> {
    const row = await this.db.tx.fileObject.findFirst({
      where: { id: fileId, deletedAt: null },
      select: { storageKey: true, mimeType: true },
    });
    if (!row) return null;
    return { content: await this.storage.read(row.storageKey), mimeType: row.mimeType };
  }
}

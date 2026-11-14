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

/** Lo que guarda la plataforma además de lo admitido como subida: el ZIP de una exportación (ADR-131). */
export type StoredMime = AllowedMime | 'application/zip';

/**
 * Un archivo de un paciente. `storageKey` sirve solo para leer sus bytes con `readKey` fuera de la transacción que lo listó (con su
 * RLS); nunca sale de la API.
 */
export interface PatientFile {
  readonly id: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: Uint8Array;
  readonly purpose: string;
  readonly createdAt: Date;
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

  /** Escribe un ZIP que armó la plataforma, sin mirar sus bytes: nunca viene de una subida (ADR-131). */
  async writeArchive(
    organizationId: OrganizationId,
    content: Uint8Array,
  ): Promise<{ id: string; key: string; mimeType: StoredMime; sha256: Uint8Array }> {
    const id = this.ids.newId<'FileId'>();
    const key = `${organizationId}/${id}`;
    await this.storage.put(key, content);
    return {
      id,
      key,
      mimeType: 'application/zip',
      sha256: createHash('sha256').update(content).digest(),
    };
  }

  /**
   * Registra en la transacción activa un archivo ya escrito. patientId es el paciente del archivo, o null si no es de uno (un logo, el
   * material, una importación): la exportación y la supresión encuentran así todos los suyos (ADR-131).
   */
  async register(file: {
    id: string;
    key: string;
    mimeType: StoredMime;
    sha256: Uint8Array;
    sizeBytes: number;
    organizationId: OrganizationId;
    purpose: string;
    uploadedBy: UserId | null;
    patientId: string | null;
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
          patientId: file.patientId,
        },
      ],
    });
  }

  /** Los archivos visibles de un paciente con el contexto de la transacción activa, sin los de esos propósitos. */
  async listForPatient(
    patientId: string,
    excludedPurposes: readonly string[],
  ): Promise<readonly PatientFile[]> {
    const rows = await this.db.tx.fileObject.findMany({
      where: { patientId, deletedAt: null, purpose: { notIn: [...excludedPurposes] } },
      select: {
        id: true,
        storageKey: true,
        mimeType: true,
        sizeBytes: true,
        sha256: true,
        purpose: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({ ...row, sizeBytes: Number(row.sizeBytes) }));
  }

  discard(key: string): Promise<void> {
    return this.storage.discard(key);
  }

  /**
   * Marca borrado un archivo visible en la transacción activa y devuelve su clave, para descartar los bytes después de confirmar.
   * Solo para lo que se borra por regla, como las fotos de progreso (RN-G20): la evidencia de un consentimiento nunca se borra.
   */
  async retire(fileId: string, at: Date): Promise<string | null> {
    const row = await this.db.tx.fileObject.findFirst({
      where: { id: fileId, deletedAt: null },
      select: { storageKey: true },
    });
    if (!row) return null;
    await this.db.tx.fileObject.updateMany({ where: { id: fileId }, data: { deletedAt: at } });
    return row.storageKey;
  }

  /** Los bytes de un archivo que ya se listó con su RLS (`listForPatient`), sin abrir una transacción. */
  readKey(storageKey: string): Promise<Buffer> {
    return this.storage.read(storageKey);
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

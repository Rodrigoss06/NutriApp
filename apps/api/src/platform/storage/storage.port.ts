/**
 * Almacenamiento de archivos (02 §2, 01 §12): disco local hoy; S3 mañana sin tocar el dominio. La clave es aleatoria
 * (UUIDv7) y nunca lleva el nombre original del archivo.
 */
export interface StoragePort {
  readonly driver: string;
  put(key: string, content: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  /** Solo para deshacer una subida cuya transacción falló: la evidencia de un consentimiento nunca se borra. */
  discard(key: string): Promise<void>;
}

export const STORAGE = Symbol.for('nutricoach.StoragePort');

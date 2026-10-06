import type { OrganizationId } from '../id.js';

/**
 * Cifrado de campos (02 §10, RN-B06): número de documento y teléfono con AES-256-GCM y versión de llave, más
 * un índice ciego HMAC para buscar por igualdad sin descifrar.
 */
export interface EncryptionPort {
  /**
   * Cifra con la llave más reciente. `associatedData` ata el cifrado a su lugar (organización, tabla y
   * columna): copiado a otra fila u organización, ya no se descifra.
   */
  encrypt(plaintext: string, associatedData: string): Uint8Array;
  /** Descifra con la versión de llave que trae el valor; falla si fue alterado o no corresponde a su lugar. */
  decrypt(ciphertext: Uint8Array, associatedData: string): string;
  /** HMAC-SHA256 de organización, tipo y valor normalizado: no permite cruzar personas entre organizaciones. */
  blindIndex(organizationId: OrganizationId, kind: string, value: string): Uint8Array;
}

/** Token de inyección del EncryptionPort. */
export const ENCRYPTION_PORT = Symbol.for('nutricoach.EncryptionPort');

/**
 * Normaliza un número de documento para el índice ciego: sin espacios, guiones ni puntos y en mayúsculas.
 * Conserva los ceros a la izquierda (un DNI tiene 8 dígitos).
 */
export function normalizeDocumentNumber(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\s.-]/g, '')
    .toUpperCase();
}

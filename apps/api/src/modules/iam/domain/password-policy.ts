import { domainError, type DomainError } from '@nutricoach/shared-kernel';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
/** La parte local del correo cuenta desde 4 letras: «ana» no; «anaperez» sí. */
const MIN_LOCAL_PART = 4;

/** NFKC antes de validar y de hashear: «ｐａｓｓ» y «pass» son la misma contraseña. */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

export interface PasswordPolicyContext {
  readonly email: string;
  /** Si la contraseña (NFKC, en minúsculas) está en la lista de comunes. */
  readonly isCommon: (lowercased: string) => boolean;
}

/** RN-A07: devuelve el primer incumplimiento o null. El mensaje nunca repite la contraseña. */
export function checkNewPassword(
  password: string,
  { email, isCommon }: PasswordPolicyContext,
): DomainError | null {
  const normalized = normalizePassword(password);
  // Code points, no unidades UTF-16: un emoji cuenta como un carácter.
  const length = Array.from(normalized).length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    return domainError({
      code: 'NC-IAM-001',
      rule: 'RN-A07',
      message: `La contraseña debe tener de ${String(PASSWORD_MIN_LENGTH)} a ${String(PASSWORD_MAX_LENGTH)} caracteres.`,
    });
  }
  const lowered = normalized.toLowerCase();
  if (isCommon(lowered)) {
    return domainError({
      code: 'NC-IAM-002',
      rule: 'RN-A07',
      message: 'Esa contraseña es demasiado común. Elige otra.',
    });
  }
  const localPart = email.trim().toLowerCase().split('@', 1)[0] ?? '';
  if (
    lowered.includes('nutricoach') ||
    (localPart.length >= MIN_LOCAL_PART && lowered.includes(localPart))
  ) {
    return domainError({
      code: 'NC-IAM-003',
      rule: 'RN-A07',
      message: 'La contraseña no puede contener el nombre de la plataforma ni tu correo.',
    });
  }
  return null;
}

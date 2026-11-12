import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';

export const WHATSAPP_NOT_ENABLED = domainError({
  code: 'NC-TRA-026',
  message: 'Activa el seguimiento por WhatsApp en el perfil de entrenamiento del alumno.',
});

export const PHONE_MISSING = domainError({
  code: 'NC-TRA-027',
  message: 'El alumno no tiene teléfono. Agrégalo en su ficha.',
});

export const PHONE_WITHOUT_COUNTRY_CODE = domainError({
  code: 'NC-TRA-028',
  message:
    'Agrega el código de país al teléfono del alumno en su ficha, por ejemplo +51 987 654 321.',
});

/** Lo que se quita al escribir un teléfono: espacios, guiones, puntos y paréntesis. */
const SEPARATORS = /[\s\-.()]/g;
/** E.164: hasta 15 dígitos con el código de país; menos de 8 no es un número completo. */
const E164 = /^\d{8,15}$/;

/**
 * El enlace wa.me que abre el chat del alumno (P-35, respuesta de Jeremy del 2026-11-10; decisiones de Rodrigo del 2026-11-11):
 * - solo con el seguimiento asistido por WhatsApp activado en su perfil de entrenamiento;
 * - el teléfono tiene que traer su código de país, con «+» o «00»: sin él no se supone +51, se pide agregarlo.
 * No integra ninguna API de mensajería: el enlace solo abre el chat.
 */
export function whatsappLink(phone: string | null, enabled: boolean): Result<string, DomainError> {
  if (!enabled) return err(WHATSAPP_NOT_ENABLED);
  const written = (phone ?? '').replace(SEPARATORS, '');
  if (written === '') return err(PHONE_MISSING);
  const international = written.startsWith('+')
    ? written.slice(1)
    : written.startsWith('00')
      ? written.slice(2)
      : null;
  if (international === null || !E164.test(international)) return err(PHONE_WITHOUT_COUNTRY_CODE);
  return ok(`https://wa.me/${international}`);
}

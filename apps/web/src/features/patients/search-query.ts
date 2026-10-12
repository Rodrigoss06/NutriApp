/**
 * Lo escrito en el buscador de pacientes (RF-08): con dígitos es un documento, que se busca exacto por su índice
 * ciego en todos los tipos; sin dígitos, un nombre, que se busca sin tildes. Vacío: la lista completa.
 */
export function patientQuery(text: string): { documentNumber: string } | { q: string } | null {
  const value = text.trim();
  if (!value) return null;
  return /\d/.test(value) ? { documentNumber: value.slice(0, 20) } : { q: value.slice(0, 80) };
}

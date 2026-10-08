/** `?next=` solo acepta rutas internas: empieza con / y no con // ni /\ (evita redirecciones abiertas). */
export function safeNext(value: string | null | undefined, fallback = '/panel'): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}

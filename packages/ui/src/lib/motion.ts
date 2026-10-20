import type { CSSProperties } from 'react';

/**
 * Orden de un elemento en la entrada escalonada de su pantalla (clase nc-enter): sale `index` × 70 ms después del
 * primero. Una sola secuencia por pantalla, para lo principal; el resto queda quieto (ADR-051).
 */
export function enterStyle(index: number): CSSProperties {
  return { '--i': index } as CSSProperties;
}

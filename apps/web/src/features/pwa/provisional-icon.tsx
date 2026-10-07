import { ImageResponse } from 'next/og';
import { DEFAULT_BRAND } from '@nutricoach/ui';

/**
 * Ícono provisional de la PWA, dibujado al compilar: sin binarios en el repositorio. Lo reemplaza la identidad
 * visual del cliente. `maskable` deja margen para los recortes de Android.
 */
export function provisionalIcon(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  const fontSize = Math.round(size * (maskable ? 0.36 : 0.5));
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: DEFAULT_BRAND.primary,
        color: '#ffffff',
        fontSize,
        fontWeight: 700,
        borderRadius: maskable ? 0 : Math.round(size * 0.2),
      }}
    >
      NC
    </div>,
    { width: size, height: size },
  );
}

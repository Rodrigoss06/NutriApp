import { provisionalIcon } from '@/features/pwa/provisional-icon';

/** Ícono de inicio en iOS (Safari no usa el manifiesto para esto). */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return provisionalIcon(180, { maskable: true });
}

import { provisionalIcon } from '@/features/pwa/provisional-icon';

const SIZES = { '192': 192, '512': 512, 'maskable-512': 512 } as const;

export const dynamic = 'force-static';

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

/** Íconos del manifiesto: /icons/192, /icons/512 y /icons/maskable-512 (PNG). */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const pixels = SIZES[size as keyof typeof SIZES] as number | undefined;
  if (pixels === undefined) return new Response(null, { status: 404 });
  return provisionalIcon(pixels, { maskable: size.startsWith('maskable') });
}

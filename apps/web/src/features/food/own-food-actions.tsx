'use client';

import type { FoodDetail } from '@nutricoach/contracts';
import { buttonVariants } from '@nutricoach/ui';
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useCanWrite } from '@/features/session/panel-session';

/** Editar solo existe para un alimento propio y con la organización activa (RN-I01, RN-A02); la API decide igual. */
export function OwnFoodActions({ food }: { food: FoodDetail }) {
  const canWrite = useCanWrite();
  if (!food.own || !canWrite) return null;
  return (
    <Link
      href={`/panel/biblioteca/alimentos/${food.id}/editar`}
      className={buttonVariants({ variant: 'secondary' })}
    >
      <Pencil aria-hidden />
      Editar
    </Link>
  );
}

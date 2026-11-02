import type { MeToday } from '@nutricoach/contracts';
import { Dumbbell } from 'lucide-react';
import Link from 'next/link';

/** La sesión del día del programa vigente (07 §8, RF-27): su nombre y cuántos ejercicios; en un descanso, descanso. */
export function SessionCard({ sessions }: { sessions: MeToday['sessions'] }) {
  return (
    <section aria-labelledby="sesion-dia" className="rounded-xl border border-border bg-card p-4">
      <h2 id="sesion-dia" className="flex items-center gap-2 text-lg font-semibold">
        <Dumbbell aria-hidden className="size-5" /> Entrenamiento
      </h2>
      {sessions === null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Cuando tu coach publique tu rutina, verás aquí la sesión de cada día.
        </p>
      ) : sessions.length === 0 ? (
        <p className="mt-2">Hoy es día de descanso.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {sessions.map((session) => (
            <li key={session.position}>
              <Link href="/mi/entreno" className="flex min-h-touch items-center justify-between">
                <span className="font-medium">{session.name}</span>
                <span className="text-sm text-muted-foreground">
                  {session.exerciseCount} {session.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

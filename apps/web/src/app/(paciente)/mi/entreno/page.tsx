import type { MeApp, MeTraining } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { BedDouble, Dumbbell } from 'lucide-react';
import type { Metadata } from 'next';
import { LoggedWorkouts } from '@/features/patient-app/logged-workouts';
import { WorkoutLogger } from '@/features/patient-app/workout-logger';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Entreno' };

/**
 * Entreno (RF-29): la semana del programa vigente con su fase y su RIR objetivo, la sesión de hoy para registrarla serie por
 * serie con el tonelaje a la vista, y lo ya registrado. Las notas que ve el paciente son las de la sesión y del ejercicio, no
 * la de la sustitución (ADR-079).
 */
export default async function Page() {
  const [app, training] = await Promise.all([
    serverApi<MeApp>('/me/app'),
    serverApi<MeTraining>('/me/training'),
  ]);
  if (!app.ok || !training.ok) {
    return <Notice tone="danger" title="No pudimos cargar tu entrenamiento" />;
  }
  const sections = new Set(app.data.enabledSections);
  const { program, sessions, workouts, checkin, localDate } = training.data;
  if (!sections.has('TRAINING') || !program) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Entreno</h1>
        <EmptyState
          icon={Dumbbell}
          title={
            sections.has('TRAINING')
              ? 'Hoy no tienes una rutina vigente'
              : 'Tu profesional no activó el entrenamiento en tu app'
          }
          description={
            sections.has('TRAINING')
              ? 'Cuando tu coach publique tu rutina, verás aquí la sesión de cada día.'
              : 'Si quieres registrar tus sesiones, pídeselo a tu profesional.'
          }
        />
      </div>
    );
  }
  const logged = new Set(workouts.map((workout) => workout.sessionId));
  const sessionNames = Object.fromEntries(sessions.map((session) => [session.id, session.name]));
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Entreno</h1>
        <p className="text-muted-foreground">
          {program.name} · Semana {program.weekNo}
          {program.phase ? ` · ${program.phase}` : ''}
          {program.targetRir !== null ? ` · RIR objetivo ${String(program.targetRir)}` : ''}
        </p>
        {program.isDeload ? (
          <p className="text-sm font-medium">Semana de descarga: menos carga para recuperarte.</p>
        ) : null}
      </header>
      {sessions.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="Hoy es día de descanso"
          description="Recuperarte también es parte del plan."
        />
      ) : (
        sessions
          .filter((session) => !logged.has(session.id))
          .map((session) => (
            <WorkoutLogger key={session.id} session={session} localDate={localDate} />
          ))
      )}
      {workouts.length > 0 ? (
        <LoggedWorkouts
          workouts={workouts}
          sessionNames={sessionNames}
          hasCheckin={checkin !== null}
          checkinEnabled={sections.has('CHECKIN')}
        />
      ) : null}
    </div>
  );
}

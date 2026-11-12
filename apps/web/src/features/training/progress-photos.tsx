import { Camera } from 'lucide-react';
import { formatDate } from '@/lib/dates';
import { photoFileUrl, type PhotoAudience, type PhotoRef, type ViewComparison } from './photo-view';

function PhotoFigure({
  photo,
  caption,
  audience,
  view,
}: {
  photo: PhotoRef;
  caption: string;
  audience: PhotoAudience;
  view: string;
}) {
  return (
    <figure className="flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- la foto se lee de la API con la sesión, cada vez auditada */}
      <img
        src={photoFileUrl(photo.id, audience)}
        alt={`Foto ${view.toLowerCase()} de «${photo.mesocycleName}»`}
        className="aspect-[3/4] w-full rounded-md border border-border bg-muted object-cover"
      />
      <figcaption className="text-xs text-muted-foreground">
        {caption} · {photo.mesocycleName}, del {formatDate(photo.startDate)} al{' '}
        {formatDate(photo.endDate)}
      </figcaption>
    </figure>
  );
}

/**
 * La comparativa fotográfica por vista (P-30; RN-G20): la foto del primer mesociclo frente a la del último, como la hoja de Jeremy.
 * Con una sola foto de una vista, muestra esa y avisa que falta otra para comparar.
 */
export function PhotoComparison({
  comparison,
  audience,
}: {
  comparison: readonly ViewComparison[];
  audience: PhotoAudience;
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-3" aria-label="Comparativa por vista">
      {comparison.map((item) => (
        <li
          key={item.view}
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
        >
          <h3 className="font-medium">{item.label}</h3>
          {item.current ? (
            <div className="grid grid-cols-2 gap-2">
              {item.initial ? (
                <PhotoFigure
                  photo={item.initial}
                  caption="Inicial"
                  audience={audience}
                  view={item.label}
                />
              ) : (
                <p className="flex aspect-[3/4] items-center justify-center rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
                  Falta otra foto para comparar
                </p>
              )}
              <PhotoFigure
                photo={item.current}
                caption="Actual"
                audience={audience}
                view={item.label}
              />
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Camera aria-hidden className="size-4" />
              Sin fotos de esta vista.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

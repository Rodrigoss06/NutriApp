import { methodLabel, type DayProfile } from '@nutricoach/contracts';
import { formatNumber, MethodBadge } from '@nutricoach/ui';
import { TableScroll } from '@/features/shell/table-scroll';

interface Targets {
  readonly kcal: number;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
}

/**
 * Las metas de cada perfil de día de un plan publicado (07 §2, P-20): Entrenamiento, que es la de la prescripción, y los demás
 * con sus gramos y las kcal que salen de ellos, con su método (RN-D02). Un plan sin perfiles tiene una sola meta y no muestra
 * nada.
 */
export function DayProfilesTable({
  training,
  profiles,
}: {
  training: Targets;
  profiles: readonly DayProfile[];
}) {
  const [first] = profiles;
  if (!first) return null;
  const rows = [
    { key: 'TRAINING', name: 'Entrenamiento (prescripción)', ...training },
    ...profiles.map((profile) => ({ key: profile.code, ...profile })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <TableScroll label="Perfiles de día">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Metas de cada perfil de día</caption>
          <thead className="bg-surface text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Perfil de día
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Energía
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Carbohidratos
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Proteína
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Grasa
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {row.name}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(row.kcal, 'kcal')} kcal
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(row.choG, 'grams')} g
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(row.proteinG, 'grams')} g
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(row.fatG, 'grams')} g
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Las kcal de cada perfil salen de sus gramos.
        <MethodBadge
          label={methodLabel(first.method.methodCode)}
          code={first.method.methodCode}
          version={first.method.methodVersion}
        />
      </p>
    </div>
  );
}

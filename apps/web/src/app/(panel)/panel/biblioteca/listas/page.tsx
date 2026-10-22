import type { ExchangeListResponse } from '@nutricoach/contracts';
import { EmptyState, formatNumber, Notice, StatusBadge } from '@nutricoach/ui';
import { ListChecks } from 'lucide-react';
import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import { TableScroll } from '@/features/shell/table-scroll';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Listas de intercambio' };

/** Listas de intercambio publicadas y versionadas, con lo que aporta un intercambio de cada grupo (RN-E11, R4). */
export default async function ExchangeListsPage() {
  const response = await serverApi<ExchangeListResponse>('/exchange-lists');
  if (!response.ok) return <Notice tone="danger" title="No pudimos cargar las listas" />;
  const { lists } = response.data;
  if (lists.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Todavía no hay listas de intercambio"
        description="Las listas se usan para armar dietas por intercambios."
      />
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {lists.map((list) => (
        <Section
          key={list.id}
          title={`${list.name} · versión ${list.version}`}
          description="Lo que aporta un intercambio de cada grupo."
        >
          {list.provisional ? (
            <div className="flex flex-col items-start gap-2">
              <StatusBadge tone="warning">Provisional</StatusBadge>
              {list.note ? <p className="text-sm text-muted-foreground">{list.note}.</p> : null}
            </div>
          ) : null}
          <TableScroll label={`Grupos de ${list.name}`}>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Grupos de {list.name}</caption>
              <thead className="bg-surface text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Grupo
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Carbohidratos
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Proteínas
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Grasas
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Energía
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.groups.map((group) => (
                  <tr key={group.code} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      {group.name}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(group.choG, 'grams')} g
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(group.proteinG, 'grams')} g
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(group.fatG, 'grams')} g
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(group.kcal, 'kcal')} kcal
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Section>
      ))}
    </div>
  );
}

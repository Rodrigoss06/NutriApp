// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColumnChart, TargetVsActualChart, TrendChart } from './chart';

const format = (value: number | null) => (value === null ? '—' : String(value));

/** Las filas de la tabla accesible del gráfico, como las lee un lector de pantalla. */
function tableRows(html: string): string[][] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('.sr-only table tr')].map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => cell.textContent),
  );
}

describe('Gráficos · cada uno con su tabla accesible (WCAG 1.1.1)', () => {
  it('meta contra real: un día sin registro queda con raya, no con 0 (RF-32)', () => {
    const html = renderToStaticMarkup(
      <TargetVsActualChart
        title="Energía del día"
        unit="kcal"
        format={format}
        points={[
          { label: '2 nov', target: 1835, actual: 1900 },
          { label: '3 nov', target: 1835, actual: null },
        ]}
      />,
    );

    expect(tableRows(html)).toEqual([
      ['Fecha', 'Meta (kcal)', 'Real (kcal)'],
      ['2 nov', '1835', '1900'],
      ['3 nov', '1835', '—'],
    ]);
  });

  it('columnas por semana con lo programado como referencia (RF-33)', () => {
    const html = renderToStaticMarkup(
      <ColumnChart
        title="Sesiones por semana"
        unit="sesiones"
        format={format}
        valueName="Registradas"
        referenceName="Programadas"
        categoryName="Semana"
        points={[
          { label: 'S1', value: 2, reference: 3 },
          { label: 'S2', value: null, reference: 3 },
        ]}
      />,
    );

    expect(tableRows(html)).toEqual([
      ['Semana', 'Registradas (sesiones)', 'Programadas (sesiones)'],
      ['S1', '2', '3'],
      ['S2', '—', '3'],
    ]);
  });

  it('sin referencia, solo la columna de lo hecho', () => {
    const html = renderToStaticMarkup(
      <ColumnChart
        title="Tonelaje por semana"
        unit="kg"
        format={format}
        valueName="Tonelaje"
        categoryName="Semana"
        points={[{ label: 'S1', value: 1440 }]}
      />,
    );

    expect(tableRows(html)).toEqual([
      ['Semana', 'Tonelaje (kg)'],
      ['S1', '1440'],
    ]);
  });

  it('una serie en el tiempo: el 1RM estimado (RN-F04)', () => {
    const html = renderToStaticMarkup(
      <TrendChart
        title="1RM de sentadilla goblet"
        description="Epley (1985)"
        unit="kg"
        format={format}
        seriesName="1RM estimado"
        categoryName="Fecha"
        points={[
          { label: '1 nov', value: 76 },
          { label: '4 nov', value: 80 },
        ]}
      />,
    );

    expect(html).toContain('Epley (1985)');
    expect(tableRows(html)).toEqual([
      ['Fecha', '1RM estimado (kg)'],
      ['1 nov', '76'],
      ['4 nov', '80'],
    ]);
  });
});

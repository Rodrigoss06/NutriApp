// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandStyle } from '../brand/brand-style';
import { Button } from './button';
import { DataTable } from './data-table';
import { EmptyState } from './empty-state';
import { IndicatorCard } from './indicator-card';
import { MethodBadge } from './method-badge';
import { Notice, StatusBadge } from './notice';
import { NumberField } from './number-field';
import { Steps } from './steps';

afterEach(cleanup);

describe('NumberField · teclado numérico con unidad (RF-11)', () => {
  it('abre el teclado decimal, muestra la unidad y entrega el número con coma o punto', () => {
    const onValueChange = vi.fn();
    render(<NumberField label="Tríceps" unit="mm" value={null} onValueChange={onValueChange} />);
    const input = screen.getByLabelText('Tríceps');

    expect(input.getAttribute('type')).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.getAttribute('aria-describedby')).toContain(screen.getByText('mm').id);

    fireEvent.change(input, { target: { value: '12,4' } });
    fireEvent.change(input, { target: { value: '12.4' } });
    fireEvent.change(input, { target: { value: 'doce' } });

    expect(onValueChange.mock.calls).toEqual([[12.4], [12.4], [null]]);
  });

  it('el error queda ligado al campo y se anuncia', () => {
    render(
      <NumberField
        label="Peso"
        unit="kg"
        value={500}
        onValueChange={() => {}}
        error="Fuera de rango (RN-C04)"
      />,
    );
    const input = screen.getByLabelText('Peso');

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Fuera de rango (RN-C04)');
    expect(input.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
  });
});

describe('DataTable · paginación por cursor (06 §5)', () => {
  const pages: Record<string, { rows: { id: string; kg: number }[]; next: string | null }> = {
    first: { rows: [{ id: 'a', kg: 80 }], next: 'c2' },
    c2: { rows: [{ id: 'b', kg: 79.5 }], next: 'c3' },
    c3: { rows: [{ id: 'c', kg: 79 }], next: null },
  };

  function Harness({ onCursor }: { onCursor: (cursor: string | null) => void }) {
    const [cursor, setCursor] = useState<string | null>(null);
    const page = pages[cursor ?? 'first'] ?? { rows: [], next: null };
    return (
      <DataTable
        caption="Pesos"
        columns={[
          { key: 'kg', header: 'Peso', numeric: true, cell: (row: { kg: number }) => row.kg },
        ]}
        rows={page.rows}
        rowKey={(row) => row.id}
        nextCursor={page.next}
        onCursorChange={(next) => {
          onCursor(next);
          setCursor(next);
        }}
      />
    );
  }

  it('«Anterior» vuelve con la pila de cursores: la API solo da nextCursor', () => {
    const onCursor = vi.fn();
    render(<Harness onCursor={onCursor} />);
    const previous = screen.getByRole('button', { name: 'Anterior' });
    const next = screen.getByRole('button', { name: 'Siguiente' });

    expect(previous).toHaveProperty('disabled', true);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(next).toHaveProperty('disabled', true);
    fireEvent.click(previous);
    fireEvent.click(previous);

    expect(onCursor.mock.calls).toEqual([['c2'], ['c3'], ['c2'], [null]]);
    expect(previous).toHaveProperty('disabled', true);
    expect(screen.getByRole('cell').className).toContain('tabular-nums');
  });

  it('sin filas en la primera página muestra el estado vacío', () => {
    render(
      <DataTable
        caption="Vacía"
        columns={[]}
        rows={[]}
        rowKey={() => ''}
        nextCursor={null}
        onCursorChange={() => {}}
        empty={<EmptyState icon={Inbox} title="Aún no hay pacientes" />}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Aún no hay pacientes' })).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('WCAG 1.4.1 · estados con ícono y texto, nunca solo color', () => {
  it('el aviso dice su tono en texto y cita la regla', () => {
    render(
      <Notice tone="warning" title="Ritmo de pérdida alto" rule="RN-E04">
        1.2 % por semana
      </Notice>,
    );
    const notice = screen.getByRole('status');

    expect(notice.textContent).toContain('Aviso:');
    expect(notice.textContent).toContain('(RN-E04)');
    expect(notice.querySelector('svg')).not.toBeNull();
  });

  it('un error se anuncia como alerta', () => {
    render(<Notice tone="danger" title="No se pudo guardar" />);
    expect(screen.getByRole('alert').textContent).toContain('Error:');
  });

  it('la insignia de estado lleva ícono y texto', () => {
    render(<StatusBadge tone="success">En rango</StatusBadge>);
    const badge = screen.getByText('En rango');

    expect(badge.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('RN-D02 · ningún número sin su método', () => {
  it('la tarjeta muestra valor, unidad y método; el lector de pantalla oye «Método»', () => {
    render(
      <IndicatorCard
        label="% de grasa"
        value="20.3"
        unit="%"
        method={
          <MethodBadge
            label="Durnin & Womersley (1974) + Siri"
            code="FAT_DW1974_SIRI1961"
            version="1.0.0"
          />
        }
      />,
    );
    const card = screen.getByRole('heading', { name: '% de grasa' }).parentElement;

    expect(card?.textContent).toContain('20.3%Método: Durnin & Womersley (1974) + Siri');
    expect(screen.getByTitle('FAT_DW1974_SIRI1961 · v1.0.0')).toBeDefined();
  });
});

describe('componentes base', () => {
  it('el botón es type="button" por defecto y, con asChild, toma el elemento hijo', () => {
    render(
      <>
        <Button>Guardar</Button>
        <Button asChild variant="secondary">
          <a href="/mi/plan">Ver plan</a>
        </Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Guardar' }).getAttribute('type')).toBe('button');
    const link = screen.getByRole('link', { name: 'Ver plan' });
    expect(link.getAttribute('type')).toBeNull();
    expect(link.className).toContain('text-brand-text');
  });

  it('los pasos marcan el actual y los completados', () => {
    render(
      <Steps
        steps={[
          { id: 'nivel', label: 'Nivel' },
          { id: 'tomas', label: 'Tomas' },
          { id: 'cierre', label: 'Cierre' },
        ]}
        currentId="tomas"
      />,
    );

    expect(screen.getByText('Tomas').closest('li')?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('Nivel').closest('li')?.textContent).toContain('(completado)');
  });
});

describe('RN-H03 · BrandStyle pinta la marca desde el servidor', () => {
  it('emite :root con las variables --brand-* y descarta un color inválido', () => {
    const html = renderToStaticMarkup(<BrandStyle brand={{ primary: '#1A1A2E' }} />);
    const invalid = renderToStaticMarkup(<BrandStyle brand={{ primary: 'red;}*{display:none' }} />);

    expect(html).toContain(':root{--brand-primary:#1a1a2e;');
    expect(invalid).toContain('--brand-primary:#0f766e');
    expect(invalid).not.toContain('display:none');
  });
});

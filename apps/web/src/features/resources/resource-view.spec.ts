import { describe, expect, it } from 'vitest';
import { articleBlocks, inlineParts, resourceAction } from './resource-view';

const ID = '0193a000-0000-7000-8000-000000000001';

describe('RF-30 · el artículo en pantalla, con formato simple (ADR-094)', () => {
  it('títulos, párrafos y listas; las líneas seguidas son un mismo párrafo', () => {
    expect(
      articleBlocks(
        '# Agua\n\nToma agua\na lo largo del día.\n\n## Cuánta\n- 8 vasos\n* Más si entrenas\n',
      ),
    ).toEqual([
      { type: 'heading', level: 2, text: 'Agua' },
      { type: 'paragraph', text: 'Toma agua a lo largo del día.' },
      { type: 'heading', level: 3, text: 'Cuánta' },
      { type: 'list', items: ['8 vasos', 'Más si entrenas'] },
    ]);
  });

  it('el HTML es texto: nada se interpreta', () => {
    expect(articleBlocks('<script>alert(1)</script>')).toEqual([
      { type: 'paragraph', text: '<script>alert(1)</script>' },
    ]);
  });

  it('**negrita** dentro de una línea; un par sin cerrar queda como texto', () => {
    expect(inlineParts('Toma **8 vasos** al día')).toEqual([
      { text: 'Toma ', strong: false },
      { text: '8 vasos', strong: true },
      { text: ' al día', strong: false },
    ]);
    expect(inlineParts('Sin **cerrar')).toEqual([{ text: 'Sin **cerrar', strong: false }]);
  });

  it('cada tipo con su acción: abrir el enlace o el video afuera, descargar el PDF por la API', () => {
    expect(resourceAction({ id: ID, kind: 'LINK', url: 'https://example.com' })).toEqual({
      label: 'Abrir el enlace',
      href: 'https://example.com',
      external: true,
    });
    expect(resourceAction({ id: ID, kind: 'VIDEO', url: 'https://example.com/v' })?.label).toBe(
      'Ver el video',
    );
    expect(resourceAction({ id: ID, kind: 'FILE', url: null })).toEqual({
      label: 'Descargar el PDF',
      href: `/api/v1/me/resources/${ID}/file`,
      external: false,
    });
    expect(resourceAction({ id: ID, kind: 'ARTICLE', url: null })).toBeNull();
  });
});

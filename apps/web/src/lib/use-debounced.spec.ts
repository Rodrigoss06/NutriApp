// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { useDebounced } from './use-debounced';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ADR-060 · la vista previa espera a que se deje de escribir', () => {
  it('un cuerpo pasado como texto JSON se estabiliza: un objeto nuevo en cada render no vuelve a renderizar', () => {
    let renders = 0;
    const { result, rerender } = renderHook(
      ({ grams }: { grams: number }) => {
        renders += 1;
        const body = { items: [{ grams }] };
        return useDebounced(JSON.stringify(body), 300);
      },
      { initialProps: { grams: 100 } },
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const settled = renders;
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(renders).toBe(settled);

    rerender({ grams: 150 });
    expect(result.current).toBe('{"items":[{"grams":100}]}');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('{"items":[{"grams":150}]}');
  });

  it('solo acepta valores que se comparan por valor', () => {
    expectTypeOf(useDebounced).parameter(0).toEqualTypeOf<string | number | boolean | null>();
  });
});

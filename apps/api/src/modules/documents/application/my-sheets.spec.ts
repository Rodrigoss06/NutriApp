import { describe, expect, it } from 'vitest';
import { mySheetSources } from './my-sheets.js';

const PLAN = '0193a000-0000-7000-8000-000000000001';
const PROGRAM = '0193a000-0000-7000-8000-000000000002';
const LAST = '0193a000-0000-7000-8000-000000000003';
const FIRST = '0193a000-0000-7000-8000-000000000004';

describe('ADR-080 · ADR-095 · las fichas vigentes en la app del paciente', () => {
  it('el plan y la rutina que ve en su app; los resultados y la evolución de su última evaluación cerrada', () => {
    expect(
      mySheetSources({
        plans: { nutritionPlanId: PLAN, trainingProgramId: PROGRAM },
        closedEvaluationIds: [LAST, FIRST],
      }),
    ).toEqual({
      PLAN: { type: 'NUTRITION_PLAN', id: PLAN },
      PROGRAM: { type: 'TRAINING_PROGRAM', id: PROGRAM },
      RESULTS: { type: 'EVALUATION', id: LAST },
      EVOLUTION: { type: 'EVALUATION', id: LAST, kind: 'EVOLUTION' },
    });
  });

  it('con una sola evaluación no hay evolución; sin plan, rutina ni evaluaciones, ninguna ficha', () => {
    expect(
      Object.keys(
        mySheetSources({
          plans: { nutritionPlanId: null, trainingProgramId: PROGRAM },
          closedEvaluationIds: [LAST],
        }),
      ),
    ).toEqual(['PROGRAM', 'RESULTS']);
    expect(
      mySheetSources({
        plans: { nutritionPlanId: null, trainingProgramId: null },
        closedEvaluationIds: [],
      }),
    ).toEqual({});
  });
});

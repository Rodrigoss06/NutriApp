import { z } from 'zod';

/** PUT /api/v1/patients/:id/food-exclusions/:conditionId: los alimentos que excluye esa alergia o intolerancia (RN-E17). */
export const setFoodExclusionsSchema = z.strictObject({
  foodIds: z.array(z.uuid()).max(50),
});
export type SetFoodExclusions = z.infer<typeof setFoodExclusionsSchema>;

/**
 * GET /api/v1/patients/:id/food-exclusions: las alergias e intolerancias activas con sus alimentos. publishedPlan solo
 * viene si el plan vigente lleva alguno, porque lo publicado no cambia (RN-E15): hay que crear una versión nueva.
 */
export const foodExclusionListResponseSchema = z.object({
  conditions: z.array(
    z.object({
      conditionId: z.uuid(),
      kind: z.enum(['ALLERGY', 'INTOLERANCE']),
      label: z.string(),
      foods: z.array(z.object({ id: z.uuid(), name: z.string() })),
    }),
  ),
  publishedPlan: z
    .object({
      id: z.uuid(),
      versionNo: z.number().int(),
      problems: z.array(z.string()),
    })
    .nullable(),
});
export type FoodExclusionListResponse = z.infer<typeof foodExclusionListResponseSchema>;

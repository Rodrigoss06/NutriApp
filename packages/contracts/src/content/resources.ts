import { z } from 'zod';

/** Material educativo (RF-30, 05.3 `content.educational_resource`, ADR-094): los cuatro tipos que admite el modelo. */
export const RESOURCE_KINDS = ['FILE', 'LINK', 'VIDEO', 'ARTICLE'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const RESOURCE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const RESOURCE_TITLE_MAX = 120;
/** Un artículo cabe en una pantalla larga: hasta 20 000 caracteres de texto con formato simple. */
export const ARTICLE_MAX = 20_000;
export const RESOURCE_TAGS_MAX = 10;
export const RESOURCE_TAG_MAX = 30;

const title = z.string().trim().min(1).max(RESOURCE_TITLE_MAX);
/** Solo https: el paciente abre el enlace desde su app. */
const url = z.url({ protocol: /^https$/, hostname: z.regexes.domain }).max(2_000);
const body = z.string().trim().min(1).max(ARTICLE_MAX);
const tag = z.string().trim().toLowerCase().min(1).max(RESOURCE_TAG_MAX);
const tags = z
  .array(tag)
  .max(RESOURCE_TAGS_MAX)
  .refine((list) => new Set(list).size === list.length, 'Las etiquetas no se repiten.');

/** POST /api/v1/resources: un enlace, un video o un artículo. El archivo va por multipart a /resources/file. */
export const createResourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('LINK'), title, url, tags: tags.default([]) }),
  z.strictObject({ kind: z.literal('VIDEO'), title, url, tags: tags.default([]) }),
  z.strictObject({ kind: z.literal('ARTICLE'), title, bodyMarkdown: body, tags: tags.default([]) }),
]);
export type CreateResource = z.input<typeof createResourceSchema>;

/** Los campos del multipart de un PDF (campo «file», hasta 5 MB): el título y las etiquetas separadas por coma. */
export const uploadResourceFieldsSchema = z.strictObject({
  title,
  tags: z
    .string()
    .max(RESOURCE_TAGS_MAX * (RESOURCE_TAG_MAX + 1))
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(tags),
});

/** PATCH /api/v1/resources/:id: el tipo no cambia; archivar lo quita de la biblioteca y de la app, con sus asignaciones. */
export const updateResourceSchema = z
  .strictObject({
    title: title.optional(),
    tags: tags.optional(),
    url: url.optional(),
    bodyMarkdown: body.optional(),
    status: z.enum(RESOURCE_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Indica qué cambia.');
export type UpdateResource = z.input<typeof updateResourceSchema>;

const resourceBase = {
  id: z.uuid(),
  kind: z.enum(RESOURCE_KINDS),
  title: z.string(),
  url: z.string().nullable(),
  tags: z.array(z.string()),
};

/** Un recurso de la biblioteca, sin el texto del artículo; con cuántos pacientes lo tienen asignado. */
export const resourceSchema = z.object({
  ...resourceBase,
  status: z.enum(RESOURCE_STATUSES),
  assignedCount: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type Resource = z.infer<typeof resourceSchema>;

export const resourceListSchema = z.object({ resources: z.array(resourceSchema) });
export type ResourceList = z.infer<typeof resourceListSchema>;

export const resourceDetailSchema = resourceSchema.extend({ bodyMarkdown: z.string().nullable() });
export type ResourceDetail = z.infer<typeof resourceDetailSchema>;

/** POST /api/v1/patients/:id/resources: asignar uno de la biblioteca. Repetirlo no duplica. */
export const assignResourceSchema = z.strictObject({ resourceId: z.uuid() });
export type AssignResource = z.input<typeof assignResourceSchema>;

/** Lo asignado a un paciente: cuándo y si ya lo abrió en su app. */
export const assignedResourceSchema = z.object({
  ...resourceBase,
  status: z.enum(RESOURCE_STATUSES),
  assignedAt: z.iso.datetime(),
  viewedAt: z.iso.datetime().nullable(),
});
export type AssignedResource = z.infer<typeof assignedResourceSchema>;

export const assignedResourcesSchema = z.object({ resources: z.array(assignedResourceSchema) });
export type AssignedResources = z.infer<typeof assignedResourcesSchema>;

/** GET /api/v1/me/resources: lo vigente que su equipo le asignó, lo más nuevo primero. */
export const meResourceSchema = z.object({
  ...resourceBase,
  assignedAt: z.iso.datetime(),
  viewedAt: z.iso.datetime().nullable(),
});
export type MeResource = z.infer<typeof meResourceSchema>;

export const meResourcesSchema = z.object({ resources: z.array(meResourceSchema) });
export type MeResources = z.infer<typeof meResourcesSchema>;

export const meResourceDetailSchema = meResourceSchema.extend({
  bodyMarkdown: z.string().nullable(),
});
export type MeResourceDetail = z.infer<typeof meResourceDetailSchema>;

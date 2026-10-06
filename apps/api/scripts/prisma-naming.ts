/**
 * Nombres de Prisma después de `prisma db pull` (Notion 05 §10, ADR-024): modelos en PascalCase y singular
 * con `@@map`, campos en camelCase con `@map`. Solo toca lo que db pull trae en snake_case, así que es
 * idempotente: los modelos ya nombrados se conservan al volver a introspectar y CI compara el resultado.
 *
 * Uso: node scripts/prisma-naming.ts [ruta de schema.prisma]
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Tablas cuyo nombre solo es ambiguo o demasiado genérico; la clave es esquema.tabla. */
const MODEL_OVERRIDES: Readonly<Record<string, string>> = {
  'iam.session': 'Session',
  'training.session': 'TrainingSession',
  'nutrition.plan': 'NutritionPlan',
  'training.program': 'TrainingProgram',
  'food.source': 'FoodSource',
  'documents.template': 'DocumentTemplate',
};

/** Relaciones que db pull nombra por la FK (autorrelaciones); la clave es esquema.tabla.campo. */
const RELATION_OVERRIDES: Readonly<Record<string, string>> = {
  'assessment.calculation_result.calculation_result': 'supersededByResult',
  'assessment.calculation_result.other_calculation_result': 'supersedes',
  'assessment.evaluation.evaluation': 'amendsEvaluation',
  'assessment.evaluation.other_evaluation': 'amendments',
  'clinical.clinical_note.clinical_note': 'amendsNote',
  'clinical.clinical_note.other_clinical_note': 'amendments',
  'exercise.exercise.exercise_exercise_easier_variant_idToexercise': 'easierVariant',
  'exercise.exercise.other_exercise_exercise_easier_variant_idToexercise': 'easierVariantOf',
  'exercise.exercise.exercise_exercise_harder_variant_idToexercise': 'harderVariant',
  'exercise.exercise.other_exercise_exercise_harder_variant_idToexercise': 'harderVariantOf',
};

interface Field {
  readonly line: number;
  readonly name: string;
  readonly type: string;
  readonly isList: boolean;
  newName: string;
}

interface Model {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly table: string;
  readonly schema: string;
  readonly hasMap: boolean;
  readonly fields: Field[];
  newName: string;
}

const FIELD = /^(\s+)(\w+)(\s+)(\w+)(\[\]|\?)?(.*)$/;
const isSnake = (name: string): boolean => /_/.test(name) || /^[a-z]/.test(name);
const camel = (name: string): string =>
  name.replace(/_+([a-zA-Z0-9])/g, (_: string, c: string) => c.toUpperCase());
const pascal = (name: string): string => {
  const c = camel(name);
  return c.charAt(0).toUpperCase() + c.slice(1);
};
const lowerFirst = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);

function parse(lines: readonly string[]): Map<string, Model> {
  const models = new Map<string, Model>();
  for (let i = 0; i < lines.length; i += 1) {
    const header = /^model (\w+) \{$/.exec(lines[i] ?? '');
    if (!header?.[1]) continue;
    const name = header[1];
    let end = i + 1;
    while (lines[end] !== '}') end += 1;
    const body = lines.slice(i + 1, end);
    const mapped = body.map((l) => /^\s+@@map\("([^"]+)"\)/.exec(l)?.[1]).find(Boolean);
    const schema = body.map((l) => /^\s+@@schema\("([^"]+)"\)/.exec(l)?.[1]).find(Boolean) ?? '';
    const fields: Field[] = [];
    body.forEach((l, k) => {
      const m = FIELD.exec(l);
      if (!m?.[2] || !m[4] || l.trim().startsWith('@@') || l.trim().startsWith('//')) return;
      fields.push({
        line: i + 1 + k,
        name: m[2],
        type: m[4],
        isList: m[5] === '[]',
        newName: m[2],
      });
    });
    models.set(name, {
      name,
      start: i,
      end,
      table: mapped ?? name,
      schema,
      hasMap: mapped !== undefined,
      fields,
      newName: name,
    });
    i = end;
  }
  return models;
}

function plan(models: Map<string, Model>): void {
  for (const model of models.values()) {
    if (isSnake(model.name)) {
      model.newName = MODEL_OVERRIDES[`${model.schema}.${model.table}`] ?? pascal(model.table);
    }
  }
  for (const model of models.values()) {
    const taken = new Set<string>();
    for (const field of model.fields) {
      const target = models.get(field.type);
      if (!isSnake(field.name)) {
        taken.add(field.name);
        continue;
      }
      let name = camel(field.name);
      const override = RELATION_OVERRIDES[`${model.schema}.${model.table}.${field.name}`];
      if (target && override) {
        name = override;
      } else if (target && (field.name === target.name || field.name === target.table)) {
        // Relación con el nombre de la tabla destino: user_account → userAccount, session → sessions.
        name = lowerFirst(target.newName) + (field.isList ? 's' : '');
      }
      if (taken.has(name)) name = camel(field.name);
      field.newName = name;
      taken.add(name);
    }
  }
}

/** Renombra los campos citados dentro de una lista de atributo: `fields: [user_id]`, `@@id([id, local_date])`. */
function renameInLists(text: string, names: ReadonlyMap<string, string>, key?: string): string {
  const pattern = key ? new RegExp(`(${key}:\\s*\\[)([^\\]]*)(\\])`, 'g') : /(\(\[)([^\]]*)(\])/g;
  return text.replace(pattern, (_: string, open: string, inner: string, close: string) => {
    const renamed = inner.replace(/\b(\w+)\b(?!:)/g, (token: string) => names.get(token) ?? token);
    return `${open}${renamed}${close}`;
  });
}

function apply(lines: string[], models: Map<string, Model>): string[] {
  const out = [...lines];
  const ordered = [...models.values()].sort((a, b) => b.start - a.start);
  for (const model of ordered) {
    const own = new Map(model.fields.map((f) => [f.name, f.newName]));
    for (const field of model.fields) {
      const m = FIELD.exec(out[field.line] ?? '');
      if (!m) continue;
      const [, indent = '', , gap = '', type = '', suffix = '', rest = ''] = m;
      const target = models.get(type);
      let attrs = rest;
      if (target) {
        attrs = renameInLists(attrs, own, 'fields');
        attrs = renameInLists(
          attrs,
          new Map(target.fields.map((f) => [f.name, f.newName])),
          'references',
        );
      } else if (field.newName !== field.name && !/@map\(/.test(attrs)) {
        attrs = attrs.replace(/^(\s*)(.*)$/, (_: string, s: string, a: string) =>
          a.length > 0 ? `${s}${a} @map("${field.name}")` : ` @map("${field.name}")`,
        );
      }
      out[field.line] =
        `${indent}${field.newName}${gap}${target?.newName ?? type}${suffix}${attrs}`;
    }
    for (let k = model.start + 1; k < model.end; k += 1) {
      const line = out[k] ?? '';
      if (/^\s+@@(id|unique|index)\(/.test(line)) out[k] = renameInLists(line, own);
    }
    if (model.newName !== model.name) {
      out[model.start] = `model ${model.newName} {`;
      if (!model.hasMap) {
        const schemaLine = out.findIndex(
          (l, k) => k > model.start && k < model.end && /^\s+@@schema\(/.test(l),
        );
        out.splice(schemaLine, 0, `  @@map("${model.table}")`);
      }
    }
  }
  return out;
}

const HEADER =
  '// Generado con `pnpm db:pull` desde la base: no se edita a mano (ADR-011, ADR-024).';

const path = process.argv[2] ?? 'prisma/schema.prisma';
const source = readFileSync(path, 'utf8');
const lines = (source.startsWith(HEADER) ? source : `${HEADER}\n\n${source}`).split('\n');
const models = parse(lines);
plan(models);
const renamed = [...models.values()].filter((m) => m.newName !== m.name).length;
writeFileSync(path, apply(lines, models).join('\n'));
console.log(`prisma-naming: ${String(models.size)} modelos, ${String(renamed)} renombrados`);

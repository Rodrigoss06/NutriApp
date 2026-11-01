import type { MethodCode } from '@nutricoach/engine';
import type { PatientCard } from '../../../clinical/index.js';
import type {
  EnergySummary,
  ExchangePlanDocument,
  PlanSnapshot,
} from '../../../nutrition/index.js';
import { ageOn } from '../../domain/sheet.js';
import type { AnthropometrySheet } from './anthropometry-sheet.js';
import type { MenuSheet } from './menu-sheet.js';
import type { TrainingSheet } from './training-sheet.js';

/**
 * Lo que una ficha muestra, sin la marca: datos planos que la plantilla dibuja tal cual. Su hash es el source_hash de
 * generated_document (RN-H02): si nada de esto cambia, el PDF es el mismo. Nada depende del día en que se genera.
 */

/** El paciente como lo nombra la ficha: la edad es la del día del origen. */
export interface SheetPatient {
  readonly code: string;
  readonly fullName: string;
  readonly sex: 'M' | 'F';
  readonly ageYears: number;
}

/** Un método con su versión, para el pie de cálculos de la ficha (RN-D01, RN-H04). */
export interface SheetMethod {
  readonly methodCode: MethodCode;
  readonly methodVersion: string;
}

export interface SheetAdequacy {
  readonly pct: number;
  readonly inRange: boolean;
}

/** La dieta por intercambios publicada (RF-19), con sus metas y cada número con su método (RN-D02). */
export interface ExchangeDietSheet {
  readonly kind: 'EXCHANGE_DIET';
  readonly patient: SheetPatient;
  readonly plan: {
    readonly versionNo: number;
    /** YYYY-MM-DD, fecha local del paciente. */
    readonly validFrom: string;
    readonly publishedAt: string;
    readonly engineVersion: string;
  };
  /** De dónde salen las metas; null si el contexto ya no ve la prescripción. */
  readonly energy: EnergySummary | null;
  readonly targets: ExchangePlanDocument['targets'];
  readonly totals: ExchangePlanDocument['totals'];
  readonly adequacy: {
    readonly rangePct: readonly [number, number];
    readonly kcal: SheetAdequacy;
    readonly cho: SheetAdequacy;
    readonly protein: SheetAdequacy;
    readonly fat: SheetAdequacy;
  };
  /** La lista de intercambio y su versión (RN-E11). */
  readonly list: { readonly name: string; readonly version: string; readonly provisional: boolean };
  /** Intercambios del día por grupo, con lo que aporta uno (lista de la versión del plan). */
  readonly groups: readonly {
    readonly code: string;
    readonly name: string;
    readonly servings: number;
    readonly choG: number;
    readonly proteinG: number;
    readonly fatG: number;
    readonly kcal: number;
  }[];
  /** Cada tiempo con sus intercambios y lo que el paciente puede elegir en cada grupo, con su porción. */
  readonly meals: readonly {
    readonly name: string;
    readonly timeOfDay: string | null;
    readonly sharePct: number;
    readonly exchanges: readonly {
      readonly groupName: string;
      readonly servings: number;
      readonly foods: readonly {
        readonly name: string;
        readonly grams: number;
        readonly householdText: string | null;
      }[];
    }[];
  }[];
  readonly hydrationMl: number | null;
  readonly instructions: string | null;
  readonly methods: readonly SheetMethod[];
}

export type SheetContent = ExchangeDietSheet | MenuSheet | AnthropometrySheet | TrainingSheet;

export function sheetPatient(card: PatientCard, onDate: string): SheetPatient {
  return {
    code: card.code,
    fullName: card.fullName,
    sex: card.sex,
    ageYears: ageOn(card.birthDate, onDate),
  };
}

/** La ficha de una dieta por intercambios publicada, desde su snapshot (RN-E15): lo que se publicó, nada más. */
export function exchangeDietSheet(
  snapshot: PlanSnapshot & ExchangePlanDocument,
  patient: SheetPatient,
  energy: EnergySummary | null,
): ExchangeDietSheet {
  const groups = new Map(snapshot.exchangeList.groups.map((group) => [group.code, group]));
  const groupName = (code: string) => groups.get(code as never)?.name ?? code;
  return {
    kind: 'EXCHANGE_DIET',
    patient,
    plan: {
      versionNo: snapshot.versionNo,
      validFrom: snapshot.validFrom,
      publishedAt: snapshot.publishedAt,
      engineVersion: snapshot.engineVersion,
    },
    energy,
    targets: snapshot.targets,
    totals: snapshot.totals,
    adequacy: snapshot.adequacy,
    list: {
      name: snapshot.exchangeList.name,
      version: snapshot.exchangeList.version,
      provisional: snapshot.exchangeList.provisional,
    },
    groups: snapshot.exchanges
      .filter((exchange) => exchange.servings > 0)
      .map((exchange) => {
        const group = groups.get(exchange.groupCode);
        return {
          code: exchange.groupCode,
          name: groupName(exchange.groupCode),
          servings: exchange.servings,
          choG: group?.choG ?? 0,
          proteinG: group?.proteinG ?? 0,
          fatG: group?.fatG ?? 0,
          kcal: group?.kcal ?? 0,
        };
      }),
    meals: snapshot.meals.map((meal) => ({
      name: meal.name,
      timeOfDay: meal.timeOfDay,
      sharePct: meal.sharePct,
      exchanges: snapshot.exchanges
        .map((exchange) => exchange.groupCode)
        .filter((code) => meal.servings[code] > 0)
        .map((code) => ({
          groupName: groupName(code),
          servings: meal.servings[code],
          foods: meal.allowedFoods
            .filter((food) => food.groupCode === code)
            .map((food) => ({
              name: food.foodName,
              grams: food.grams,
              householdText: food.householdText,
            })),
        })),
    })),
    hydrationMl: snapshot.hydrationTargetMl,
    instructions: snapshot.instructions,
    methods: uniqueMethods(snapshot.methods),
  };
}

/** Cada método con su versión una sola vez, en el orden en que se usó. */
export function uniqueMethods(methods: readonly SheetMethod[]): readonly SheetMethod[] {
  const seen = new Map<string, SheetMethod>();
  for (const { methodCode, methodVersion } of methods) {
    seen.set(`${methodCode}@${methodVersion}`, { methodCode, methodVersion });
  }
  return [...seen.values()];
}

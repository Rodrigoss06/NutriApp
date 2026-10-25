import { Inject, Injectable } from '@nestjs/common';
import { canonicalJson, sha256Hex } from '@nutricoach/engine';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { NutritionApi } from '../../nutrition/index.js';
import { TenancyApi } from '../../tenancy/index.js';
import {
  planSheetKind,
  resolveSheetBrand,
  type SheetBrand,
  type SheetKind,
  type SourceType,
} from '../domain/sheet.js';
import type { DocumentKey } from './ports/documents.ports.js';
import { exchangeDietSheet, sheetPatient, type SheetContent } from './sheets/sheet-content.js';

/** El origen de una ficha (RN-H02). */
export interface SheetSource {
  readonly type: SourceType;
  readonly id: string;
}

/** Una ficha lista para dibujar o para buscar si ya existe: su contenido, su marca y quién la firma. */
export interface PreparedSheet {
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly kind: SheetKind;
  readonly source: SheetSource;
  readonly content: SheetContent;
  readonly brand: SheetBrand;
  /** La fecha del origen (publicación o cierre): la del PDF, para que no dependa del reloj. */
  readonly issuedAt: Date;
  /** Quien publicó el plan o hizo la evaluación: su marca propia manda (RN-H03). */
  readonly authorUserId: UserId;
}

export type SheetPreparation =
  | { readonly ok: true; readonly sheet: PreparedSheet }
  | { readonly ok: false; readonly reason: 'NOT_FOUND' | 'NOT_PUBLISHED' | 'NOT_SUPPORTED' };

/** Lo que identifica el PDF de una ficha preparada con una versión de su plantilla (RN-H02). */
export function documentKey(sheet: PreparedSheet, templateVersion: string): DocumentKey {
  return {
    kind: sheet.kind,
    sourceType: sheet.source.type,
    sourceId: sheet.source.id,
    sourceHash: sha256Hex(canonicalJson(sheet.content)),
    templateVersion,
    brandingHash: sha256Hex(canonicalJson(sheet.brand)),
  };
}

/**
 * Arma una ficha desde su origen con las API públicas de nutrition, clinical y tenancy (02 §3), en la transacción de
 * quien llama: en la API, con la RLS del profesional (RN-A05); en el worker, con el contexto SYSTEM.
 */
@Injectable()
export class SheetSources {
  constructor(
    @Inject(NutritionApi) private readonly nutrition: NutritionApi,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  async prepare(organizationId: OrganizationId, source: SheetSource): Promise<SheetPreparation> {
    switch (source.type) {
      case 'NUTRITION_PLAN':
        return this.#plan(organizationId, source);
      case 'EVALUATION':
      case 'TRAINING_PROGRAM':
        return { ok: false, reason: 'NOT_SUPPORTED' };
    }
  }

  async #plan(organizationId: OrganizationId, source: SheetSource): Promise<SheetPreparation> {
    const plan = await this.nutrition.publishedPlan(source.id);
    if (!plan) {
      const draft = (await this.nutrition.planStatus(source.id)) === 'DRAFT';
      return { ok: false, reason: draft ? 'NOT_PUBLISHED' : 'NOT_FOUND' };
    }
    const { snapshot } = plan;
    // La ficha del menú, también para la composición, llega en el PR 2 de P11.
    if (snapshot.modality !== 'EXCHANGES') return { ok: false, reason: 'NOT_SUPPORTED' };
    const card = await this.clinical.patientCard(plan.patientId);
    if (!card) return { ok: false, reason: 'NOT_FOUND' };
    const author = snapshot.publishedBy as UserId;
    const branding = await this.tenancy.sheetBranding(organizationId, author);
    if (!branding) return { ok: false, reason: 'NOT_FOUND' };
    return {
      ok: true,
      sheet: {
        organizationId,
        patientId: plan.patientId,
        kind: planSheetKind(snapshot.modality),
        source,
        content: exchangeDietSheet(
          snapshot,
          sheetPatient(card, snapshot.validFrom),
          await this.nutrition.energySummary(snapshot.energyPrescriptionId),
        ),
        brand: resolveSheetBrand(branding.member, branding.organization, branding.organizationName),
        issuedAt: new Date(snapshot.publishedAt),
        authorUserId: author,
      },
    };
  }
}

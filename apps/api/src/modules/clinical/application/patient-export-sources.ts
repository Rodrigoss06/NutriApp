import { Injectable } from '@nestjs/common';
import type { OrganizationId } from '@nutricoach/shared-kernel';

/**
 * Una tabla de la exportación del paciente (RN-B04, ADR-131): sus filas tal como están, en JSON y en CSV. `where` es SQL fijo del
 * contexto dueño de la tabla, con $1 = el paciente y $2 = el miembro que pidió la exportación (null si la pidió el paciente); por
 * defecto, `patient_id = $1`. `orderBy` por defecto es `id`.
 */
export interface PatientExportTable {
  /** esquema.tabla */
  readonly table: string;
  readonly where?: string;
  readonly orderBy?: string;
}

/**
 * Lo que un contexto suma a la exportación: sus tablas y, si hace falta, algo que preparar antes de leerlas (documents genera las
 * fichas vigentes que falten). Corre en el worker, como SYSTEM de la organización: `prepare` fuera de toda transacción (abre las suyas,
 * cortas) y las tablas de cada fuente en una de solo lectura. Los archivos del paciente no se declaran aquí: van todos los de
 * platform.file_object con su id (ADR-131).
 */
export interface PatientExportSource {
  readonly context: string;
  readonly tables: readonly PatientExportTable[];
  prepare?(organizationId: OrganizationId, patientId: string): Promise<void>;
  /** Para lo que se guarda cifrado: devuelve la fila como la ve el paciente (clinical descifra su documento y su teléfono). */
  present?(table: string, row: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/**
 * Lo que tiene patient_id y no entra, con su motivo. La prueba del catálogo (patient-export.int.spec.ts) falla si una tabla con
 * patient_id, o hija de una que entra, no está en ninguna fuente ni aquí.
 */
export const NOT_EXPORTED: Readonly<Record<string, string>> = {
  'analytics.patient_daily_summary': 'Se calcula desde los registros, que sí van (05 §1).',
  'analytics.patient_weekly_muscle_volume': 'Se calcula desde los registros, que sí van (05 §1).',
  'analytics.exercise_one_rm_series': 'Se calcula desde los registros, que sí van (05 §1).',
  'analytics.patient_overview': 'Son las alertas del panel, calculadas desde lo demás.',
  'audit.audit_log': 'Registra los accesos de la organización; no es un dato del paciente.',
  'iam.invitation': 'Guarda el token de acceso a la app.',
  'clinical.patient_export': 'Son los pedidos de exportación.',
  'platform.file_object': 'Los archivos van en sus carpetas, con su índice en archivos.csv.',
};

/**
 * Registro de fuentes: los contextos se registran al iniciar con ClinicalApi, así clinical no importa a quienes lo importan (sin
 * ciclos, como las fuentes de la línea de tiempo).
 */
@Injectable()
export class PatientExportSources {
  readonly #sources: PatientExportSource[] = [];

  register(source: PatientExportSource): void {
    const taken = new Set(this.#sources.flatMap((s) => s.tables.map((t) => t.table)));
    for (const { table } of source.tables) {
      if (!/^[a-z_]+\.[a-z_]+$/.test(table))
        throw new Error(`Tabla de exportación inválida: «${table}».`);
      if (taken.has(table)) throw new Error(`La tabla «${table}» ya está en la exportación.`);
    }
    this.#sources.push(source);
  }

  all(): readonly PatientExportSource[] {
    return this.#sources;
  }
}

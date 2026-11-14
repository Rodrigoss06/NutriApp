import { Injectable } from '@nestjs/common';
import { zipSync, type Zippable } from 'fflate';
import type { ArchiveWriter } from '../../../application/ports/patient-export.ports.js';
import type { ArchiveEntry } from '../../../application/patient-export-archive.js';

/**
 * El ZIP de la exportación con fflate (ADR-124), en el worker: el JSON y los CSV comprimidos; los PDF, JPEG y PNG tal cual, porque ya
 * vienen comprimidos. En memoria: alcanza para un paciente de la versión 1.0 (ADR-131).
 */
@Injectable()
export class FflateArchiveWriter implements ArchiveWriter {
  zip(entries: readonly ArchiveEntry[]): Promise<Uint8Array> {
    const files: Zippable = {};
    for (const entry of entries) {
      if (entry.path in files) throw new Error(`Entrada repetida en el ZIP: «${entry.path}».`);
      files[entry.path] = [entry.content, { level: entry.compress ? 6 : 0 }];
    }
    return Promise.resolve(zipSync(files));
  }
}

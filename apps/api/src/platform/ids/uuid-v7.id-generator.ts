import { Injectable } from '@nestjs/common';
import { asId, type Id, type IdGenerator } from '@nutricoach/shared-kernel';
import { v7 as uuidv7 } from 'uuid';

/** Adaptador del puerto IdGenerator con el paquete `uuid` (06 §4, ADR-003). */
@Injectable()
export class UuidV7IdGenerator implements IdGenerator {
  newId<TBrand extends string>(): Id<TBrand> {
    return asId<TBrand>(uuidv7());
  }
}

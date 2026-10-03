import { Injectable } from '@nestjs/common';
import type { Clock } from '@nutricoach/shared-kernel';

/** Adaptador del puerto Clock: el único lugar de la API que pide la hora al sistema. */
@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

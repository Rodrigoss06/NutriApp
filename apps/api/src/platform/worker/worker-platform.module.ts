import { Module } from '@nestjs/common';
import { EVENT_BUS } from '../events/event-bus.js';
import { OutboxDispatcher } from '../events/outbox-dispatcher.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import {
  createPgBoss,
  DEFAULT_RETRY_POLICY,
  PG_BOSS,
  PgBossEventBus,
  RETRY_POLICY,
} from '../queue/pg-boss.provider.js';
import { WorkerRuntime } from './worker-runtime.js';

/** Lo que solo corre en el worker: pg-boss, despacho del outbox y mantenimiento (01 §4). */
@Module({
  providers: [
    { provide: PG_BOSS, useFactory: () => createPgBoss() },
    { provide: RETRY_POLICY, useValue: DEFAULT_RETRY_POLICY },
    { provide: EVENT_BUS, useClass: PgBossEventBus },
    OutboxDispatcher,
    MaintenanceService,
    WorkerRuntime,
  ],
})
export class WorkerPlatformModule {}

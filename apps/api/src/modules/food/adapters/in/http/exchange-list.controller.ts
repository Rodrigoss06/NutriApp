import { Controller, Get, Req } from '@nestjs/common';
import type { ExchangeListResponse } from '@nutricoach/contracts';
import {
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { FoodQueries } from '../../../application/queries/food.queries.js';

/** GET /api/v1/exchange-lists: las listas de intercambio publicadas, con sus grupos (RN-E11, riesgo R4). */
@Controller('exchange-lists')
export class ExchangeListController {
  constructor(private readonly queries: FoodQueries) {}

  @Get()
  @RequirePermission('catalog.read')
  async list(@Req() request: ContextualRequest): Promise<ExchangeListResponse> {
    const context = request.securityContext;
    if (!context?.organizationId) {
      throw new ProblemException(403, {
        title: 'Elige con qué organización trabajas.',
        code: 'NC-TEN-011',
      });
    }
    const lists = await this.queries.exchangeLists(context);
    return {
      lists: lists.map((list) => ({
        ...list,
        groups: list.groups.map((group) => ({ ...group })),
      })),
    };
  }
}

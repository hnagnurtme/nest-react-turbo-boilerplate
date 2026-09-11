import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '@repo/shared';
import { UUID_REGEX } from '../../common/constants';
import { pageQuerySchema, type PageQuery } from '../../common/dto/page-query.dto';
import { CurrentUser, NoEnvelope } from '../../core/decorators';
import { CheckPolicies, PoliciesGuard } from '../../core/guards';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { createItemSchema, updateItemSchema, type CreateItemDto, type UpdateItemDto } from './dto';
import { ItemsService } from './items.service';

const idSchema = z.string().regex(UUID_REGEX, 'Expected a UUID');

/**
 * The framework's single reference slice (doc 00 section 5). Copy this
 * controller/service/repository/dto trio — including its RLS migration and
 * integration test — to scaffold a new module; `pnpm gen:module` automates
 * exactly that.
 */
@Controller({ path: 'items', version: '1' })
@UseGuards(PoliciesGuard) // JwtAuthGuard runs globally; this adds the ability check on top.
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'Item'))
  list(@Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery) {
    return this.items.list(query);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'Item'))
  findOne(@Param('id', new ZodValidationPipe(idSchema)) id: string) {
    return this.items.getOrThrow(id);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'Item'))
  create(
    @CurrentUser() actor: AuthContext,
    @Body(new ZodValidationPipe(createItemSchema)) dto: CreateItemDto,
  ) {
    return this.items.create(actor, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'Item'))
  update(
    @CurrentUser() actor: AuthContext,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateItemSchema)) dto: UpdateItemDto,
  ) {
    return this.items.update(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @NoEnvelope()
  @CheckPolicies((ability) => ability.can('delete', 'Item'))
  async remove(
    @CurrentUser() actor: AuthContext,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
  ): Promise<void> {
    await this.items.remove(actor, id);
  }
}

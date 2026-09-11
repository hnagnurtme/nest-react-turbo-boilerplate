import { Injectable } from '@nestjs/common';
import { ForbiddenError, subject } from '@casl/ability';
import { buildPaginationMeta, defineAbilityFor, type AuthContext, type PaginatedData } from '@repo/shared';
import type { PageQuery } from '../../common/dto/page-query.dto';
import { ResourceNotFoundError } from '../../core/errors';
import type { Item } from '../../core/database/schema';
import { ItemsRepository } from './items.repository';
import type { CreateItemDto, UpdateItemDto } from './dto';

@Injectable()
export class ItemsService {
  constructor(private readonly repo: ItemsRepository) {}

  async list(query: PageQuery): Promise<PaginatedData<Item>> {
    const { rows, total } = await this.repo.list(query);
    return { items: rows, meta: buildPaginationMeta(query.page, query.limit, total) };
  }

  async getOrThrow(id: string): Promise<Item> {
    const item = await this.repo.findById(id);
    if (!item) throw new ResourceNotFoundError('Item', id);
    return item;
  }

  async create(actor: AuthContext, dto: CreateItemDto): Promise<Item> {
    // tenantId comes from the verified JWT claim, never the request body —
    // RLS's WITH CHECK would reject a mismatched tenant anyway, but the
    // application should never even construct a query that could try.
    if (!actor.tenantId) throw new ResourceNotFoundError('Tenant');
    return this.repo.create({
      tenantId: actor.tenantId,
      title: dto.title,
      description: dto.description,
      createdBy: actor.userId,
    });
  }

  /**
   * CASL checks the action TYPE at the guard (doc 03 section 5.2); this is
   * the second half — checking it against the actual record, which the
   * guard could not have seen before the repository loaded it.
   */
  async update(actor: AuthContext, id: string, dto: UpdateItemDto): Promise<Item> {
    const item = await this.getOrThrow(id);
    const ability = defineAbilityFor(actor);
    ForbiddenError.from(ability).throwUnlessCan('update', subject('Item', item));

    const updated = await this.repo.update(id, dto);
    if (!updated) throw new ResourceNotFoundError('Item', id);
    return updated;
  }

  async remove(actor: AuthContext, id: string): Promise<void> {
    const item = await this.getOrThrow(id);
    const ability = defineAbilityFor(actor);
    ForbiddenError.from(ability).throwUnlessCan('delete', subject('Item', item));

    const removed = await this.repo.softDelete(id);
    if (!removed) throw new ResourceNotFoundError('Item', id);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { parseSort, toOffset, type PageQuery } from '../../common/dto/page-query.dto';
import { TransactionManager } from '../../core/database/transaction.manager';
import { items, type Item, type NewItem } from '../../core/database/schema';

const SORTABLE_FIELDS = ['title', 'createdAt', 'updatedAt'] as const;
const SORT_COLUMNS = { title: items.title, createdAt: items.createdAt, updatedAt: items.updatedAt };

/**
 * The reference repository (doc 02 section 1.1): every query runs inside
 * `runInTenantContext`, and NONE of them filter by `tenant_id` — that
 * omission is deliberate. RLS is the backstop that makes forgetting the
 * filter (which will happen, on some future table) harmless instead of a
 * data breach. See the RLS integration suite in core/database/__tests__.
 */
@Injectable()
export class ItemsRepository {
  constructor(@Inject(TransactionManager) private readonly tx: TransactionManager) {}

  async list(query: PageQuery): Promise<{ rows: Item[]; total: number }> {
    return this.tx.runInTenantContext(async (tx) => {
      const sort = parseSort(query.sort, SORTABLE_FIELDS);
      const orderColumn = sort
        ? SORT_COLUMNS[sort.field as keyof typeof SORT_COLUMNS]
        : items.createdAt;
      const orderFn = sort?.direction === 'asc' ? asc : desc;

      const [rows, countRows] = await Promise.all([
        tx
          .select()
          .from(items)
          .where(isNull(items.deletedAt))
          .orderBy(orderFn(orderColumn))
          .limit(query.limit)
          .offset(toOffset(query.page, query.limit)),
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(items)
          .where(isNull(items.deletedAt)),
      ]);

      return { rows, total: countRows[0]?.count ?? 0 };
    });
  }

  async findById(id: string): Promise<Item | undefined> {
    return this.tx.runInTenantContext(async (tx) => {
      const [row] = await tx
        .select()
        .from(items)
        .where(and(eq(items.id, id), isNull(items.deletedAt)))
        .limit(1);
      return row;
    });
  }

  async create(input: NewItem): Promise<Item> {
    return this.tx.runInTenantContext(async (tx) => {
      const [row] = await tx.insert(items).values(input).returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    });
  }

  async update(id: string, patch: Partial<NewItem>): Promise<Item | undefined> {
    return this.tx.runInTenantContext(async (tx) => {
      const [row] = await tx
        .update(items)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(items.id, id), isNull(items.deletedAt)))
        .returning();
      return row;
    });
  }

  async softDelete(id: string): Promise<boolean> {
    return this.tx.runInTenantContext(async (tx) => {
      const [row] = await tx
        .update(items)
        .set({ deletedAt: new Date() })
        .where(and(eq(items.id, id), isNull(items.deletedAt)))
        .returning({ id: items.id });
      return row !== undefined;
    });
  }
}

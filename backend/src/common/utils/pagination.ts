import { z } from 'zod';

/**
 * Paginação por cursor. Offset é proibido no projeto: `OFFSET 10000`
 * força o Postgres a varrer e descartar 10 mil linhas a cada página.
 */
export const cursorPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.string().cuid().optional(),
});

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Busca `limit + 1` e usa o item extra apenas para saber se há próxima página,
 * evitando um COUNT(*) adicional.
 */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export function cursorArgs(cursor?: string) {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {};
}

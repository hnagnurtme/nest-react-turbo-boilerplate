import type * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '../primitives/button';
import { Skeleton } from '../primitives/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../primitives/table';
import { cn } from '../lib/utils';

export type DataTableColumn<T> = {
  /** Identity of the column; doubles as the property read when `render` is absent. */
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
};

export type DataTableProps<T> = {
  columns: ReadonlyArray<DataTableColumn<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T) => string;
  isLoading?: boolean;
  /** Placeholder rows drawn while loading; match the expected page size. */
  skeletonRows?: number;
  emptyState?: React.ReactNode;
  caption?: string;
  onRowClick?: (row: T) => void;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  className?: string;
};

function defaultCell<T>(row: T, key: string): React.ReactNode {
  const value = (row as Record<string, unknown>)[key];
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return String(value);
  return null;
}

/**
 * Deliberately dependency-free (doc 04 section 2): sorting, filtering and
 * paging are decided by the caller and arrive as already-prepared props.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  skeletonRows = 5,
  emptyState,
  caption,
  onRowClick,
  page,
  totalPages,
  onPageChange,
  className,
}: DataTableProps<T>) {
  const showPagination =
    page !== undefined && totalPages !== undefined && onPageChange !== undefined && totalPages > 1;
  const isEmpty = !isLoading && rows.length === 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="rounded-lg border border-border">
        <Table>
          {caption ? <TableCaption>{caption}</TableCaption> : null}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column.key} className={column.headerClassName}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody aria-busy={isLoading || undefined}>
            {isLoading
              ? Array.from({ length: skeletonRows }, (_, rowIndex) => (
                  <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        <Skeleton className="h-4 w-full max-w-40" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row, rowIndex) => (
                  <TableRow
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={onRowClick ? 'cursor-pointer' : undefined}
                  >
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        {column.render
                          ? column.render(row, rowIndex)
                          : defaultCell(row, column.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

            {isEmpty ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  {emptyState ?? (
                    <p className="py-10 text-center text-sm text-muted-foreground">No results.</p>
                  )}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {showPagination ? (
        <nav className="flex items-center justify-between gap-4" aria-label="Pagination">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

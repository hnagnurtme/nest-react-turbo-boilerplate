import { useState } from 'react';
import { subject } from '@casl/ability';
import { useQueryClient } from '@tanstack/react-query';
import { getItemsQueryKey, useDeleteItem, useItems, type Item } from '@repo/api-contract';
import { PageHeader } from '@repo/ui/composites/page-header';
import { EmptyState } from '@repo/ui/composites/empty-state';
import { DataTable } from '@repo/ui/composites/data-table';
import { ConfirmDialog } from '@repo/ui/composites/confirm-dialog';
import { Button } from '@repo/ui/primitives/button';
import { Can } from '@/features/auth';
import { CreateItemDialog } from '../components/create-item-dialog';

export function ItemsPage() {
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const { data, isLoading } = useItems({ page, limit: 20 });
  const queryClient = useQueryClient();
  const deleteItem = useDeleteItem({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getItemsQueryKey() });
        setPendingDelete(null);
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Items"
        description="Reference slice — copy this to scaffold a new module (doc 09 section 6)."
        actions={
          <Can I="create" a="Item">
            <CreateItemDialog />
          </Can>
        }
      />

      <DataTable<Item>
        rows={data?.items ?? []}
        rowKey={(item) => item.id}
        isLoading={isLoading}
        emptyState={
          <EmptyState title="No items yet" description="Create your first item to get started." />
        }
        columns={[
          { key: 'title', header: 'Title', render: (item) => item.title },
          { key: 'status', header: 'Status', render: (item) => item.status },
          {
            key: 'createdAt',
            header: 'Created',
            render: (item) => new Date(item.createdAt).toLocaleDateString(),
          },
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            render: (item) => (
              <Can
                I="delete"
                a="Item"
                this={subject('Item', { id: item.id, tenantId: item.tenantId })}
              >
                <Button variant="ghost" size="sm" onClick={() => setPendingDelete(item)}>
                  Delete
                </Button>
              </Can>
            ),
          },
        ]}
        page={data?.meta.page}
        totalPages={data?.meta.totalPages}
        onPageChange={setPage}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete item?"
        description={pendingDelete ? `"${pendingDelete.title}" will be permanently deleted.` : ''}
        variant="destructive"
        isLoading={deleteItem.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteItem.mutate({ id: pendingDelete.id });
        }}
      />
    </div>
  );
}

/** PLACEHOLDER hooks — see models/item.ts header. */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { apiMutator } from '../http-mutator';
import type { CreateItemDto, Item, ListItemsParams, UpdateItemDto } from './models/item';
import type { PaginatedData } from '@repo/shared';

export const itemsKeys = {
  all: ['items'] as const,
  list: (params: ListItemsParams) => [...itemsKeys.all, 'list', params] as const,
  detail: (id: string) => [...itemsKeys.all, 'detail', id] as const,
};

export function useItems(
  params: ListItemsParams = {},
  options?: Omit<UseQueryOptions<PaginatedData<Item>>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: itemsKeys.list(params),
    queryFn: () =>
      apiMutator<PaginatedData<Item>>({ url: '/items', method: 'GET', params, paginated: true }),
    ...options,
  });
}

export function useItem(
  id: string,
  options?: Omit<UseQueryOptions<Item>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: itemsKeys.detail(id),
    queryFn: () => apiMutator<Item>({ url: `/items/${id}`, method: 'GET' }),
    enabled: Boolean(id),
    ...options,
  });
}

export function useCreateItem(options?: UseMutationOptions<Item, unknown, CreateItemDto>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiMutator<Item>({ url: '/items', method: 'POST', data }),
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: itemsKeys.all });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export function useUpdateItem(
  id: string,
  options?: UseMutationOptions<Item, unknown, UpdateItemDto>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiMutator<Item>({ url: `/items/${id}`, method: 'PATCH', data }),
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: itemsKeys.all });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export function useDeleteItem(options?: UseMutationOptions<void, unknown, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiMutator<void>({ url: `/items/${id}`, method: 'DELETE' }),
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: itemsKeys.all });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

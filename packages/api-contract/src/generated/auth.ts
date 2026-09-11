/** PLACEHOLDER hooks — see models/item.ts header. */
import { useMutation, useQuery, type UseMutationOptions, type UseQueryOptions } from '@tanstack/react-query';
import { apiMutator } from '../http-mutator';
import type {
  AccessTokenResponseDto,
  LoginDto,
  LoginResponseDto,
  MeResponseDto,
  RefreshResponseDto,
  SwitchTenantDto,
} from './models/auth';

export const authKeys = { me: ['auth', 'me'] as const };

export function useLogin(options?: UseMutationOptions<LoginResponseDto, unknown, LoginDto>) {
  return useMutation({
    mutationFn: (data) =>
      apiMutator<LoginResponseDto>({ url: '/auth/login', method: 'POST', data }),
    ...options,
  });
}

export function useLogout(options?: UseMutationOptions<void, unknown, void>) {
  return useMutation({
    mutationFn: () => apiMutator<void>({ url: '/auth/logout', method: 'POST' }),
    ...options,
  });
}

export function useRefreshToken(options?: UseMutationOptions<RefreshResponseDto, unknown, void>) {
  return useMutation({
    mutationFn: () => apiMutator<RefreshResponseDto>({ url: '/auth/refresh', method: 'POST' }),
    ...options,
  });
}

export function useMe(options?: Omit<UseQueryOptions<MeResponseDto>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: () => apiMutator<MeResponseDto>({ url: '/auth/me', method: 'GET' }),
    retry: false,
    ...options,
  });
}

export function useSwitchTenant(
  options?: UseMutationOptions<AccessTokenResponseDto, unknown, SwitchTenantDto>,
) {
  return useMutation({
    mutationFn: (data) =>
      apiMutator<AccessTokenResponseDto>({ url: '/auth/switch-tenant', method: 'POST', data }),
    ...options,
  });
}

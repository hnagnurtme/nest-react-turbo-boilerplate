/** PLACEHOLDER — see item.ts header. */
export interface UserDto {
  id: string;
  email: string;
  platformRole: 'ADMIN' | 'MEMBER';
}

export interface TenantDto {
  id: string;
  name: string;
  slug: string;
}

export interface MembershipDto {
  id: string;
  tenantId: string;
  role: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface LoginResponseDto {
  accessToken: string;
  csrfToken: string;
  user: UserDto;
  memberships: MembershipDto[];
}

export interface RefreshResponseDto {
  accessToken: string;
  csrfToken: string;
}

/** switch-tenant does not rotate the refresh token, so no new csrfToken is issued. */
export interface AccessTokenResponseDto {
  accessToken: string;
}

export interface MeResponseDto {
  user: UserDto;
  memberships: (MembershipDto & { tenant: TenantDto })[];
}

export interface SwitchTenantDto {
  tenantId: string;
}
